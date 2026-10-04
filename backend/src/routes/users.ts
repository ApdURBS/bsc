import { Router } from 'express';
import { z } from 'zod';
import { and, asc, count, eq, ilike, or, isNull } from 'drizzle-orm';
import { db, users, roles, rolePermissions, permissions, sessions } from '../db/index.js';
import { audit, auditDiff, ctxOf } from '../lib/audit.js';
import { hashPassword, validarSenha } from '../lib/auth.js';
import { badRequest, conflict, notFound, pageSchema, parse, wrap, optStr } from '../lib/http.js';
import { requirePerm } from '../middleware/auth.js';

export const usersRouter = Router();
const userCols = {
  id: users.id, username: users.username, email: users.email, nome: users.nome, ativo: users.ativo,
  roleId: users.roleId, perfil: roles.nome, pertenceApd: users.pertenceApd, convidado: roles.convidado, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt,
};

usersRouter.get('/', requirePerm('users.view'), wrap(async (req, res) => {
  const q = parse(pageSchema.extend({ busca: optStr }), req.query);
  const where = q.busca ? or(ilike(users.nome, `%${q.busca}%`), ilike(users.username, `%${q.busca}%`), ilike(users.email, `%${q.busca}%`)) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(users).where(where);
  const itens = await db.select(userCols).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(where)
    .orderBy(asc(users.nome)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  res.json({ itens, total, page: q.page, pageSize: q.pageSize });
}));

const criar = z.object({
  nome: z.string().trim().min(2), username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, 'Usuário: 3-40 caracteres (letras, números, . _ -)'),
  email: z.string().trim().toLowerCase().email(), senha: z.string(), roleId: z.coerce.number().int(), pertenceApd: z.boolean().optional(),
});

// Pessoas selecionáveis como Dono / Scrum Master / equipe / responsável: usuários ativos da APD/UPD
usersRouter.get('/pessoas', requirePerm('projects.view', 'stages.view', 'activities.view', 'users.view'), wrap(async (_req, res) => {
  res.json(await db.select({ id: users.id, nome: users.nome, username: users.username }).from(users).where(and(eq(users.ativo, true), eq(users.pertenceApd, true))).orderBy(users.nome));
}));

usersRouter.post('/', requirePerm('users.create'), wrap(async (req, res) => {
  const d = parse(criar, req.body);
  const erro = validarSenha(d.senha); if (erro) throw badRequest(erro);
  const [role] = await db.select().from(roles).where(and(eq(roles.id, d.roleId), eq(roles.ativo, true)));
  if (!role) throw badRequest('Perfil inválido.');
  const [dup] = await db.select({ id: users.id }).from(users).where(or(eq(users.username, d.username), eq(users.email, d.email)));
  if (dup) throw conflict('Já existe usuário com este login ou e-mail.');
  const [u] = await db.transaction(async (tx) => {
    const r = await tx.insert(users).values({ nome: d.nome, username: d.username, email: d.email, roleId: d.roleId, pertenceApd: d.pertenceApd ?? false, passwordHash: await hashPassword(d.senha), mustChangePassword: true }).returning({ id: users.id });
    await audit(tx, ctxOf(req), { acao: 'USER_CREATE', modulo: 'Usuários', registroId: r[0].id, rotulo: d.username, info: { perfil: role.nome, email: d.email } });
    return r;
  });
  res.status(201).json({ id: u.id });
}));

const editar = z.object({
  nome: z.string().trim().min(2).optional(), email: z.string().trim().toLowerCase().email().optional(),
  roleId: z.coerce.number().int().optional(), pertenceApd: z.boolean().optional(), ativo: z.boolean().optional(), novaSenha: z.string().optional(),
});

usersRouter.patch('/:id', requirePerm('users.update'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const d = parse(editar, req.body);
  const [antes] = await db.select({ ...userCols }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.id, id));
  if (!antes) throw notFound('Usuário');
  if (id === req.user!.id && d.ativo === false) throw badRequest('Você não pode desativar o próprio usuário.');
  if (id === req.user!.id && d.roleId && d.roleId !== antes.roleId) throw badRequest('Você não pode alterar o próprio perfil.');
  if (d.roleId) { const [r] = await db.select().from(roles).where(and(eq(roles.id, d.roleId), eq(roles.ativo, true))); if (!r) throw badRequest('Perfil inválido.'); }
  const set: Partial<typeof users.$inferInsert> = {};
  if (d.nome !== undefined) set.nome = d.nome;
  if (d.email !== undefined) set.email = d.email;
  if (d.pertenceApd !== undefined) set.pertenceApd = d.pertenceApd;
  if (d.roleId !== undefined) set.roleId = d.roleId;
  if (d.ativo !== undefined) set.ativo = d.ativo;
  if (d.novaSenha) { const e = validarSenha(d.novaSenha); if (e) throw badRequest(e); set.passwordHash = await hashPassword(d.novaSenha); set.mustChangePassword = true; set.failedLogins = 0; set.lockedUntil = null; }
  await db.transaction(async (tx) => {
    if (Object.keys(set).length) await tx.update(users).set(set).where(eq(users.id, id));
    const ctx = ctxOf(req);
    if (d.roleId && d.roleId !== antes.roleId) {
      const [nr] = await tx.select().from(roles).where(eq(roles.id, d.roleId));
      await audit(tx, ctx, { acao: 'PERMISSION_CHANGE', modulo: 'Usuários', registroId: id, rotulo: antes.username, campo: 'Perfil', anterior: antes.perfil, novo: nr.nome });
    }
    await auditDiff(tx, ctx, { modulo: 'Usuários', registroId: id, rotulo: antes.username, before: { nome: antes.nome, email: antes.email, ativo: antes.ativo, pertenceApd: antes.pertenceApd }, after: { nome: d.nome ?? antes.nome, email: d.email ?? antes.email, ativo: d.ativo ?? antes.ativo, pertenceApd: d.pertenceApd ?? antes.pertenceApd }, labels: { nome: 'Nome', email: 'E-mail', ativo: 'Ativo', pertenceApd: 'Pertence à APD/UPD' }, acaoUpdate: 'USER_UPDATE' });
    if (d.novaSenha) await audit(tx, ctx, { acao: 'USER_UPDATE', modulo: 'Usuários', registroId: id, rotulo: antes.username, campo: 'Senha', info: { origem: 'redefinida pelo administrador' } });
    if (d.ativo === false || d.novaSenha) await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)));
  });
  res.json({ ok: true });
}));

