import { Router } from 'express';
import { z } from 'zod';
import { aliasedTable, and, count, desc, eq, gte, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import { assertProjeto, condAcesso } from '../lib/projetos.js';
import { db, movimentacoes, projetos, etapas, atividades, users, tiposMovimentacao } from '../db/index.js';
import { audit, ctxOf } from '../lib/audit.js';
import { badRequest, notFound, optDate, optInt, optStr, pageSchema, parse, wrap } from '../lib/http.js';
import { requirePerm } from '../middleware/auth.js';
import { hoje } from '../lib/prazo.js';

export const movementsRouter = Router();

const cols = {
  id: movimentacoes.id, dataHora: movimentacoes.dataHora, descricao: movimentacoes.descricao, importada: movimentacoes.importada,
  projetoId: projetos.id, projetoCodigo: projetos.codigo, projetoNome: projetos.nome,
  etapaId: etapas.id, etapaLetra: etapas.letra, atividadeId: atividades.id, atividadeNome: atividades.nome,
  usuarioId: users.id, usuarioNome: users.nome, tipoId: tiposMovimentacao.id, tipoNome: tiposMovimentacao.nome,
};
const sel = () => db.select(cols).from(movimentacoes)
  .innerJoin(projetos, eq(projetos.id, movimentacoes.projetoId)).innerJoin(users, eq(users.id, movimentacoes.usuarioId))
  .innerJoin(tiposMovimentacao, eq(tiposMovimentacao.id, movimentacoes.tipoId))
  .leftJoin(etapas, eq(etapas.id, movimentacoes.etapaId)).leftJoin(atividades, eq(atividades.id, movimentacoes.atividadeId));
const fmt = (r: Awaited<ReturnType<typeof sel>>[number]) => ({
  id: r.id, dataHora: r.dataHora, descricao: r.descricao, importada: r.importada,
  projeto: { id: r.projetoId, codigo: r.projetoCodigo, nome: r.projetoNome },
  etapa: r.etapaId ? { id: r.etapaId, letra: r.etapaLetra, codigo: `${r.projetoCodigo} ${r.etapaLetra}` } : null,
  atividade: r.atividadeId ? { id: r.atividadeId, nome: r.atividadeNome } : null,
  usuario: { id: r.usuarioId, nome: r.usuarioNome }, tipo: { id: r.tipoId, nome: r.tipoNome },
});

// Usuários que já registraram movimentações (para o filtro do histórico)
movementsRouter.get('/usuarios', requirePerm('movements.view'), wrap(async (_req, res) => {
  res.json(await db.selectDistinct({ id: users.id, nome: users.nome }).from(movimentacoes).innerJoin(users, eq(users.id, movimentacoes.usuarioId)).orderBy(users.nome));
}));

const listQ = pageSchema.extend({ projetoId: optInt, etapaId: optInt, atividadeId: optInt, usuarioId: optInt, tipoId: optInt, de: optDate, ate: optDate, busca: optStr });
movementsRouter.get('/', requirePerm('movements.view'), wrap(async (req, res) => {
  const q = parse(listQ, req.query);
  const w: (SQL | undefined)[] = [condAcesso(req.user!)];
  if (q.projetoId) w.push(eq(movimentacoes.projetoId, q.projetoId));
  if (q.etapaId) w.push(eq(movimentacoes.etapaId, q.etapaId));
  if (q.atividadeId) w.push(eq(movimentacoes.atividadeId, q.atividadeId));
  if (q.usuarioId) w.push(eq(movimentacoes.usuarioId, q.usuarioId));
  if (q.tipoId) w.push(eq(movimentacoes.tipoId, q.tipoId));
  if (q.de) w.push(gte(movimentacoes.dataHora, sql`(${q.de}::date)::timestamp AT TIME ZONE ${process.env.TZ ?? 'America/Sao_Paulo'}`));
  if (q.ate) w.push(lt(movimentacoes.dataHora, sql`((${q.ate}::date + 1)::timestamp) AT TIME ZONE ${process.env.TZ ?? 'America/Sao_Paulo'}`));
  if (q.busca) { const b = `%${q.busca}%`; w.push(or(ilike(movimentacoes.descricao, b), ilike(projetos.codigo, b), ilike(projetos.nome, b))); }
  const where = and(...w);
  const [{ n }] = await db.select({ n: count() }).from(movimentacoes).innerJoin(projetos, eq(projetos.id, movimentacoes.projetoId)).where(where);
  const rows = await sel().where(where).orderBy(desc(movimentacoes.dataHora), desc(movimentacoes.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  res.json({ itens: rows.map(fmt), total: n, page: q.page, pageSize: q.pageSize });
}));

const criar = z.object({
  projetoId: z.coerce.number().int(), etapaId: optInt, atividadeId: optInt, tipoId: z.coerce.number().int(),
  descricao: z.string().trim().min(3, 'Descreva a movimentação.').max(5000),
  data: optDate, hora: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().regex(/^\d{2}:\d{2}$/).optional()), // retroativo opcional
});

// Movimentações são apenas INSERIDAS. Não existem rotas de edição/exclusão (e o banco bloqueia UPDATE/DELETE).
movementsRouter.post('/', requirePerm('movements.create'), wrap(async (req, res) => {
  const d = parse(criar, req.body);
  await assertProjeto(req.user!, d.projetoId);
  const tz = process.env.TZ ?? 'America/Sao_Paulo';
  if (d.data && d.data > hoje()) throw badRequest('A data da movimentação não pode ser futura.');
  const out = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(projetos).where(eq(projetos.id, d.projetoId)); if (!p) throw notFound('Projeto');
    if (!p.ativo) throw badRequest('Projeto inativo.');
    let etapaId = d.etapaId ?? null; const atividadeId = d.atividadeId ?? null;
    if (atividadeId) {
      const [a] = await tx.select().from(atividades).where(eq(atividades.id, atividadeId)); if (!a) throw notFound('Atividade');
      if (etapaId && etapaId !== a.etapaId) throw badRequest('A atividade não pertence à etapa informada.');
      etapaId = a.etapaId;
    }
    let letra: string | null = null;
    if (etapaId) {
      const [e] = await tx.select().from(etapas).where(eq(etapas.id, etapaId)); if (!e) throw notFound('Etapa');
      if (e.projetoId !== p.id) throw badRequest('A etapa não pertence ao projeto informado.');
      letra = e.letra;
    }
    const [t] = await tx.select().from(tiposMovimentacao).where(and(eq(tiposMovimentacao.id, d.tipoId), eq(tiposMovimentacao.ativo, true))); if (!t) throw badRequest('Tipo de movimentação inválido.');
    const dataHora = d.data
      ? (await tx.execute(sql`SELECT ((${d.data}::text::date + ${d.hora ?? "12:00"}::text::time)::timestamp AT TIME ZONE ${tz}::text) AS dh`)).rows[0] as { dh: string | Date }
      : { dh: new Date() };
    const [m] = await tx.insert(movimentacoes).values({ projetoId: p.id, etapaId, atividadeId, tipoId: d.tipoId, usuarioId: req.user!.id, descricao: d.descricao, dataHora: new Date(dataHora.dh) }).returning({ id: movimentacoes.id, dataHora: movimentacoes.dataHora });
    // "Última movimentação" nunca retrocede: uma movimentação retroativa não sobrescreve uma mais recente
    await tx.update(projetos).set({ ultimaMovimentacaoEm: sql`GREATEST(COALESCE(${projetos.ultimaMovimentacaoEm}, ${m.dataHora}), ${m.dataHora})` }).where(eq(projetos.id, p.id));
    await audit(tx, ctxOf(req), { acao: 'CREATE', modulo: 'Movimentações', registroId: m.id, rotulo: `${p.codigo}${letra ? ' ' + letra : ''}`, projetoId: p.id, novo: d.descricao, info: { tipo: t.nome } });
    return m;
  });
  res.status(201).json(out);
}));
void aliasedTable;
