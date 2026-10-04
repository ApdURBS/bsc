import { Router } from 'express';
import { z } from 'zod';
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import {
  db, projetos, frentes, statusTbl, confidencialidades, users, etapas, atividades,
  auditLogs, movimentacoes,
} from '../db/index.js';
import { audit, auditDiff, ctxOf } from '../lib/audit.js';
import { badRequest, notFound, optDate, optInt, optStr, pageSchema, parse, wrap, isoDate, conflict, emptyToUndef } from '../lib/http.js';
import { requirePerm, can } from '../middleware/auth.js';
import { getPrazoCfg } from '../lib/settings.js';
import { condSituacao, hoje, type SituacaoPrazo } from '../lib/prazo.js';
import { validarPessoas } from '../lib/pessoas.js';
import { CARDS, assertProjeto, condAcesso, condCard, condResponsavel, formatarProjeto, selecionarProjetos, type Card } from '../lib/projetos.js';
import { recalcProjeto } from '../lib/execucao.js';
import { stagesOfProjectRouter } from './stages.js';

export const projectsRouter = Router();

const SORTS: Record<string, SQL[]> = {
  codigo: [sql`${frentes.codigo}`, sql`${projetos.sequencia}`],
  nome: [sql`lower(${projetos.nome})`],
  frente: [sql`${frentes.ordem}`, sql`${projetos.sequencia}`],
  status: [sql`${statusTbl.ordem}`],
  prazo: [sql`${projetos.dataPrevista} NULLS LAST`],
  execucao: [sql`${projetos.percentualExecucao}`],
  ultimaMovimentacao: [sql`${projetos.ultimaMovimentacaoEm} NULLS LAST`],
};

const listQuery = pageSchema.extend({
  busca: optStr, frenteId: optInt, statusId: optInt, scrumMasterId: optInt, donoId: optInt, responsavelId: optInt,
  situacaoPrazo: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['NORMAL', 'ATENCAO', 'CRITICO', 'VENCIDO', 'SEM_PRAZO', 'ENCERRADO']).optional()),
  confidencialidadeId: optInt,
  card: z.preprocess((v) => (v === '' ? undefined : v), z.enum(CARDS).optional()),
  prazoDe: optDate, prazoAte: optDate, movDe: optDate, movAte: optDate, semMovimentacaoDias: optInt,
  meus: optStr, ativo: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false', 'todos']).default('true')),
  sort: z.string().default('codigo'), dir: z.enum(['asc', 'desc']).default('asc'),
});

export async function montarFiltros(q: z.infer<typeof listQuery>, userId: number | null, user: { acessoIds: number[] }) {
  const cfg = await getPrazoCfg();
  const w: (SQL | undefined)[] = [condAcesso(user)];
  if (q.ativo !== 'todos') w.push(eq(projetos.ativo, q.ativo === 'true'));
  if (q.busca) {
    const b = `%${q.busca}%`;
    w.push(or(ilike(projetos.codigo, b), ilike(projetos.nome, b), sql`EXISTS (SELECT 1 FROM etapas e LEFT JOIN atividades a ON a.etapa_id = e.id WHERE e.projeto_id = ${projetos.id} AND (e.nome ILIKE ${b} OR a.nome ILIKE ${b}))`,
      sql`EXISTS (SELECT 1 FROM users c WHERE c.id = ${projetos.donoId} AND c.nome ILIKE ${b})`,
      sql`EXISTS (SELECT 1 FROM etapas e JOIN users c ON c.id = e.scrum_master_id WHERE e.projeto_id = ${projetos.id} AND e.ativo AND c.nome ILIKE ${b})`,
      sql`EXISTS (SELECT 1 FROM etapas e JOIN etapa_membros em ON em.etapa_id = e.id JOIN users c ON c.id = em.user_id WHERE e.projeto_id = ${projetos.id} AND e.ativo AND c.nome ILIKE ${b})`, ilike(frentes.nome, b), ilike(statusTbl.nome, b)));
  }
  if (q.frenteId) w.push(eq(projetos.frenteId, q.frenteId));
  if (q.statusId) w.push(eq(projetos.statusId, q.statusId));
  if (q.scrumMasterId) w.push(sql`EXISTS (SELECT 1 FROM etapas e WHERE e.projeto_id = ${projetos.id} AND e.ativo AND e.scrum_master_id = ${q.scrumMasterId})`);
  if (q.donoId) w.push(eq(projetos.donoId, q.donoId));
  if (q.confidencialidadeId) w.push(eq(projetos.confidencialidadeId, q.confidencialidadeId));
  if (q.responsavelId) w.push(condResponsavel(q.responsavelId));
  if (q.situacaoPrazo) w.push(condSituacao(q.situacaoPrazo as SituacaoPrazo, projetos.dataPrevista, statusTbl.classificacao, cfg));
  if (q.card) w.push(condCard(q.card as Card, cfg));
  if (q.prazoDe) w.push(sql`${projetos.dataPrevista} >= ${q.prazoDe}::date`);
  if (q.prazoAte) w.push(sql`${projetos.dataPrevista} <= ${q.prazoAte}::date`);
  if (q.movDe) w.push(sql`COALESCE(${projetos.ultimaMovimentacaoEm}, ${projetos.createdAt}) >= ${q.movDe}::date`);
  if (q.movAte) w.push(sql`COALESCE(${projetos.ultimaMovimentacaoEm}, ${projetos.createdAt}) < (${q.movAte}::date + 1)`);
  if (q.semMovimentacaoDias) {
    const lim = new Date(Date.now() - q.semMovimentacaoDias * 86400000).toISOString();
    w.push(sql`(${statusTbl.classificacao} NOT IN ('CONCLUIDO','CANCELADO') AND COALESCE(${projetos.ultimaMovimentacaoEm}, ${projetos.createdAt}) < ${lim}::timestamptz)`);
  }
  if (q.meus && userId) w.push(condResponsavel(userId));
  return { where: and(...w), cfg };
}