// ─────────────── Perfis e permissões ───────────────
export const rolesRouter = Router();

rolesRouter.get('/permissions', requirePerm('roles.manage', 'users.view'), wrap(async (_req, res) => {
  res.json(await db.select().from(permissions).orderBy(asc(permissions.modulo), asc(permissions.codigo)));
}));

rolesRouter.get('/', requirePerm('roles.manage', 'users.view'), wrap(async (_req, res) => {
  const rs = await db.select().from(roles).orderBy(asc(roles.id));
  const rp = await db.select({ roleId: rolePermissions.roleId, codigo: permissions.codigo }).from(rolePermissions).innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId));
  const uc = await db.select({ roleId: users.roleId, n: count() }).from(users).groupBy(users.roleId);
  res.json(rs.map((r) => ({ ...r, permissoes: rp.filter((x) => x.roleId === r.id).map((x) => x.codigo), usuarios: uc.find((x) => x.roleId === r.id)?.n ?? 0 })));
}));

const roleBody = z.object({ nome: z.string().trim().min(2).transform((s) => s.toUpperCase()), descricao: z.string().optional().nullable(), convidado: z.boolean().optional(), permissoes: z.array(z.string()), ativo: z.boolean().optional() });

async function salvarPermissoes(tx: any, roleId: number, codigos: string[]) {
  const all = await tx.select().from(permissions);
  const ids = all.filter((p: any) => codigos.includes(p.codigo)).map((p: any) => p.id);
  if (ids.length !== new Set(codigos).size) throw badRequest('Permissão inexistente informada.');
  await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  if (ids.length) await tx.insert(rolePermissions).values(ids.map((permissionId: number) => ({ roleId, permissionId })));
}

rolesRouter.post('/', requirePerm('roles.manage'), wrap(async (req, res) => {
  const d = parse(roleBody, req.body);
  const [dup] = await db.select().from(roles).where(eq(roles.nome, d.nome)); if (dup) throw conflict('Já existe um perfil com este nome.');
  const id = await db.transaction(async (tx) => {
    const [r] = await tx.insert(roles).values({ nome: d.nome, descricao: d.descricao ?? null, convidado: d.convidado ?? false }).returning({ id: roles.id });
    await salvarPermissoes(tx, r.id, d.permissoes);
    await audit(tx, ctxOf(req), { acao: 'PERMISSION_CHANGE', modulo: 'Perfis', registroId: r.id, rotulo: d.nome, campo: 'Permissões', novo: d.permissoes.join(', '), info: { evento: 'perfil criado' } });
    return r.id;
  });
  res.status(201).json({ id });
}));

rolesRouter.put('/:id', requirePerm('roles.manage'), wrap(async (req, res) => {
  const id = Number(req.params.id); const d = parse(roleBody, req.body);
  const [r] = await db.select().from(roles).where(eq(roles.id, id)); if (!r) throw notFound('Perfil');
  if (r.sistema && d.nome !== r.nome) throw badRequest('Perfis nativos não podem ser renomeados.');
  if (r.nome === 'ADMINISTRADOR') throw badRequest('O perfil ADMINISTRADOR sempre possui todas as permissões.');
  const atuais = (await db.select({ c: permissions.codigo }).from(rolePermissions).innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId)).where(eq(rolePermissions.roleId, id))).map((x) => x.c).sort();
  await db.transaction(async (tx) => {
    await tx.update(roles).set({ nome: d.nome, descricao: d.descricao ?? null, convidado: d.convidado ?? r.convidado, ativo: d.ativo ?? r.ativo }).where(eq(roles.id, id));
    await salvarPermissoes(tx, id, d.permissoes);
    const novas = [...d.permissoes].sort();
    if (atuais.join() !== novas.join()) {
      await audit(tx, ctxOf(req), { acao: 'PERMISSION_CHANGE', modulo: 'Perfis', registroId: id, rotulo: d.nome, campo: 'Permissões',
        anterior: atuais.join(', '), novo: novas.join(', '), info: { adicionadas: novas.filter((x) => !atuais.includes(x)), removidas: atuais.filter((x) => !novas.includes(x)) } });
    }
  });
  res.json({ ok: true });
}));
