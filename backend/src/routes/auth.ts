import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { db, users, sessions, passwordResets, roles } from '../db/index.js';
import { audit, ctxOf } from '../lib/audit.js';
import { COOKIE_CSRF, COOKIE_TOKEN, hashPassword, randomToken, sha256, signToken, validarSenha, verifyPassword } from '../lib/auth.js';
import { AppError, badRequest, parse, wrap } from '../lib/http.js';
import { authenticate } from '../middleware/auth.js';
import { config } from '../config.js';
import { getConfigs } from '../lib/settings.js';
import { enviarEmail } from '../lib/mail.js';

export const authRouter = Router();
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: config.env === 'test' ? 10_000 : 30, standardHeaders: true, legacyHeaders: false, message: { erro: 'Muitas tentativas. Aguarde alguns minutos.' } });

const MAX_FALHAS = 5;
// Em produção o frontend (Vercel) e a API (Render) ficam em domínios diferentes: o cookie precisa
// de SameSite=None (exige Secure) para ser enviado entre origens. Em dev, same-origin via proxy do Vite, então Lax basta.
const cookieOpts = { httpOnly: true, sameSite: (config.isProd ? 'none' : 'lax') as 'none' | 'lax', secure: config.isProd, path: '/' };

authRouter.post('/login', limiter, wrap(async (req, res) => {
  const { usuario, senha } = parse(z.object({ usuario: z.string().min(1), senha: z.string().min(1) }), req.body);
  const ctx = { userId: null, nome: usuario, ip: req.ip ?? null };
  const [u] = await db.select().from(users).where(or(eq(users.username, usuario.toLowerCase()), eq(users.email, usuario.toLowerCase())));
  const falha = async (motivo: string) => {
    await audit(db, { ...ctx, userId: u?.id ?? null }, { acao: 'LOGIN_FAILED', modulo: 'Autenticação', registroId: u?.id, rotulo: usuario, info: { motivo } });
    throw new AppError(401, 'Usuário ou senha inválidos.');
  };
  if (!u) return falha('usuário inexistente');
  if (!u.ativo) return falha('usuário desativado');
  if (u.lockedUntil && u.lockedUntil > new Date()) throw new AppError(423, 'Conta temporariamente bloqueada por tentativas inválidas. Tente novamente em alguns minutos.');
  if (!(await verifyPassword(senha, u.passwordHash))) {
    const falhas = u.failedLogins + 1;
    await db.update(users).set({ failedLogins: falhas, lockedUntil: falhas >= MAX_FALHAS ? new Date(Date.now() + 15 * 60_000) : null }).where(eq(users.id, u.id));
    return falha('senha incorreta');
  }
  const horas = Number((await getConfigs())['sessao.horas'] ?? config.sessionHours);
  const sid = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + horas * 3600_000);
  await db.insert(sessions).values({ id: sid, userId: u.id, expiresAt, ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 250) });
  await db.update(users).set({ lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null }).where(eq(users.id, u.id));
  await audit(db, { userId: u.id, nome: u.nome, ip: req.ip ?? null }, { acao: 'LOGIN', modulo: 'Autenticação', registroId: u.id, rotulo: u.username });
  const csrfToken = randomToken(16);
  res.cookie(COOKIE_TOKEN, signToken(u.id, sid, horas * 3600), { ...cookieOpts, maxAge: horas * 3600_000 });
  res.cookie(COOKIE_CSRF, csrfToken, { ...cookieOpts, httpOnly: false, maxAge: horas * 3600_000 });
  // O token também vai no corpo: com frontend e API em domínios diferentes, o JS do frontend não
  // consegue ler via document.cookie um cookie pertencente ao domínio da API (isolamento por origem).
  res.json({ ok: true, mustChangePassword: u.mustChangePassword, csrfToken });
}));

authRouter.post('/logout', authenticate, wrap(async (req, res) => {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, req.user!.sessionId));
  await audit(db, ctxOf(req), { acao: 'LOGOUT', modulo: 'Autenticação', registroId: req.user!.id, rotulo: req.user!.username });
  res.clearCookie(COOKIE_TOKEN, cookieOpts); res.clearCookie(COOKIE_CSRF, { ...cookieOpts, httpOnly: false });
  res.json({ ok: true });
}));