projectsRouter.get('/', requirePerm('projects.view'), wrap(async (req, res) => {
  const q = parse(listQuery, req.query);
  const { where, cfg } = await montarFiltros(q, req.user!.id, req.user!);
  const base = () => db.select({ n: count() }).from(projetos).innerJoin(frentes, eq(frentes.id, projetos.frenteId)).innerJoin(statusTbl, eq(statusTbl.id, projetos.statusId));
  const [{ n }] = await base().where(where);
  const ord = (SORTS[q.sort] ?? SORTS.codigo).map((s) => (q.dir === 'desc' ? sql`${s} DESC` : sql`${s} ASC`));
  const rows = await selecionarProjetos().where(where).orderBy(...ord, asc(projetos.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  res.json({ itens: rows.map((r) => formatarProjeto(r, cfg)), total: n, page: q.page, pageSize: q.pageSize });
}));

// Sugestão do próximo código da frente (prévia; o código definitivo é gerado na gravação)
projectsRouter.get('/next-code', requirePerm('projects.create'), wrap(async (req, res) => {
  const frenteId = Number(req.query.frenteId); if (!frenteId) throw badRequest('Informe a frente.');
  const [f] = await db.select().from(frentes).where(eq(frentes.id, frenteId)); if (!f) throw notFound('Frente');
  const [{ m }] = await db.select({ m: sql<number>`COALESCE(MAX(${projetos.sequencia}),0)` }).from(projetos).where(eq(projetos.frenteId, frenteId));
  res.json({ codigo: `${f.codigo}_${Number(m) + 1}`, frenteCodigo: f.codigo, sequencia: Number(m) + 1 });
}));

// Verifica se um código já está em uso (inclui projetos inativos: códigos nunca são reaproveitados)
projectsRouter.get('/code-available', requirePerm('projects.create'), wrap(async (req, res) => {
  const frenteId = Number(req.query.frenteId); const seq = Number(req.query.sequencia);
  if (!frenteId || !Number.isInteger(seq) || seq < 1) return res.json({ disponivel: false, motivo: 'Informe um número inteiro maior que zero.' });
  const [f] = await db.select().from(frentes).where(eq(frentes.id, frenteId)); if (!f) throw notFound('Frente');
  const codigo = `${f.codigo}_${seq}`;
  const [ex] = await db.select({ id: projetos.id, ativo: projetos.ativo }).from(projetos).where(or(eq(projetos.codigo, codigo), and(eq(projetos.frenteId, frenteId), eq(projetos.sequencia, seq))));
  res.json({ codigo, disponivel: !ex, motivo: ex ? (ex.ativo ? `O código ${codigo} já existe.` : `O código ${codigo} pertence a um projeto excluído e não pode ser reutilizado.`) : null });
}));

const projetoBody = z.object({
  nome: z.string().trim().min(3, 'Informe o nome do projeto.').max(250),
  descricao: optStr, donoId: optInt,
  statusId: optInt, confidencialidadeId: optInt,
  dataConclusaoReal: optDate,
  pastaCaminho: optStr, observacoes: optStr,
  camposExtras: z.record(z.string(), z.any()).optional(),
});
// Toda rota /:id do projeto passa pela política de confidencialidade
projectsRouter.param('id', (req, _res, next, v) => {
  const id = Number(v); if (!Number.isInteger(id)) return next(notFound('Projeto'));
  assertProjeto(req.user!, id).then(() => next(), next);
});
function validarNivel(req: any, id?: number | null) { if (id && !req.user.acessoIds.includes(id)) throw badRequest('Você não pode atribuir um nível de confidencialidade que não tem permissão de enxergar.'); }
const criarBody = projetoBody.extend({ frenteId: z.coerce.number().int(), sequencia: z.preprocess(emptyToUndef, z.coerce.number().int().min(1, 'O número do código deve ser 1 ou maior.').max(999999).optional()) });

async function defaults() {
  const [st] = await db.select().from(statusTbl).where(and(eq(statusTbl.classificacao, 'INICIAL'), eq(statusTbl.ativo, true))).orderBy(asc(statusTbl.ordem)).limit(1);
  // padrão: "Interno URBS" (regra USUARIOS); se não existir, o nível menos restrito
  const cfs = await db.select().from(confidencialidades).where(eq(confidencialidades.ativo, true)).orderBy(asc(confidencialidades.nivel));
  const cf = cfs.find((c) => c.regraAcesso === 'USUARIOS') ?? cfs[0];
  return { statusId: st?.id, confidencialidadeId: cf?.id };
}

projectsRouter.post('/', requirePerm('projects.create'), wrap(async (req, res) => {
  const d = parse(criarBody, req.body);
  validarNivel(req, d.confidencialidadeId);
  await validarPessoas([d.donoId], 'Dono do projeto');
  const def = await defaults();
  const out = await db.transaction(async (tx) => {
    // trava a frente para gerar a sequência sem colisão entre usuários simultâneos
    const lock = await tx.execute(sql`SELECT id, codigo, ativo FROM frentes WHERE id = ${d.frenteId} FOR UPDATE`);
    const f = lock.rows[0] as { id: number; codigo: string; ativo: boolean } | undefined;
    if (!f) throw badRequest('Frente inválida.');
    if (!f.ativo) throw badRequest('Esta frente está inativa.');
    const [{ m }] = await tx.select({ m: sql<number>`COALESCE(MAX(${projetos.sequencia}),0)` }).from(projetos).where(eq(projetos.frenteId, d.frenteId));
    const manual = d.sequencia !== undefined && d.sequencia !== Number(m) + 1;
    const sequencia = d.sequencia ?? Number(m) + 1; const codigo = `${f.codigo}_${sequencia}`;
    // código escolhido pelo usuário: nunca pode repetir um existente (inclui projetos excluídos)
    const [dup] = await tx.select({ id: projetos.id, ativo: projetos.ativo }).from(projetos).where(or(eq(projetos.codigo, codigo), and(eq(projetos.frenteId, d.frenteId), eq(projetos.sequencia, sequencia))));
    if (dup) throw conflict(dup.ativo ? `O código ${codigo} já existe. Escolha outro número.` : `O código ${codigo} pertence a um projeto excluído e não pode ser reutilizado. Escolha outro número.`);
    const [p] = await tx.insert(projetos).values({
      frenteId: d.frenteId, sequencia, codigo, nome: d.nome, descricao: d.descricao, donoId: d.donoId,
      statusId: d.statusId ?? def.statusId!, confidencialidadeId: d.confidencialidadeId ?? def.confidencialidadeId!,
      pastaCaminho: d.pastaCaminho, observacoes: d.observacoes, camposExtras: d.camposExtras ?? null,
      createdById: req.user!.id, updatedById: req.user!.id,
    }).returning({ id: projetos.id, codigo: projetos.codigo });
    await recalcProjeto(tx, p.id);
    await audit(tx, ctxOf(req), { acao: 'CREATE', modulo: 'Projetos', registroId: p.id, rotulo: p.codigo, projetoId: p.id, novo: d.nome, info: { frenteId: d.frenteId, ...(manual ? { codigoEscolhidoPeloUsuario: true } : {}) } });
    return p;
  });
  res.status(201).json({ id: out.id, codigo: out.codigo });
}));

async function carregar(id: number) {
  const [r] = await selecionarProjetos().where(eq(projetos.id, id));
  if (!r) throw notFound('Projeto');
  return r;
}
const idParam = (req: any) => { const id = Number(req.params.id); if (!Number.isInteger(id)) throw notFound('Projeto'); return id; };

projectsRouter.get('/:id', requirePerm('projects.view'), wrap(async (req, res) => {
  const id = idParam(req);
  const cfg = await getPrazoCfg();
  const r = await carregar(id);
  const [et] = await db.select({ total: count(), concluidas: sql<number>`count(*) filter (where ${statusTbl.classificacao} = 'CONCLUIDO')` }).from(etapas).innerJoin(statusTbl, eq(statusTbl.id, etapas.statusId)).where(and(eq(etapas.projetoId, id), eq(etapas.ativo, true)));
  const [at] = await db.select({ total: count() }).from(atividades).innerJoin(etapas, eq(etapas.id, atividades.etapaId)).where(and(eq(etapas.projetoId, id), eq(atividades.ativo, true), eq(etapas.ativo, true)));
  const [ult] = await db.select({ usuario: auditLogs.usuarioNome, dataHora: auditLogs.dataHora }).from(auditLogs)
    .where(and(eq(auditLogs.projetoId, id), inArray(auditLogs.acao, ['CREATE', 'UPDATE', 'STATUS_CHANGE', 'DELETE']))).orderBy(desc(auditLogs.dataHora)).limit(1);
  res.json({ ...formatarProjeto(r, cfg), totais: { etapas: et.total, etapasConcluidas: Number(et.concluidas), atividades: at.total }, ultimaAlteracao: ult ?? null });
}));

const LABELS = {
  nome: 'Nome do projeto', descricao: 'Descrição', donoId: 'Dono do projeto', statusId: 'Status',
  confidencialidadeId: 'Confidencialidade', dataConclusaoReal: 'Data real de conclusão', pastaCaminho: 'Caminho da pasta',
  observacoes: 'Observações', ativo: 'Ativo',
};

projectsRouter.patch('/:id', requirePerm('projects.update'), wrap(async (req, res) => {
  const id = idParam(req);
  const d = parse(projetoBody.extend({ ativo: z.boolean().optional() }).partial(), req.body);
  if (d.ativo !== undefined && !can(req, 'projects.delete')) throw badRequest('Sem permissão para ativar/inativar projetos.');
  validarNivel(req, d.confidencialidadeId);
  const [antes] = await db.select().from(projetos).where(eq(projetos.id, id)); if (!antes) throw notFound('Projeto');
  if (d.donoId && d.donoId !== antes.donoId) await validarPessoas([d.donoId], 'Dono do projeto');
  const set: Record<string, unknown> = {};
  for (const k of Object.keys(LABELS) as (keyof typeof LABELS)[]) if (k in req.body && (d as any)[k] !== undefined) set[k] = (d as any)[k];
  // campos opcionais enviados vazios = limpar
  for (const k of ['descricao', 'donoId', 'dataConclusaoReal', 'pastaCaminho', 'observacoes'] as const) {
    if (k in req.body && (req.body[k] === '' || req.body[k] === null)) set[k] = null;
  }
  // conclusão automática conforme a classificação do status
  if (set.statusId && set.statusId !== antes.statusId) {
    const [novo] = await db.select().from(statusTbl).where(eq(statusTbl.id, Number(set.statusId)));
    if (!novo || !novo.ativo) throw badRequest('Status inválido.');
    const [velho] = await db.select().from(statusTbl).where(eq(statusTbl.id, antes.statusId));
    if (novo.classificacao === 'CONCLUIDO' && !('dataConclusaoReal' in set) && !antes.dataConclusaoReal) set.dataConclusaoReal = hoje();
    if (velho.classificacao === 'CONCLUIDO' && novo.classificacao !== 'CONCLUIDO' && !('dataConclusaoReal' in set)) set.dataConclusaoReal = null;
  }
  await db.transaction(async (tx) => {
    if (Object.keys(set).length) await tx.update(projetos).set({ ...set, updatedAt: new Date(), updatedById: req.user!.id } as any).where(eq(projetos.id, id));
    const ctx = ctxOf(req);
    await auditDiff(tx, ctx, { modulo: 'Projetos', registroId: id, rotulo: antes.codigo, projetoId: id, before: antes as any, after: { ...antes, ...set }, labels: LABELS });
    if (set.statusId) await recalcProjeto(tx, id);
  });
  res.json({ ok: true });
}));

// "Exclusão" é sempre lógica (política: nada se perde). Reativação: PATCH { ativo: true }.
projectsRouter.delete('/:id', requirePerm('projects.delete'), wrap(async (req, res) => {
  const id = idParam(req);
  const [p] = await db.select().from(projetos).where(eq(projetos.id, id)); if (!p) throw notFound('Projeto');
  if (!p.ativo) throw conflict('O projeto já está inativo.');
  await db.transaction(async (tx) => {
    await tx.update(projetos).set({ ativo: false, updatedAt: new Date(), updatedById: req.user!.id }).where(eq(projetos.id, id));
    await audit(tx, ctxOf(req), { acao: 'DELETE', modulo: 'Projetos', registroId: id, rotulo: p.codigo, projetoId: id, campo: 'Ativo', anterior: 'true', novo: 'false', info: { tipo: 'exclusão lógica' } });
  });
  res.json({ ok: true });
}));

// Histórico de auditoria do projeto
projectsRouter.get('/:id/audit', requirePerm('audit.project_history', 'audit.view'), wrap(async (req, res) => {
  const id = idParam(req); const q = parse(pageSchema, req.query);
  const where = eq(auditLogs.projetoId, id);
  const [{ n }] = await db.select({ n: count() }).from(auditLogs).where(where);
  const itens = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.dataHora), desc(auditLogs.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  res.json({ itens, total: n, page: q.page, pageSize: q.pageSize });
}));

// Timeline completa: movimentações + eventos do sistema (criação, mudanças de status, etapas)
projectsRouter.get('/:id/timeline', requirePerm('projects.view'), wrap(async (req, res) => {
  const id = idParam(req);
  const movs = await db.execute(sql`
    SELECT m.id, m.data_hora AS "dataHora", u.nome AS usuario, t.nome AS tipo, m.descricao, e.letra AS etapa, a.nome AS atividade
    FROM movimentacoes m JOIN users u ON u.id = m.usuario_id JOIN tipos_movimentacao t ON t.id = m.tipo_id
    LEFT JOIN etapas e ON e.id = m.etapa_id LEFT JOIN atividades a ON a.id = m.atividade_id
    WHERE m.projeto_id = ${id} ORDER BY m.data_hora DESC LIMIT 300`);
  const evs = await db.execute(sql`
    SELECT id, data_hora AS "dataHora", usuario_nome AS usuario, acao, modulo, registro_rotulo AS rotulo, campo, valor_anterior AS anterior, valor_novo AS novo
    FROM audit_logs WHERE projeto_id = ${id} AND (acao IN ('STATUS_CHANGE','DOCUMENT_UPLOAD','DOCUMENT_DELETE') OR (acao = 'CREATE' AND modulo IN ('Projetos','Etapas','Atividades'))
      OR campo IN ('Data prevista de conclusão','Data prevista'))
    ORDER BY data_hora DESC LIMIT 300`);
  const itens = [
    ...movs.rows.map((m: any) => ({ origem: 'MOVIMENTACAO', ...m })),
    ...evs.rows.map((e: any) => ({ origem: 'EVENTO', ...e })),
  ].sort((a: any, b: any) => +new Date(b.dataHora) - +new Date(a.dataHora));
  res.json({ itens });
}));

projectsRouter.use('/:projetoId/stages', wrap(async (req, _res, next) => { await assertProjeto(req.user!, Number(req.params.projetoId)); next(); }), stagesOfProjectRouter);
void users; void movimentacoes; void isoDate;
