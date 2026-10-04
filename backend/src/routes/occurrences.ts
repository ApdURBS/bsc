import { Router } from 'express';
import { z } from 'zod';
import { aliasedTable, and, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db, ocorrencias, projetos, etapas, atividades, users, tiposOcorrencia } from '../db/index.js';
import { audit, auditDiff, ctxOf } from '../lib/audit.js';
import { badRequest, notFound, optDate, optInt, optStr, pageSchema, parse, wrap } from '../lib/http.js';
import { requirePerm } from '../middleware/auth.js';
import { validarPessoas } from '../lib/pessoas.js';
import { assertProjeto, condAcesso } from '../lib/projetos.js';
import { hoje } from '../lib/prazo.js';

export const occurrencesRouter = Router();
export const STATUS_OCORRENCIA = ['ABERTA', 'EM_TRATAMENTO', 'RESOLVIDA', 'CANCELADA'] as const;
const SEV = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] as const;

const resp = aliasedTable(users, 'resp_oc');
const cols = {
  id: ocorrencias.id, titulo: ocorrencias.titulo, descricao: ocorrencias.descricao, data: ocorrencias.data, severidade: ocorrencias.severidade,
  status: ocorrencias.status, prazoResolucao: ocorrencias.prazoResolucao, dataResolucao: ocorrencias.dataResolucao, solucao: ocorrencias.solucao,
  projetoId: projetos.id, projetoCodigo: projetos.codigo, projetoNome: projetos.nome, etapaId: etapas.id, etapaLetra: etapas.letra,
  atividadeId: atividades.id, atividadeNome: atividades.nome, tipoId: tiposOcorrencia.id, tipoNome: tiposOcorrencia.nome,
  responsavelId: resp.id, responsavelNome: resp.nome, createdAt: ocorrencias.createdAt, updatedAt: ocorrencias.updatedAt,
  anexos: sql<number>`(SELECT count(*) FROM documentos d WHERE d.ocorrencia_id = ${ocorrencias.id} AND d.ativo)`,
};
const sel = () => db.select(cols).from(ocorrencias)
  .innerJoin(projetos, eq(projetos.id, ocorrencias.projetoId))
  .leftJoin(etapas, eq(etapas.id, ocorrencias.etapaId)).leftJoin(atividades, eq(atividades.id, ocorrencias.atividadeId))
  .leftJoin(tiposOcorrencia, eq(tiposOcorrencia.id, ocorrencias.tipoId)).leftJoin(resp, eq(resp.id, ocorrencias.responsavelId));
