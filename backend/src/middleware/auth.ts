import type { NextFunction, Request, Response } from 'express';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, users, roles, sessions, rolePermissions, permissions, confidencialidades } from '../db/index.js';
import { COOKIE_CSRF, COOKIE_TOKEN, verifyToken } from '../lib/auth.js';
import { AppError, forbidden } from '../lib/http.js';

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE_TOKEN];
    if (!token) throw new AppError(401, 'Sessão não iniciada.');
    let payload: { sub: string; sid: string };
    try { payload = verifyToken(token); } catch { throw new AppError(401, 'Sessão expirada. Entre novamente.'); }
    const [row] = await db.select({
      id: users.id, nome: users.nome, username: users.username, email: users.email, ativo: users.ativo,
      roleId: users.roleId, roleNome: roles.nome, roleAtivo: roles.ativo, must: users.mustChangePassword, convidado: roles.convidado, apd: users.pertenceApd,
    }).from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(and(eq(sessions.id, payload.sid), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
    if (!row || !row.ativo || !row.roleAtivo) throw new AppError(401, 'Sessão inválida ou usuário desativado.');
    const perms = await db.select({ c: permissions.codigo }).from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId)).where(eq(rolePermissions.roleId, row.roleId));
    // Política de confidencialidade: Livre = todos · Interno URBS = todos, exceto convidado · Interno APD = só APD/UPD
    const niveis = await db.select({ id: confidencialidades.id, regra: confidencialidades.regraAcesso }).from(confidencialidades);
    const total = row.roleNome === 'ADMINISTRADOR';
    const acessoIds = niveis.filter((n) => total || row.apd ? true : row.convidado ? n.regra === 'TODOS' : n.regra !== 'EQUIPE_APD').map((n) => n.id);
    req.user = {
      acessoIds, convidado: row.convidado, pertenceApd: row.apd || total,
      id: row.id, nome: row.nome, username: row.username, email: row.email, roleId: row.roleId, roleNome: row.roleNome,
      permissions: new Set(perms.map((p) => p.c)), sessionId: payload.sid, mustChangePassword: row.must,
    };
    next();
  } catch (e) { next(e); }
}

/** Bloqueia o uso do sistema enquanto a troca de senha obrigatória não for feita. */
export function blockIfMustChange(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.mustChangePassword && !req.path.startsWith('/auth')) return next(forbidden('Troque sua senha para continuar.'));
  next();
}

export const requirePerm = (...codes: string[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new AppError(401, 'Sessão não iniciada.'));
  if (codes.some((c) => req.user!.permissions.has(c))) return next();
  next(forbidden());
};
export const can = (req: Request, code: string) => !!req.user?.permissions.has(code);

/** CSRF (double-submit): métodos que alteram dados exigem o cabeçalho X-CSRF-Token igual ao cookie. */
const CSRF_IGNORE = ['/api/auth/login', '/api/auth/forgot-password', '/api/auth/reset-password'];
export function csrf(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || CSRF_IGNORE.includes(req.originalUrl.split('?')[0])) return next();
  const c = req.cookies?.[COOKIE_CSRF]; const h = req.get('x-csrf-token');
  if (!c || !h || c !== h) return next(forbidden('Token CSRF inválido.'));
  next();
}
