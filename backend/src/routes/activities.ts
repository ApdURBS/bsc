import { Router } from 'express';
import { z } from 'zod';
import { aliasedTable, and, asc, count, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { validarPessoas } from '../lib/pessoas.js';
import { assertAtividade, condAcesso } from '../lib/projetos.js';
import { db, projetos, etapas, atividades, statusTbl, users, frentes } from '../db/index.js';
import { audit, auditDiff, ctxOf } from '../lib/audit.js';
import { badRequest, notFound, optDate, optInt, optStr, pageSchema, parse, wrap } from '../lib/http.js';
import { requirePerm } from '../middleware/auth.js';
import { getPrazoCfg } from '../lib/settings.js';
import { calcPrazo, condSituacao, hoje, type SituacaoPrazo } from '../lib/prazo.js';
import { recalcEtapa, recalcProjeto } from '../lib/execucao.js';

const resp = aliasedTable(users, 'resp');
const cols = {
  id: atividades.id, etapaId: etapas.id, etapaLetra: etapas.letra, etapaNome: etapas.nome, projetoId: projetos.id, projetoCodigo: projetos.codigo, projetoNome: projetos.nome,
  nome: atividades.nome, descricao: atividades.descricao, responsavelId: resp.id, responsavelNome: resp.nome,
  statusId: statusTbl.id, statusNome: statusTbl.nome, statusCor: statusTbl.cor, statusClass: statusTbl.classificacao,
  dataInicio: atividades.dataInicio, dataPrevista: atividades.dataPrevista, dataConclusaoReal: atividades.dataConclusaoReal, peso: atividades.peso, ativo: atividades.ativo,
};
const sel = () => db.select(cols).from(atividades).innerJoin(etapas, eq(etapas.id, atividades.etapaId)).innerJoin(projetos, eq(projetos.id, etapas.projetoId))
  .innerJoin(statusTbl, eq(statusTbl.id, atividades.statusId)).leftJoin(resp, eq(resp.id, atividades.responsavelId));
type Row = Awaited<ReturnType<typeof sel>>[number];
const fmt = (r: Row, cfg: Awaited<ReturnType<typeof getPrazoCfg>>) => ({
  id: r.id, etapa: { id: r.etapaId, letra: r.etapaLetra, nome: r.etapaNome, codigo: `${r.projetoCodigo} ${r.etapaLetra}` },
  projeto: { id: r.projetoId, codigo: r.projetoCodigo, nome: r.projetoNome },
  nome: r.nome, descricao: r.descricao, responsavel: r.responsavelId ? { id: r.responsavelId, nome: r.responsavelNome } : null,
  status: { id: r.statusId, nome: r.statusNome, cor: r.statusCor, classificacao: r.statusClass },
  dataInicio: r.dataInicio, dataPrevista: r.dataPrevista, dataConclusaoReal: r.dataConclusaoReal, peso: r.peso, ativo: r.ativo,
  prazo: calcPrazo({ dataInicio: r.dataInicio, dataPrevista: r.dataPrevista, dataConclusaoReal: r.dataConclusaoReal, classificacao: r.statusClass }, cfg),
});

const body = z.object({
  nome: z.string().trim().min(2, 'Informe o nome da atividade.').max(300), descricao: optStr, responsavelId: optInt, statusId: optInt,
  dataInicio: optDate, dataPrevista: optDate, dataConclusaoReal: optDate, peso: z.coerce.number().int().min(1).max(100).optional(),
});
function validarDatas(d: { dataInicio?: string | null; dataPrevista?: string | null }) {
  if (d.dataInicio && d.dataPrevista && d.dataPrevista < d.dataInicio) throw badRequest('A data prevista não pode ser anterior à data de início.');
}
async function classificacaoDe(statusId: number) {
  const [s] = await db.select().from(statusTbl).where(eq(statusTbl.id, statusId));
  if (!s || !s.ativo) throw badRequest('Status inválido.');
  return s.classificacao;
}

// ───────────── /stages/:etapaId/activities ─────────────
export const activitiesOfStageRouter = Router({ mergeParams: true });
activitiesOfStageRouter.get('/', requirePerm('activities.view'), wrap(async (req, res) => {
  const cfg = await getPrazoCfg();
  const rows = await sel().where(and(eq(atividades.etapaId, Number(req.params.etapaId)), eq(atividades.ativo, true))).orderBy(asc(atividades.id));
  res.json(rows.map((r) => fmt(r, cfg)));
}));

activitiesOfStageRouter.post('/', requirePerm('activities.create'), wrap(async (req, res) => {
  const d = parse(body, req.body); validarDatas(d);
  const etapaId = Number(req.params.etapaId);
  const [e] = await db.select({ id: etapas.id, letra: etapas.letra, projetoId: etapas.projetoId, codigo: projetos.codigo, ativo: etapas.ativo }).from(etapas).innerJoin(projetos, eq(projetos.id, etapas.projetoId)).where(eq(etapas.id, etapaId));
  if (!e || !e.ativo) throw notFound('Etapa');
  await validarPessoas([d.responsavelId], 'Responsável');
  const statusId = d.statusId ?? (await db.select().from(statusTbl).where(and(eq(statusTbl.classificacao, 'INICIAL'), eq(statusTbl.ativo, true))).orderBy(asc(statusTbl.ordem)).limit(1))[0].id;
  const cls = await classificacaoDe(statusId);
  const out = await db.transaction(async (tx) => {
    const [a] = await tx.insert(atividades).values({ etapaId, nome: d.nome, descricao: d.descricao, responsavelId: d.responsavelId, statusId, dataInicio: d.dataInicio, dataPrevista: d.dataPrevista, dataConclusaoReal: d.dataConclusaoReal ?? (cls === 'CONCLUIDO' ? hoje() : null), peso: d.peso ?? 1 }).returning({ id: atividades.id });
    await recalcEtapa(tx, etapaId); await recalcProjeto(tx, e.projetoId);
    await audit(tx, ctxOf(req), { acao: 'CREATE', modulo: 'Atividades', registroId: a.id, rotulo: `${e.codigo} ${e.letra}: ${d.nome}`, projetoId: e.projetoId, novo: d.nome });
    return a;
  });
  res.status(201).json(out);
}));

// ───────────── /activities ─────────────
export const activitiesRouter = Router();
const listQ = pageSchema.extend({
  busca: optStr, projetoId: optInt, etapaId: optInt, statusId: optInt, responsavelId: optInt,
  situacaoPrazo: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['NORMAL', 'ATENCAO', 'CRITICO', 'VENCIDO', 'SEM_PRAZO', 'ENCERRADO']).optional()),
});
activitiesRouter.get('/', requirePerm('activities.view'), wrap(async (req, res) => {
  const q = parse(listQ, req.query); const cfg = await getPrazoCfg();
  const w: (SQL | undefined)[] = [eq(atividades.ativo, true), eq(etapas.ativo, true), eq(projetos.ativo, true), condAcesso(req.user!)];
  if (q.busca) { const b = `%${q.busca}%`; w.push(or(ilike(atividades.nome, b), ilike(etapas.nome, b), ilike(projetos.codigo, b), ilike(projetos.nome, b))); }
  if (q.projetoId) w.push(eq(etapas.projetoId, q.projetoId));
  if (q.etapaId) w.push(eq(atividades.etapaId, q.etapaId));
  if (q.statusId) w.push(eq(atividades.statusId, q.statusId));
  if (q.responsavelId) w.push(eq(atividades.responsavelId, q.responsavelId));
  if (q.situacaoPrazo) w.push(condSituacao(q.situacaoPrazo as SituacaoPrazo, atividades.dataPrevista, statusTbl.classificacao, cfg));
  const where = and(...w);
  const [{ n }] = await db.select({ n: count() }).from(atividades).innerJoin(etapas, eq(etapas.id, atividades.etapaId)).innerJoin(projetos, eq(projetos.id, etapas.projetoId)).innerJoin(statusTbl, eq(statusTbl.id, atividades.statusId)).where(where);
  const rows = await sel().innerJoin(frentes, eq(frentes.id, projetos.frenteId)).where(where).orderBy(asc(frentes.ordem), asc(projetos.sequencia), asc(etapas.ordem), asc(atividades.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  res.json({ itens: rows.map((r) => fmt(r, cfg)), total: n, page: q.page, pageSize: q.pageSize });
}));

const LABELS = { nome: 'Nome da atividade', descricao: 'Descrição', responsavelId: 'Responsável', statusId: 'Status', dataInicio: 'Data de início', dataPrevista: 'Data prevista', dataConclusaoReal: 'Data real de conclusão', peso: 'Peso', ativo: 'Ativo' };
activitiesRouter.param('id', (req, _res, next, v) => assertAtividade(req.user!, Number(v)).then(() => next(), next));
activitiesRouter.patch('/:id', requirePerm('activities.update'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const d = parse(body.extend({ ativo: z.boolean().optional() }).partial(), req.body);
  const [antes] = await db.select().from(atividades).where(eq(atividades.id, id)); if (!antes) throw notFound('Atividade');
  if (d.responsavelId && d.responsavelId !== antes.responsavelId) await validarPessoas([d.responsavelId], 'Responsável');
  const [e] = await db.select({ letra: etapas.letra, projetoId: etapas.projetoId, codigo: projetos.codigo }).from(etapas).innerJoin(projetos, eq(projetos.id, etapas.projetoId)).where(eq(etapas.id, antes.etapaId));
  const set: Record<string, unknown> = {};
  for (const k of Object.keys(LABELS)) if (k in req.body && (d as any)[k] !== undefined) set[k] = (d as any)[k];
  for (const k of ['descricao', 'responsavelId', 'dataInicio', 'dataPrevista', 'dataConclusaoReal']) if (k in req.body && (req.body[k] === '' || req.body[k] === null)) set[k] = null;
  validarDatas({ dataInicio: (set.dataInicio ?? antes.dataInicio) as string | null, dataPrevista: (set.dataPrevista ?? antes.dataPrevista) as string | null });
  if (set.statusId && set.statusId !== antes.statusId) {
    const novo = await classificacaoDe(Number(set.statusId));
    const [velho] = await db.select().from(statusTbl).where(eq(statusTbl.id, antes.statusId));
    if (novo === 'CONCLUIDO' && !('dataConclusaoReal' in set) && !antes.dataConclusaoReal) set.dataConclusaoReal = hoje();
    if (velho.classificacao === 'CONCLUIDO' && novo !== 'CONCLUIDO' && !('dataConclusaoReal' in set)) set.dataConclusaoReal = null;
  }
  await db.transaction(async (tx) => {
    if (Object.keys(set).length) await tx.update(atividades).set({ ...set, updatedAt: new Date() } as any).where(eq(atividades.id, id));
    await auditDiff(tx, ctxOf(req), { modulo: 'Atividades', registroId: id, rotulo: `${e.codigo} ${e.letra}: ${antes.nome}`, projetoId: e.projetoId, before: antes as any, after: { ...antes, ...set }, labels: LABELS });
    await recalcEtapa(tx, antes.etapaId); await recalcProjeto(tx, e.projetoId);
  });
  res.json({ ok: true });
}));