const fmt = (r: Awaited<ReturnType<typeof sel>>[number]) => {
  const aberta = r.status === 'ABERTA' || r.status === 'EM_TRATAMENTO';
  return {
    id: r.id, titulo: r.titulo, descricao: r.descricao, data: r.data, severidade: r.severidade, status: r.status,
    prazoResolucao: r.prazoResolucao, dataResolucao: r.dataResolucao, solucao: r.solucao,
    vencida: aberta && !!r.prazoResolucao && r.prazoResolucao < hoje(),
    projeto: { id: r.projetoId, codigo: r.projetoCodigo, nome: r.projetoNome },
    etapa: r.etapaId ? { id: r.etapaId, letra: r.etapaLetra, codigo: `${r.projetoCodigo} ${r.etapaLetra}` } : null,
    atividade: r.atividadeId ? { id: r.atividadeId, nome: r.atividadeNome } : null,
    tipo: r.tipoId ? { id: r.tipoId, nome: r.tipoNome } : null, responsavel: r.responsavelId ? { id: r.responsavelId, nome: r.responsavelNome } : null,
    anexos: Number(r.anexos), createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
};

const boolQ = z.preprocess((v) => (v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : undefined), z.boolean().optional());
const listQ = pageSchema.extend({
  projetoId: optInt, etapaId: optInt, responsavelId: optInt, tipoId: optInt, busca: optStr,
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(STATUS_OCORRENCIA).optional()),
  severidade: z.preprocess((v) => (v === '' ? undefined : v), z.enum(SEV).optional()), aberta: boolQ, vencida: boolQ,
});
occurrencesRouter.get('/', requirePerm('occurrences.view'), wrap(async (req, res) => {
  const q = parse(listQ, req.query);
  const w: (SQL | undefined)[] = [condAcesso(req.user!)];
  if (q.projetoId) w.push(eq(ocorrencias.projetoId, q.projetoId));
  if (q.etapaId) w.push(eq(ocorrencias.etapaId, q.etapaId));
  if (q.responsavelId) w.push(eq(ocorrencias.responsavelId, q.responsavelId));
  if (q.tipoId) w.push(eq(ocorrencias.tipoId, q.tipoId));
  if (q.status) w.push(eq(ocorrencias.status, q.status));
  if (q.severidade) w.push(eq(ocorrencias.severidade, q.severidade));
  if (q.aberta) w.push(inArray(ocorrencias.status, ['ABERTA', 'EM_TRATAMENTO']));
  if (q.vencida) w.push(and(inArray(ocorrencias.status, ['ABERTA', 'EM_TRATAMENTO']), sql`${ocorrencias.prazoResolucao} < ${hoje()}::date`));
  if (q.busca) { const b = `%${q.busca}%`; w.push(or(ilike(ocorrencias.titulo, b), ilike(ocorrencias.descricao, b), ilike(projetos.codigo, b))); }
  const where = and(...w);
  const [{ n }] = await db.select({ n: count() }).from(ocorrencias).innerJoin(projetos, eq(projetos.id, ocorrencias.projetoId)).where(where);
  const rows = await sel().where(where).orderBy(
    sql`CASE WHEN ${ocorrencias.status} IN ('ABERTA','EM_TRATAMENTO') THEN 0 ELSE 1 END`,
    sql`CASE ${ocorrencias.severidade} WHEN 'CRITICA' THEN 0 WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END`, desc(ocorrencias.data), desc(ocorrencias.id),
  ).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  res.json({ itens: rows.map(fmt), total: n, page: q.page, pageSize: q.pageSize });
}));

async function carregar(req: any, id: number) {
  const [r] = await sel().where(and(eq(ocorrencias.id, id), condAcesso(req.user)));
  if (!r) throw notFound('Ocorrência');
  return r;
}
occurrencesRouter.get('/:id', requirePerm('occurrences.view'), wrap(async (req, res) => res.json(fmt(await carregar(req, Number(req.params.id))))));

const corpo = z.object({
  projetoId: z.coerce.number().int(), titulo: z.string().trim().min(3, 'Informe o título.').max(250), descricao: optStr,
  data: optDate, etapaId: optInt, atividadeId: optInt, tipoId: optInt, responsavelId: optInt,
  severidade: z.enum(SEV).default('MEDIA'), prazoResolucao: optDate,
});
async function vinculos(projetoId: number, etapaId?: number | null, atividadeId?: number | null) {
  if (etapaId) {
    const [e] = await db.select({ p: etapas.projetoId }).from(etapas).where(eq(etapas.id, etapaId));
    if (!e || e.p !== projetoId) throw badRequest('A etapa não pertence ao projeto.');
  }
  if (atividadeId) {
    const [a] = await db.select({ e: atividades.etapaId, p: etapas.projetoId }).from(atividades).innerJoin(etapas, eq(etapas.id, atividades.etapaId)).where(eq(atividades.id, atividadeId));
    if (!a || a.p !== projetoId) throw badRequest('A atividade não pertence ao projeto.');
    if (etapaId && a.e !== etapaId) throw badRequest('A atividade não pertence à etapa.');
  }
}
const LAB = { titulo: 'Título', descricao: 'Descrição', severidade: 'Severidade', status: 'Status', etapaId: 'Etapa', atividadeId: 'Atividade', tipoId: 'Tipo', responsavelId: 'Responsável', prazoResolucao: 'Prazo de resolução', dataResolucao: 'Data de resolução', solucao: 'Solução' };

