import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, notificacoes, alertas, users } from '../db/index.js';
import { audit, ctxOf } from '../lib/audit.js';
import { badRequest, notFound, optStr, pageSchema, parse, wrap } from '../lib/http.js';
import { requirePerm } from '../middleware/auth.js';
import { FREQUENCIAS, TIPOS_ALERTA, gerarNotificacoes } from '../lib/alertas.js';

// ───────────── Central de notificações (do usuário logado) ─────────────
export const notificationsRouter = Router();
const listQ = pageSchema.extend({ naoLidas: optStr });

notificationsRouter.get('/', wrap(async (req, res) => {
  const q = parse(listQ, req.query);
  const w = and(eq(notificacoes.userId, req.user!.id), q.naoLidas ? isNull(notificacoes.lidaEm) : undefined);
  const [{ n }] = await db.select({ n: count() }).from(notificacoes).where(w);
  const [{ nl }] = await db.select({ nl: count() }).from(notificacoes).where(and(eq(notificacoes.userId, req.user!.id), isNull(notificacoes.lidaEm)));
  const itens = await db.select().from(notificacoes).where(w).orderBy(desc(notificacoes.createdAt), desc(notificacoes.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  res.json({ itens, total: n, naoLidas: nl, page: q.page, pageSize: q.pageSize });
}));
notificationsRouter.get('/count', wrap(async (req, res) => {
  const [{ nl }] = await db.select({ nl: count() }).from(notificacoes).where(and(eq(notificacoes.userId, req.user!.id), isNull(notificacoes.lidaEm)));
  res.json({ naoLidas: nl });
}));
notificationsRouter.post('/read-all', wrap(async (req, res) => {
  await db.update(notificacoes).set({ lidaEm: new Date() }).where(and(eq(notificacoes.userId, req.user!.id), isNull(notificacoes.lidaEm)));
  res.json({ ok: true });
}));
notificationsRouter.post('/:id/read', wrap(async (req, res) => {
  const r = await db.update(notificacoes).set({ lidaEm: new Date() }).where(and(eq(notificacoes.id, Number(req.params.id)), eq(notificacoes.userId, req.user!.id))).returning({ id: notificacoes.id });
  if (!r.length) throw notFound('Notificação');
  res.json({ ok: true });
}));

// ───────────── Regras de alerta (administração) ─────────────
export const alertsRouter = Router();
alertsRouter.use(requirePerm('settings.manage'));
const regraBody = z.object({
  nome: z.string().trim().min(3, 'Informe o nome da regra.').max(120),
  tipo: z.enum(TIPOS_ALERTA),
  antecedenciaDias: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().int().min(0).max(3650).optional()),
  frequencia: z.enum(FREQUENCIAS).default('DIARIA'),
  destinatarios: z.object({ participantes: z.boolean().default(true), userIds: z.array(z.coerce.number().int()).default([]) }).default({ participantes: true, userIds: [] }),
  ativo: z.boolean().default(true),
});
const TIPOS_COM_DIAS = ['PRAZO_PROXIMO', 'SEM_MOVIMENTACAO', 'ETAPAS_ATRASADAS_USUARIO'];

async function checar(d: z.infer<typeof regraBody>) {
  if (TIPOS_COM_DIAS.includes(d.tipo) && d.antecedenciaDias == null) throw badRequest(d.tipo === 'ETAPAS_ATRASADAS_USUARIO' ? 'Informe a quantidade mínima de etapas atrasadas.' : 'Informe o número de dias.');
  if (d.destinatarios.userIds.length) {
    const ok = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, d.destinatarios.userIds), eq(users.ativo, true)));
    if (ok.length !== new Set(d.destinatarios.userIds).size) throw badRequest('Destinatário inválido ou inativo.');
  }
  if (!d.destinatarios.participantes && !d.destinatarios.userIds.length) throw badRequest('Escolha ao menos um destinatário.');
}

alertsRouter.get('/', wrap(async (_req, res) => { res.json(await db.select().from(alertas).orderBy(alertas.id)); }));
alertsRouter.post('/', wrap(async (req, res) => {
  const d = parse(regraBody, req.body); await checar(d);
  const [r] = await db.insert(alertas).values({ ...d, antecedenciaDias: d.antecedenciaDias ?? null, destinatarios: d.destinatarios as any }).returning();
  await audit(db, ctxOf(req), { acao: 'CREATE', modulo: 'Alertas', registroId: r.id, rotulo: r.nome, novo: `${r.tipo} · ${r.frequencia}` });
  res.status(201).json(r);
}));
alertsRouter.patch('/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [antes] = await db.select().from(alertas).where(eq(alertas.id, id)); if (!antes) throw notFound('Regra de alerta');
  const d = parse(regraBody, { ...antes, destinatarios: antes.destinatarios ?? undefined, ...req.body }); await checar(d);
  await db.update(alertas).set({ ...d, antecedenciaDias: d.antecedenciaDias ?? null, destinatarios: d.destinatarios as any, updatedAt: new Date() }).where(eq(alertas.id, id));
  await audit(db, ctxOf(req), { acao: 'UPDATE', modulo: 'Alertas', registroId: id, rotulo: d.nome, novo: `${d.tipo} · ${d.frequencia} · ${d.antecedenciaDias ?? '—'} · ${d.ativo ? 'ativa' : 'inativa'}` });
  res.json({ ok: true });
}));
alertsRouter.delete('/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [antes] = await db.select().from(alertas).where(eq(alertas.id, id)); if (!antes) throw notFound('Regra de alerta');
  await db.delete(alertas).where(eq(alertas.id, id));
  await audit(db, ctxOf(req), { acao: 'DELETE', modulo: 'Alertas', registroId: id, rotulo: antes.nome, anterior: antes.tipo });
  res.json({ ok: true });
}));
alertsRouter.post('/run', wrap(async (_req, res) => { res.json(await gerarNotificacoes()); }));
void sql;
