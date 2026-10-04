import { Router } from 'express';
import { z } from 'zod';
import { and, asc, count, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import {
  db, projetos, etapas, atividades, statusTbl, users, etapaMembros, frentes,
} from '../db/index.js';
import { audit, auditDiff, ctxOf } from '../lib/audit.js';
import { badRequest, conflict, notFound, optDate, optInt, optStr, pageSchema, parse, wrap } from '../lib/http.js';
import { can, requirePerm } from '../middleware/auth.js';
import { letraDeOrdem, letraValida, ordemDeLetra } from '../lib/codes.js';
import { getPrazoCfg } from '../lib/settings.js';
import { calcPrazo, condSituacao, hoje, type SituacaoPrazo } from '../lib/prazo.js';
import { recalcEtapa, recalcProjeto } from '../lib/execucao.js';
import { aliasedTable } from 'drizzle-orm';
import { validarPessoas } from '../lib/pessoas.js';
import { assertEtapa, condAcesso } from '../lib/projetos.js';
import { activitiesOfStageRouter } from './activities.js';

const resp = aliasedTable(users, 'resp');
const scrumE = aliasedTable(users, 'scrum_e');

const etapaCols = {
  id: etapas.id, projetoId: etapas.projetoId, projetoCodigo: projetos.codigo, projetoNome: projetos.nome, frenteNome: frentes.nome,
  letra: etapas.letra, ordem: etapas.ordem, nome: etapas.nome, descricao: etapas.descricao,
  responsavelId: resp.id, responsavelNome: resp.nome, scrumMasterId: scrumE.id, scrumMasterNome: scrumE.nome, tags: etapas.tags,
  membros: sql<{ id: number; nome: string }[]>`(SELECT COALESCE(json_agg(json_build_object('id', mu.id, 'nome', mu.nome) ORDER BY mu.nome), '[]'::json) FROM etapa_membros em JOIN users mu ON mu.id = em.user_id WHERE em.etapa_id = ${etapas.id})`,
  statusId: statusTbl.id, statusNome: statusTbl.nome, statusCor: statusTbl.cor, statusClass: statusTbl.classificacao,
  dataInicio: etapas.dataInicio, dataPrevista: etapas.dataPrevista, dataConclusaoReal: etapas.dataConclusaoReal,
  peso: etapas.peso, percentualExecucao: etapas.percentualExecucao, pastaCaminho: etapas.pastaCaminho, ativo: etapas.ativo,
  totalAtividades: sql<number>`(SELECT count(*) FROM atividades a WHERE a.etapa_id = ${etapas.id} AND a.ativo)`,
  atividadesConcluidas: sql<number>`(SELECT count(*) FROM atividades a JOIN status s ON s.id = a.status_id WHERE a.etapa_id = ${etapas.id} AND a.ativo AND s.classificacao = 'CONCLUIDO')`,
  updatedAt: etapas.updatedAt,
};
const selEtapas = () => db.select(etapaCols).from(etapas)
  .innerJoin(projetos, eq(projetos.id, etapas.projetoId)).innerJoin(frentes, eq(frentes.id, projetos.frenteId))
  .innerJoin(statusTbl, eq(statusTbl.id, etapas.statusId)).leftJoin(resp, eq(resp.id, etapas.responsavelId)).leftJoin(scrumE, eq(scrumE.id, etapas.scrumMasterId));

type EtapaRow = Awaited<ReturnType<typeof selEtapas>>[number];
const fmtEtapa = (r: EtapaRow, cfg: Awaited<ReturnType<typeof getPrazoCfg>>) => ({
  id: r.id, projetoId: r.projetoId, projetoCodigo: r.projetoCodigo, projetoNome: r.projetoNome, frenteNome: r.frenteNome,
  codigo: `${r.projetoCodigo} ${r.letra}`, letra: r.letra, nome: r.nome, descricao: r.descricao,
  responsavel: r.responsavelId ? { id: r.responsavelId, nome: r.responsavelNome } : null,
  scrumMaster: r.scrumMasterId ? { id: r.scrumMasterId, nome: r.scrumMasterNome } : null,
  membros: r.membros ?? [], tags: r.tags,
  status: { id: r.statusId, nome: r.statusNome, cor: r.statusCor, classificacao: r.statusClass },
  dataInicio: r.dataInicio, dataPrevista: r.dataPrevista, dataConclusaoReal: r.dataConclusaoReal,
  peso: r.peso, percentualExecucao: r.percentualExecucao, pastaCaminho: r.pastaCaminho, ativo: r.ativo,
  totalAtividades: Number(r.totalAtividades), atividadesConcluidas: Number(r.atividadesConcluidas),
  prazo: calcPrazo({ dataInicio: r.dataInicio, dataPrevista: r.dataPrevista, dataConclusaoReal: r.dataConclusaoReal, classificacao: r.statusClass }, cfg),
  atrasada: !['CONCLUIDO', 'CANCELADO'].includes(r.statusClass) && (r.statusClass === 'ATRASO' || (r.dataPrevista != null && r.dataPrevista < hoje())),
});

function validarDatas(d: { dataInicio?: string | null; dataPrevista?: string | null }) {
  if (d.dataInicio && d.dataPrevista && d.dataPrevista < d.dataInicio) throw badRequest('A data prevista não pode ser anterior à data de início.');
}
async function statusInicial() {
  const [st] = await db.select().from(statusTbl).where(and(eq(statusTbl.classificacao, 'INICIAL'), eq(statusTbl.ativo, true))).orderBy(asc(statusTbl.ordem)).limit(1);
  return st.id;
}
async function classificacaoDe(statusId: number) {
  const [s] = await db.select().from(statusTbl).where(eq(statusTbl.id, statusId));
  if (!s || !s.ativo) throw badRequest('Status inválido.');
  return s.classificacao;
}

const etapaBody = z.object({
  letra: z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), z.string().optional()),
  nome: z.string().trim().min(2, 'Informe o nome da etapa.').max(250), descricao: optStr,
  responsavelId: optInt, scrumMasterId: optInt, membros: z.array(z.coerce.number().int()).optional(),
  tags: z.array(z.string().trim().min(1)).optional(), statusId: optInt, dataInicio: optDate, dataPrevista: optDate, dataConclusaoReal: optDate,
  peso: z.coerce.number().int().min(1).max(100).optional(), pastaCaminho: optStr,
});