authRouter.get('/me', authenticate, wrap(async (req, res) => {
  const u = req.user!;
  // Reenvia o csrfToken atual (cookie) no corpo, para o frontend guardar em memória — ver comentário no /login.
  res.json({ id: u.id, nome: u.nome, username: u.username, email: u.email, perfil: u.roleNome, mustChangePassword: u.mustChangePassword, permissoes: [...u.permissions], pertenceApd: u.pertenceApd, convidado: u.convidado, acessoIds: u.acessoIds, csrfToken: req.cookies?.[COOKIE_CSRF] });
}));

authRouter.post('/change-password', authenticate, wrap(async (req, res) => {
  const { senhaAtual, novaSenha } = parse(z.object({ senhaAtual: z.string(), novaSenha: z.string() }), req.body);
  const [u] = await db.select().from(users).where(eq(users.id, req.user!.id));
  if (!(await verifyPassword(senhaAtual, u.passwordHash))) throw badRequest('Senha atual incorreta.');
  const erro = validarSenha(novaSenha); if (erro) throw badRequest(erro);
  if (senhaAtual === novaSenha) throw badRequest('A nova senha deve ser diferente da atual.');
  await db.update(users).set({ passwordHash: await hashPassword(novaSenha), mustChangePassword: false }).where(eq(users.id, u.id));
  // encerra as demais sessões
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, u.id), isNull(sessions.revokedAt)));
  await audit(db, ctxOf(req), { acao: 'PASSWORD_RESET', modulo: 'Autenticação', registroId: u.id, rotulo: u.username, info: { origem: 'troca pelo próprio usuário' } });
  res.clearCookie(COOKIE_TOKEN, cookieOpts); res.clearCookie(COOKIE_CSRF, { ...cookieOpts, httpOnly: false });
  res.json({ ok: true, mensagem: 'Senha alterada. Entre novamente.' });
}));

// Recuperação de senha — resposta sempre igual para não revelar se o e-mail existe
authRouter.post('/forgot-password', limiter, wrap(async (req, res) => {
  const { usuario } = parse(z.object({ usuario: z.string().min(1) }), req.body);
  const [u] = await db.select().from(users).where(and(eq(users.ativo, true), or(eq(users.username, usuario.toLowerCase()), eq(users.email, usuario.toLowerCase()))));
  if (u) {
    const token = randomToken(32);
    await db.insert(passwordResets).values({ userId: u.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60_000) });
    const link = `${config.appUrl}/redefinir-senha?token=${token}`;
    await enviarEmail(u.email, 'Controle BSC — redefinição de senha', `Olá, ${u.nome}.\n\nPara redefinir sua senha acesse (válido por 1 hora):\n${link}\n\nSe não foi você, ignore esta mensagem.`);
  }
  res.json({ ok: true, mensagem: 'Se o usuário existir, enviaremos as instruções para o e-mail cadastrado.' });
}));

authRouter.post('/reset-password', limiter, wrap(async (req, res) => {
  const { token, novaSenha } = parse(z.object({ token: z.string().min(10), novaSenha: z.string() }), req.body);
  const erro = validarSenha(novaSenha); if (erro) throw badRequest(erro);
  const [r] = await db.select().from(passwordResets).where(and(eq(passwordResets.tokenHash, sha256(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())));
  if (!r) throw badRequest('Link inválido ou expirado.');
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: await hashPassword(novaSenha), mustChangePassword: false, failedLogins: 0, lockedUntil: null }).where(eq(users.id, r.userId));
    await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, r.id));
    await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, r.userId), isNull(sessions.revokedAt)));
    await audit(tx, { userId: r.userId, nome: null, ip: req.ip ?? null }, { acao: 'PASSWORD_RESET', modulo: 'Autenticação', registroId: r.userId, info: { origem: 'link de recuperação' } });
  });
  res.json({ ok: true });
}));

void roles;
