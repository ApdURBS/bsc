import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, gte, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import { db, auditLogs, configuracoes, projetos, etapas, atividades, statusTbl, frentes, movimentacoes, users, tiposMovimentacao } from '../db/index.js';
import { audit, ctxOf } from '../lib/audit.js';
import { badRequest, optDate, optInt, optStr, pageSchema, parse, wrap } from '../lib/http.js';
import { requirePerm } from '../middleware/auth.js';
import { CONFIG_PADRAO } from '../db/catalog.js';
import { getConfigs, getPrazoCfg, invalidateConfigs } from '../lib/settings.js';
import { CARDS, condAcesso, condCard } from '../lib/projetos.js';
import { condSituacao, hoje, somaDias } from '../lib/prazo.js';

// ───────────── Auditoria (log completo — somente perfis com audit.view) ─────────────
export const auditRouter = Router();
const ACOES = ['LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'DOCUMENT_UPLOAD', 'DOCUMENT_DELETE', 'USER_CREATE', 'USER_UPDATE', 'PERMISSION_CHANGE', 'PASSWORD_RESET'] as const;
auditRouter.get('/', requirePerm('audit.view'), wrap(async (req, res) => {
  const q = parse(pageSchema.extend({ userId: optInt, projetoId: optInt, modulo: optStr, acao: z.preprocess((v) => (v === '' ? undefined : v), z.enum(ACOES).optional()), de: optDate, ate: optDate, busca: optStr }), req.query);
  const tz = process.env.TZ ?? 'America/Sao_Paulo';
  const w: (SQL | undefined)[] = [];
  if (q.userId) w.push(eq(auditLogs.userId, q.userId));
  if (q.projetoId) w.push(eq(auditLogs.projetoId, q.projetoId));
  if (q.modulo) w.push(eq(auditLogs.modulo, q.modulo));
  if (q.acao) w.push(eq(auditLogs.acao, q.acao));
  if (q.de) w.push(gte(auditLogs.dataHora, sql`(${q.de}::date)::timestamp AT TIME ZONE ${tz}`));
  if (q.ate) w.push(lt(auditLogs.dataHora, sql`((${q.ate}::date + 1)::timestamp) AT TIME ZONE ${tz}`));
  if (q.busca) { const b = `%${q.busca}%`; w.push(or(ilike(auditLogs.registroRotulo, b), ilike(auditLogs.campo, b), ilike(auditLogs.valorNovo, b), ilike(auditLogs.valorAnterior, b), ilike(auditLogs.usuarioNome, b))); }
  const where = and(...w);
  const [{ n }] = await db.select({ n: count() }).from(auditLogs).where(where);
  const itens = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.dataHora), desc(auditLogs.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  res.json({ itens, total: n, page: q.page, pageSize: q.pageSize });
}));
auditRouter.get('/facets', requirePerm('audit.view'), wrap(async (_req, res) => {
  const m = await db.selectDistinct({ modulo: auditLogs.modulo }).from(auditLogs);
  res.json({ modulos: m.map((x) => x.modulo).sort(), acoes: ACOES });
}));

// ───────────── Configurações do sistema ─────────────
export const settingsRouter = Router();
settingsRouter.get('/public', wrap(async (_req, res) => { const c = await getPrazoCfg(); res.json(c); }));
settingsRouter.get('/', requirePerm('settings.manage'), wrap(async (_req, res) => {
  const c = await getConfigs(true);
  res.json(Object.entries(CONFIG_PADRAO).map(([chave, v]) => ({ chave, valor: c[chave], padrao: v.valor, descricao: v.descricao })));
}));
settingsRouter.put('/:chave', requirePerm('settings.manage'), wrap(async (req, res) => {
  const chave = req.params.chave; if (!(chave in CONFIG_PADRAO)) throw badRequest('Configuração desconhecida.');
  const { valor } = parse(z.object({ valor: z.coerce.number().int().min(1).max(3650) }), req.body);
  const atual = (await getConfigs(true))[chave];
  if (chave === 'prazo.dias_critico' && valor >= Number((await getConfigs())['prazo.dias_atencao'])) throw badRequest('O limite de prazo crítico deve ser menor que o de atenção.');
  if (chave === 'prazo.dias_atencao' && valor <= Number((await getConfigs())['prazo.dias_critico'])) throw badRequest('O limite de atenção deve ser maior que o de prazo crítico.');
  await db.transaction(async (tx) => {
    await tx.insert(configuracoes).values({ chave, valor, descricao: CONFIG_PADRAO[chave].descricao }).onConflictDoUpdate({ target: configuracoes.chave, set: { valor, updatedAt: new Date() } });
    await audit(tx, ctxOf(req), { acao: 'UPDATE', modulo: 'Configurações', registroId: chave, rotulo: chave, campo: CONFIG_PADRAO[chave].descricao, anterior: atual as any, novo: valor });
  });
  invalidateConfigs();
  res.json({ ok: true });
}));

// ───────────── Dashboard (indicadores reais do banco; cada card corresponde a um filtro da lista) ─────────────
export const dashboardRouter = Router();
dashboardRouter.get('/summary', requirePerm('dashboard.view'), wrap(async (req, res) => {
  const cfg = await getPrazoCfg();
  const today = hoje();
  const acesso = condAcesso(req.user!);
  const base = and(eq(projetos.ativo, true), acesso);
  const from = () => db.select().from(projetos).innerJoin(statusTbl, eq(statusTbl.id, projetos.statusId));
  void from;
  const counts: Record<string, number> = {};
  const fields: Record<string, SQL<number>> = {};
  for (const c of CARDS) fields[c] = sql<number>`count(*) filter (where ${condCard(c, cfg)})`;
  const [row] = await db.select(fields).from(projetos).innerJoin(statusTbl, eq(statusTbl.id, projetos.statusId)).where(base);
  for (const c of CARDS) counts[c] = Number(row[c]);

  const porFrente = await db.select({
    id: frentes.id, codigo: frentes.codigo, nome: frentes.nome, ordem: frentes.ordem,
    total: sql<number>`count(${projetos.id})`,
    vigentes: sql<number>`count(*) filter (where ${projetos.id} is not null and ${statusTbl.classificacao} not in ('CONCLUIDO','CANCELADO'))`,
    finalizados: sql<number>`count(*) filter (where ${statusTbl.classificacao} = 'CONCLUIDO')`,
  }).from(frentes).leftJoin(projetos, and(eq(projetos.frenteId, frentes.id), eq(projetos.ativo, true), acesso)).leftJoin(statusTbl, eq(statusTbl.id, projetos.statusId))
    .where(eq(frentes.ativo, true)).groupBy(frentes.id).orderBy(frentes.ordem, frentes.id);

  const b = (min: number, max: number | null) => sql<number>`count(*) filter (where ${statusTbl.classificacao} not in ('CONCLUIDO','CANCELADO') and ${projetos.dataPrevista} >= ${somaDias(today, min)}::date ${max == null ? sql`` : sql`and ${projetos.dataPrevista} <= ${somaDias(today, max)}::date`})`;
  const [pz] = await db.select({
    vencidos: sql<number>`count(*) filter (where ${condSituacao('VENCIDO', projetos.dataPrevista, statusTbl.classificacao, cfg)})`,
    ate7: b(0, 7), ate15: b(8, 15), ate30: b(16, 30), ate60: b(31, 60), ate90: b(61, 90), mais90: b(91, null),
    semPrazo: sql<number>`count(*) filter (where ${condSituacao('SEM_PRAZO', projetos.dataPrevista, statusTbl.classificacao, cfg)})`,
  }).from(projetos).innerJoin(statusTbl, eq(statusTbl.id, projetos.statusId)).where(base);

  const recentes = await db.select({ id: movimentacoes.id, dataHora: movimentacoes.dataHora, descricao: movimentacoes.descricao, usuario: users.nome, tipo: tiposMovimentacao.nome, projetoId: projetos.id, projetoCodigo: projetos.codigo, projetoNome: projetos.nome })
    .from(movimentacoes).innerJoin(projetos, eq(projetos.id, movimentacoes.projetoId)).innerJoin(users, eq(users.id, movimentacoes.usuarioId)).innerJoin(tiposMovimentacao, eq(tiposMovimentacao.id, movimentacoes.tipoId))
    .where(acesso).orderBy(desc(movimentacoes.dataHora)).limit(8);

  res.json({
    cards: counts,
    porFrente: porFrente.map((f) => ({ ...f, total: Number(f.total), vigentes: Number(f.vigentes), finalizados: Number(f.finalizados) })),
    prazos: Object.fromEntries(Object.entries(pz).map(([k, v]) => [k, Number(v)])),
    atividadesRecentes: recentes, diasInatividade: cfg.diasInatividade,
  });
}));

// ───────────── Busca global ─────────────
export const searchRouter = Router();
searchRouter.get('/', requirePerm('projects.view'), wrap(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 1) return res.json({ projetos: [], etapas: [], atividades: [] });
  const b = `%${q}%`;
  const ps = await db.select({ id: projetos.id, codigo: projetos.codigo, nome: projetos.nome, frente: frentes.nome, status: statusTbl.nome })
    .from(projetos).innerJoin(frentes, eq(frentes.id, projetos.frenteId)).innerJoin(statusTbl, eq(statusTbl.id, projetos.statusId))
    .where(and(eq(projetos.ativo, true), condAcesso(req.user!), or(ilike(projetos.codigo, b), ilike(projetos.nome, b), ilike(frentes.nome, b), ilike(statusTbl.nome, b),
      sql`EXISTS (SELECT 1 FROM users c WHERE c.id = ${projetos.donoId} AND c.nome ILIKE ${b})`,
      sql`EXISTS (SELECT 1 FROM etapas e JOIN users c ON c.id = e.scrum_master_id WHERE e.projeto_id = ${projetos.id} AND e.ativo AND c.nome ILIKE ${b})`,
      sql`EXISTS (SELECT 1 FROM etapas e JOIN etapa_membros em ON em.etapa_id = e.id JOIN users c ON c.id = em.user_id WHERE e.projeto_id = ${projetos.id} AND e.ativo AND c.nome ILIKE ${b})`)))
    .orderBy(frentes.ordem, projetos.sequencia).limit(8);
  const es = await db.select({ id: etapas.id, projetoId: projetos.id, codigo: sql<string>`${projetos.codigo} || ' ' || ${etapas.letra}`, nome: etapas.nome })
    .from(etapas).innerJoin(projetos, eq(projetos.id, etapas.projetoId))
    .where(and(eq(etapas.ativo, true), eq(projetos.ativo, true), condAcesso(req.user!), or(ilike(etapas.nome, b), sql`(${projetos.codigo} || ' ' || ${etapas.letra}) ILIKE ${b}`, sql`${projetos.codigo} ILIKE ${b}`)))
    .orderBy(projetos.sequencia, etapas.ordem).limit(8);
  const as_ = await db.select({ id: atividades.id, projetoId: projetos.id, codigo: sql<string>`${projetos.codigo} || ' ' || ${etapas.letra}`, nome: atividades.nome })
    .from(atividades).innerJoin(etapas, eq(etapas.id, atividades.etapaId)).innerJoin(projetos, eq(projetos.id, etapas.projetoId))
    .where(and(eq(atividades.ativo, true), eq(projetos.ativo, true), condAcesso(req.user!), ilike(atividades.nome, b))).limit(8);
  res.json({ projetos: ps, etapas: es, atividades: as_ });
}));