// ───────────── /projects/:projetoId/stages ─────────────
export const stagesOfProjectRouter = Router({ mergeParams: true });
const projId = (req: any) => Number(req.params.projetoId);

stagesOfProjectRouter.get('/', requirePerm('stages.view'), wrap(async (req, res) => {
  const cfg = await getPrazoCfg();
  const rows = await selEtapas().where(and(eq(etapas.projetoId, projId(req)), eq(etapas.ativo, true))).orderBy(asc(etapas.ordem));
  res.json(rows.map((r) => fmtEtapa(r, cfg)));
}));

async function proximaLetra(projetoId: number, ex: typeof db | any = db) {
  const [{ m }] = await ex.select({ m: sql<number>`COALESCE(MAX(${etapas.ordem}),0)` }).from(etapas).where(eq(etapas.projetoId, projetoId));
  return { ordem: Number(m) + 1, letra: letraDeOrdem(Number(m) + 1) };
}
stagesOfProjectRouter.get('/next-letter', requirePerm('stages.create'), wrap(async (req, res) => {
  const [p] = await db.select().from(projetos).where(eq(projetos.id, projId(req))); if (!p) throw notFound('Projeto');
  const n = await proximaLetra(p.id);
  res.json({ letra: n.letra, codigo: `${p.codigo} ${n.letra}`, podeAlterar: can(req, 'stages.custom_letter') });
}));

stagesOfProjectRouter.get('/letter-available', requirePerm('stages.create'), wrap(async (req, res) => {
  const [p] = await db.select().from(projetos).where(eq(projetos.id, projId(req))); if (!p) throw notFound('Projeto');
  const letra = String(req.query.letra ?? '').trim().toUpperCase();
  const codigo = `${p.codigo} ${letra}`;
  if (!letra || !letraValida(letra)) return res.json({ codigo, disponivel: false, motivo: 'Letra inválida (use A–Z, AA, AB...).' });
  const [dup] = await db.select({ id: etapas.id, ativo: etapas.ativo }).from(etapas).where(and(eq(etapas.projetoId, p.id), eq(etapas.letra, letra)));
  res.json({ codigo, disponivel: !dup, motivo: dup ? `A etapa ${codigo} já existe neste projeto.` : null });
}));

