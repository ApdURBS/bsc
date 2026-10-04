import { aliasedTable, and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import {
  db, projetos, frentes, users, statusTbl, confidencialidades, etapas, atividades,
} from '../db/index.js';
import { notFound } from './http.js';
import { calcPrazo, condSituacao, diasEntre, hoje, type PrazoCfg } from './prazo.js';

export const dono = aliasedTable(users, 'dono');

export const projetoCols = {
  id: projetos.id, codigo: projetos.codigo, sequencia: projetos.sequencia, nome: projetos.nome, descricao: projetos.descricao,
  frenteId: frentes.id, frenteCodigo: frentes.codigo, frenteNome: frentes.nome,
  donoId: dono.id, donoNome: dono.nome,
  // Scrum Master, equipe e tags são informados nas etapas: aqui são apenas a consolidação das etapas ativas.
  scrumNomes: sql<string[]>`(SELECT COALESCE(json_agg(DISTINCT su.nome ORDER BY su.nome), '[]'::json) FROM etapas se JOIN users su ON su.id = se.scrum_master_id WHERE se.projeto_id = ${projetos.id} AND se.ativo)`,
  membrosNomes: sql<string[]>`(SELECT COALESCE(json_agg(DISTINCT mu.nome ORDER BY mu.nome), '[]'::json) FROM etapa_membros em JOIN etapas me ON me.id = em.etapa_id JOIN users mu ON mu.id = em.user_id WHERE me.projeto_id = ${projetos.id} AND me.ativo)`,
  tagsAgg: sql<string[]>`(SELECT COALESCE(json_agg(DISTINCT t ORDER BY t), '[]'::json) FROM etapas te, unnest(te.tags) t WHERE te.projeto_id = ${projetos.id} AND te.ativo)`,
  statusId: statusTbl.id, statusNome: statusTbl.nome, statusCor: statusTbl.cor, statusClass: statusTbl.classificacao,
  confidencialidadeId: confidencialidades.id, confidencialidadeNome: confidencialidades.nome,
  dataInicio: projetos.dataInicio, dataPrevista: projetos.dataPrevista,
  dataConclusaoReal: projetos.dataConclusaoReal, ultimaMovimentacaoEm: projetos.ultimaMovimentacaoEm,
  percentualExecucao: projetos.percentualExecucao, pastaCaminho: projetos.pastaCaminho, observacoes: projetos.observacoes,
  ativo: projetos.ativo, camposExtras: projetos.camposExtras, createdAt: projetos.createdAt, updatedAt: projetos.updatedAt,
};

export function selecionarProjetos() {
  return db.select(projetoCols).from(projetos)
    .innerJoin(frentes, eq(frentes.id, projetos.frenteId))
    .innerJoin(statusTbl, eq(statusTbl.id, projetos.statusId))
    .innerJoin(confidencialidades, eq(confidencialidades.id, projetos.confidencialidadeId))
    .leftJoin(dono, eq(dono.id, projetos.donoId));
}

type Row = Awaited<ReturnType<typeof selecionarProjetos>>[number];

export function diasSemMovimentacao(ultima: Date | null, criado: Date, today = hoje()): number {
  const ref = ultima ?? criado;
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.TZ ?? 'America/Sao_Paulo' }).format(ref);
  return Math.max(0, diasEntre(d, today));
}

export function formatarProjeto(r: Row, cfg: PrazoCfg & { diasInatividade: number }) {
  const prazo = calcPrazo({ dataInicio: r.dataInicio, dataPrevista: r.dataPrevista, dataConclusaoReal: r.dataConclusaoReal, classificacao: r.statusClass }, cfg);
  const aberto = !['CONCLUIDO', 'CANCELADO'].includes(r.statusClass);
  const dias = diasSemMovimentacao(r.ultimaMovimentacaoEm, r.createdAt);
  return {
    id: r.id, codigo: r.codigo, nome: r.nome, descricao: r.descricao,
    frente: { id: r.frenteId, codigo: r.frenteCodigo, nome: r.frenteNome },
    dono: r.donoId ? { id: r.donoId, nome: r.donoNome } : null,
    scrumNomes: r.scrumNomes ?? [],
    equipeNomes: r.membrosNomes ?? [],
    status: { id: r.statusId, nome: r.statusNome, cor: r.statusCor, classificacao: r.statusClass },
    confidencialidade: { id: r.confidencialidadeId, nome: r.confidencialidadeNome },
    dataInicio: r.dataInicio, dataPrevista: r.dataPrevista, dataConclusaoReal: r.dataConclusaoReal,
    ultimaMovimentacaoEm: r.ultimaMovimentacaoEm, percentualExecucao: r.percentualExecucao,
    pastaCaminho: r.pastaCaminho, observacoes: r.observacoes, tags: r.tagsAgg ?? [], ativo: r.ativo, camposExtras: r.camposExtras,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
    prazo,
    atrasado: aberto && (prazo.situacao === 'VENCIDO' || r.statusClass === 'ATRASO'),
    semMovimentacao: { dias, alerta: aberto && dias > cfg.diasInatividade },
  };
}