occurrencesRouter.post('/', requirePerm('occurrences.manage'), wrap(async (req, res) => {
  const d = parse(corpo, req.body);
  await assertProjeto(req.user!, d.projetoId);
  await vinculos(d.projetoId, d.etapaId, d.atividadeId); await validarPessoas([d.responsavelId]);
  const id = await db.transaction(async (tx) => {
    const [o] = await tx.insert(ocorrencias).values({
      projetoId: d.projetoId, titulo: d.titulo, descricao: d.descricao, etapaId: d.etapaId, atividadeId: d.atividadeId, tipoId: d.tipoId,
      responsavelId: d.responsavelId, severidade: d.severidade, prazoResolucao: d.prazoResolucao, createdById: req.user!.id,
      ...(d.data ? { data: new Date(`${d.data}T12:00:00`) } : {}),
    }).returning({ id: ocorrencias.id });
    await audit(tx, ctxOf(req), { acao: 'CREATE', modulo: 'Ocorrências', registroId: o.id, rotulo: d.titulo, projetoId: d.projetoId, info: { severidade: d.severidade } });
    return o.id;
  });
  res.status(201).json(fmt(await carregar(req, id)));
}));

const patch = z.object({
  titulo: z.string().trim().min(3).max(250).optional(), descricao: z.string().nullable().optional(),
  etapaId: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().nullable().optional()),
  atividadeId: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().nullable().optional()),
  tipoId: optInt, responsavelId: optInt, severidade: z.enum(SEV).optional(), status: z.enum(STATUS_OCORRENCIA).optional(),
  prazoResolucao: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
  dataResolucao: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
  solucao: z.string().nullable().optional(),
});
occurrencesRouter.patch('/:id', requirePerm('occurrences.manage'), wrap(async (req, res) => {
  const atual = await carregar(req, Number(req.params.id));
  const b = parse(patch, req.body);
  const [antes] = await db.select().from(ocorrencias).where(eq(ocorrencias.id, atual.id));
  const novo: Record<string, any> = { ...antes };
  for (const k of Object.keys(b) as (keyof typeof b)[]) if (b[k] !== undefined) novo[k] = b[k] === '' ? null : b[k];
  if (b.status && b.status !== antes.status) {
    if (b.status === 'RESOLVIDA' && !b.dataResolucao) novo.dataResolucao = hoje();
    if (b.status === 'ABERTA' || b.status === 'EM_TRATAMENTO') novo.dataResolucao = null;
  }
  if (novo.status === 'RESOLVIDA' && !novo.solucao) throw badRequest('Informe a solução aplicada para resolver a ocorrência.');
  await vinculos(antes.projetoId!, novo.etapaId, novo.atividadeId); if (b.responsavelId !== undefined) await validarPessoas([novo.responsavelId]);
  await db.transaction(async (tx) => {
    await tx.update(ocorrencias).set({
      titulo: novo.titulo, descricao: novo.descricao, etapaId: novo.etapaId, atividadeId: novo.atividadeId, tipoId: novo.tipoId, responsavelId: novo.responsavelId,
      severidade: novo.severidade, status: novo.status, prazoResolucao: novo.prazoResolucao, dataResolucao: novo.dataResolucao, solucao: novo.solucao, updatedAt: new Date(),
    }).where(eq(ocorrencias.id, atual.id));
    await auditDiff(tx, ctxOf(req), { modulo: 'Ocorrências', registroId: atual.id, rotulo: antes.titulo, projetoId: antes.projetoId, before: antes, after: novo, labels: LAB });
  });
  res.json(fmt(await carregar(req, atual.id)));
}));