stagesOfProjectRouter.post('/', requirePerm('stages.create'), wrap(async (req, res) => {
  const d = parse(etapaBody, req.body); validarDatas(d);
  const projetoId = projId(req);
  const out = await db.transaction(async (tx) => {
    const lock = await tx.execute(sql`SELECT id, codigo, ativo FROM projetos WHERE id = ${projetoId} FOR UPDATE`);
    const p = lock.rows[0] as { id: number; codigo: string; ativo: boolean } | undefined; if (!p) throw notFound('Projeto');
    if (!p.ativo) throw badRequest('Projeto inativo.');
    const prox = await proximaLetra(projetoId, tx);
    let letra = prox.letra; let ordem = prox.ordem;
    if (d.letra && d.letra !== prox.letra) {
      if (!can(req, 'stages.custom_letter')) throw badRequest(`Sem permissão para alterar a sequência. Letra sugerida: ${prox.letra}.`);
      if (!letraValida(d.letra)) throw badRequest('Letra inválida (use A–Z, AA, AB...).');
      const [dup] = await tx.select({ id: etapas.id }).from(etapas).where(and(eq(etapas.projetoId, projetoId), eq(etapas.letra, d.letra)));
      if (dup) throw conflict(`A etapa ${p.codigo} ${d.letra} já existe.`);
      letra = d.letra; ordem = ordemDeLetra(d.letra);
    }
    await validarPessoas([d.responsavelId], 'Responsável'); await validarPessoas([d.scrumMasterId], 'Scrum Master'); await validarPessoas(d.membros ?? [], 'Equipe');
    const statusId = d.statusId ?? await statusInicial();
    const cls = await classificacaoDe(statusId);
    const [e] = await tx.insert(etapas).values({
      projetoId, letra, ordem, nome: d.nome, descricao: d.descricao, responsavelId: d.responsavelId, scrumMasterId: d.scrumMasterId, tags: d.tags ?? [], statusId,
      dataInicio: d.dataInicio, dataPrevista: d.dataPrevista, dataConclusaoReal: d.dataConclusaoReal ?? (cls === 'CONCLUIDO' ? hoje() : null),
      peso: d.peso ?? 1, pastaCaminho: d.pastaCaminho,
    }).returning({ id: etapas.id, letra: etapas.letra });
    if (d.membros?.length) await tx.insert(etapaMembros).values([...new Set(d.membros)].map((userId) => ({ etapaId: e.id, userId })));
    await recalcEtapa(tx, e.id); await recalcProjeto(tx, projetoId);
    await audit(tx, ctxOf(req), { acao: 'CREATE', modulo: 'Etapas', registroId: e.id, rotulo: `${p.codigo} ${letra}`, projetoId, novo: d.nome });
    return { id: e.id, letra, codigo: `${p.codigo} ${letra}` };
  });
  res.status(201).json(out);
}));