export const CARDS = ['total', 'vigentes', 'andamento', 'finalizados', 'atrasados', 'bloqueados', 'suspensos', 'semMovimentacao'] as const;
export type Card = (typeof CARDS)[number];

/** Condição de cada card do dashboard — a mesma usada para contar e para listar (clique no card = lista filtrada). */
export function condCard(card: Card, cfg: PrazoCfg & { diasInatividade: number }): SQL {
  const aberto = sql`${statusTbl.classificacao} NOT IN ('CONCLUIDO','CANCELADO')`;
  switch (card) {
    case 'total': return sql`true`;
    case 'vigentes': return aberto;
    case 'andamento': return sql`${statusTbl.classificacao} = 'EM_ANDAMENTO'`;
    case 'finalizados': return sql`${statusTbl.classificacao} = 'CONCLUIDO'`;
    case 'atrasados': return sql`(${aberto} AND (${statusTbl.classificacao} = 'ATRASO' OR ${condSituacao('VENCIDO', projetos.dataPrevista, statusTbl.classificacao, cfg)}))`;
    case 'bloqueados': return sql`${statusTbl.classificacao} = 'BLOQUEIO'`;
    case 'suspensos': return sql`${statusTbl.classificacao} = 'PAUSADO'`;
    case 'semMovimentacao': {
      const limite = new Date(Date.now() - cfg.diasInatividade * 86400000);
      return sql`(${aberto} AND COALESCE(${projetos.ultimaMovimentacaoEm}, ${projetos.createdAt}) < ${limite.toISOString()}::timestamptz)`;
    }
  }
}

/** Projetos em que o usuário participa (dono, ou responsável / Scrum Master / membro de alguma etapa). */
export function condResponsavel(colabId: number): SQL {
  return sql`(${projetos.donoId} = ${colabId}
    OR EXISTS (SELECT 1 FROM ${etapas} e WHERE e.projeto_id = ${projetos.id} AND e.ativo
      AND (e.responsavel_id = ${colabId} OR e.scrum_master_id = ${colabId}
        OR EXISTS (SELECT 1 FROM etapa_membros em WHERE em.etapa_id = e.id AND em.user_id = ${colabId}))))`;
}
void and;

/** Restringe consultas de projetos ao que o usuário pode enxergar (política de confidencialidade). */
export function condAcesso(user: { acessoIds: number[] }): SQL {
  return user.acessoIds.length ? inArray(projetos.confidencialidadeId, user.acessoIds) : sql`false`;
}
export const podeVerNivel = (user: { acessoIds: number[] }, confidencialidadeId: number) => user.acessoIds.includes(confidencialidadeId);

type U = { acessoIds: number[] };
/** 404 (e não 403) para não revelar a existência de projetos que o usuário não pode ver. */
export async function assertProjeto(user: U, projetoId: number) {
  const [p] = await db.select({ c: projetos.confidencialidadeId }).from(projetos).where(eq(projetos.id, projetoId));
  if (!p || !user.acessoIds.includes(p.c)) throw notFound('Projeto');
}
export async function assertEtapa(user: U, etapaId: number) {
  const [p] = await db.select({ c: projetos.confidencialidadeId }).from(etapas).innerJoin(projetos, eq(projetos.id, etapas.projetoId)).where(eq(etapas.id, etapaId));
  if (!p || !user.acessoIds.includes(p.c)) throw notFound('Etapa');
}
export async function assertAtividade(user: U, atividadeId: number) {
  const [p] = await db.select({ c: projetos.confidencialidadeId }).from(atividades).innerJoin(etapas, eq(etapas.id, atividades.etapaId)).innerJoin(projetos, eq(projetos.id, etapas.projetoId)).where(eq(atividades.id, atividadeId));
  if (!p || !user.acessoIds.includes(p.c)) throw notFound('Atividade');
}