// ───────────── /stages ─────────────
export const stagesRouter = Router();
const listQ = pageSchema.extend({
  busca: optStr, projetoId: optInt, statusId: optInt, responsavelId: optInt, scrumMasterId: optInt, frenteId: optInt,
  situacaoPrazo: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['NORMAL', 'ATENCAO', 'CRITICO', 'VENCIDO', 'SEM_PRAZO', 'ENCERRADO']).optional()),
  atrasadas: optStr,
});
stagesRouter.get('/', requirePerm('stages.view'), wrap(async (req, res) => {
  const q = parse(listQ, req.query); const cfg = await getPrazoCfg();
  const w: (SQL | undefined)[] = [eq(etapas.ativo, true), eq(projetos.ativo, true), condAcesso(req.user!)];
  if (q.busca) { const b = `%${q.busca}%`; w.push(or(ilike(etapas.nome, b), ilike(projetos.codigo, b), ilike(projetos.nome, b), sql`(${projetos.codigo} || ' ' || ${etapas.letra}) ILIKE ${b}`, sql`EXISTS (SELECT 1 FROM atividades a WHERE a.etapa_id = ${etapas.id} AND a.nome ILIKE ${b})`)); }
  if (q.projetoId) w.push(eq(etapas.projetoId, q.projetoId));
  if (q.statusId) w.push(eq(etapas.statusId, q.statusId));
  if (q.responsavelId) w.push(sql`(${etapas.responsavelId} = ${q.responsavelId} OR ${etapas.scrumMasterId} = ${q.responsavelId} OR EXISTS (SELECT 1 FROM etapa_membros em WHERE em.etapa_id = ${etapas.id} AND em.user_id = ${q.responsavelId}))`);
  if (q.scrumMasterId) w.push(eq(etapas.scrumMasterId, q.scrumMasterId));
  if (q.frenteId) w.push(eq(projetos.frenteId, q.frenteId));
  if (q.situacaoPrazo) w.push(condSituacao(q.situacaoPrazo as SituacaoPrazo, etapas.dataPrevista, statusTbl.classificacao, cfg));
  if (q.atrasadas) w.push(sql`(${statusTbl.classificacao} NOT IN ('CONCLUIDO','CANCELADO') AND (${statusTbl.classificacao} = 'ATRASO' OR ${etapas.dataPrevista} < ${hoje()}::date))`);
  const where = and(...w);
  const [{ n }] = await db.select({ n: count() }).from(etapas).innerJoin(projetos, eq(projetos.id, etapas.projetoId)).innerJoin(statusTbl, eq(statusTbl.id, etapas.statusId)).where(where);
  const rows = await selEtapas().where(where).orderBy(asc(frentes.ordem), asc(projetos.sequencia), asc(etapas.ordem)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  res.json({ itens: rows.map((r) => fmtEtapa(r, cfg)), total: n, page: q.page, pageSize: q.pageSize });
}));

stagesRouter.param('id', (req, _res, next, v) => assertEtapa(req.user!, Number(v)).then(() => next(), next));
stagesRouter.get('/:id', requirePerm('stages.view'), wrap(async (req, res) => {
  const cfg = await getPrazoCfg();
  const [r] = await selEtapas().where(eq(etapas.id, Number(req.params.id))); if (!r) throw notFound('Etapa');
  res.json(fmtEtapa(r, cfg));
}));

const ELABELS = { nome: 'Nome da etapa', descricao: 'Descrição', responsavelId: 'Responsável', scrumMasterId: 'Scrum Master', tags: 'Tags', statusId: 'Status', dataInicio: 'Data de início', dataPrevista: 'Data prevista', dataConclusaoReal: 'Data real de conclusão', peso: 'Peso', pastaCaminho: 'Caminho da pasta', ativo: 'Ativo' };

stagesRouter.patch('/:id', requirePerm('stages.update'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const d = parse(etapaBody.omit({ letra: true }).extend({ ativo: z.boolean().optional() }).partial(), req.body);
  const [antes] = await db.select().from(etapas).where(eq(etapas.id, id)); if (!antes) throw notFound('Etapa');
  const [p] = await db.select().from(projetos).where(eq(projetos.id, antes.projetoId));
  if (d.responsavelId && d.responsavelId !== antes.responsavelId) await validarPessoas([d.responsavelId], 'Responsável');
  if (d.scrumMasterId && d.scrumMasterId !== antes.scrumMasterId) await validarPessoas([d.scrumMasterId], 'Scrum Master');
  const set: Record<string, unknown> = {};
  for (const k of Object.keys(ELABELS)) if (k in req.body && (d as any)[k] !== undefined) set[k] = (d as any)[k];
  for (const k of ['descricao', 'responsavelId', 'scrumMasterId', 'dataInicio', 'dataPrevista', 'dataConclusaoReal', 'pastaCaminho']) if (k in req.body && (req.body[k] === '' || req.body[k] === null)) set[k] = null;
  validarDatas({ dataInicio: (set.dataInicio ?? antes.dataInicio) as string | null, dataPrevista: (set.dataPrevista ?? antes.dataPrevista) as string | null });
  if (set.statusId && set.statusId !== antes.statusId) {
    const novo = await classificacaoDe(Number(set.statusId));
    const [velho] = await db.select().from(statusTbl).where(eq(statusTbl.id, antes.statusId));
    if (novo === 'CONCLUIDO' && !('dataConclusaoReal' in set) && !antes.dataConclusaoReal) set.dataConclusaoReal = hoje();
    if (velho.classificacao === 'CONCLUIDO' && novo !== 'CONCLUIDO' && !('dataConclusaoReal' in set)) set.dataConclusaoReal = null;
  }
  await db.transaction(async (tx) => {
    if (Object.keys(set).length) await tx.update(etapas).set({ ...set, updatedAt: new Date() } as any).where(eq(etapas.id, id));
    await auditDiff(tx, ctxOf(req), { modulo: 'Etapas', registroId: id, rotulo: `${p.codigo} ${antes.letra}`, projetoId: p.id, before: antes as any, after: { ...antes, ...set }, labels: ELABELS });
    if (d.membros) {
      const atual = (await tx.select({ id: etapaMembros.userId }).from(etapaMembros).where(eq(etapaMembros.etapaId, id))).map((m) => m.id).sort((a, b) => a - b);
      const novos = [...new Set(d.membros)].sort((a, b) => a - b);
      if (novos.join() !== atual.join()) {
        await validarPessoas(novos.filter((x) => !atual.includes(x)), 'Equipe');
        const nomes = async (ids: number[]) => ids.length ? (await tx.select({ nome: users.nome }).from(users).where(inArray(users.id, ids)).orderBy(asc(users.nome))).map((u) => u.nome).join(', ') : '(vazio)';
        await tx.delete(etapaMembros).where(eq(etapaMembros.etapaId, id));
        if (novos.length) await tx.insert(etapaMembros).values(novos.map((userId) => ({ etapaId: id, userId })));
        await audit(tx, ctxOf(req), { acao: 'UPDATE', modulo: 'Etapas', registroId: id, rotulo: `${p.codigo} ${antes.letra}`, projetoId: p.id, campo: 'Equipe (membros)', anterior: await nomes(atual), novo: await nomes(novos) });
      }
    }
    await recalcEtapa(tx, id); await recalcProjeto(tx, p.id);
  });
  res.json({ ok: true });
}));

stagesRouter.use('/:etapaId/activities', wrap(async (req, _res, next) => { await assertEtapa(req.user!, Number(req.params.etapaId)); next(); }), activitiesOfStageRouter);


