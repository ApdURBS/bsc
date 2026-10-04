import { and, asc, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm';
import { db, projetos, statusTbl, auditLogs } from '../db/index.js';
import { condAcesso, condCard, formatarProjeto, selecionarProjetos, type Card } from './projetos.js';
import { getPrazoCfg } from './settings.js';
import { hoje, somaDias } from './prazo.js';

export type Cell = string | number | null;
export interface Coluna { chave: string; titulo: string; largura?: number; num?: boolean }
export interface Resultado { colunas: Coluna[]; linhas: Record<string, Cell>[]; truncado: boolean }
export interface Filtros { frenteId?: number; statusId?: number; donoId?: number; de?: string; ate?: string; dias?: number; projetoId?: number; userId?: number; modulo?: string }
interface User { id: number; acessoIds: number[] }
export interface Def {
  id: string; nome: string; descricao: string; filtros: (keyof Filtros)[]; perm?: string;
  run(u: User, f: Filtros, max: number): Promise<Resultado>;
}

const TZ = process.env.TZ ?? 'America/Sao_Paulo';
export const br = (d: string | Date | null | undefined): string => {
  if (!d) return '';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'short' }).format(new Date(d));
};
export const brHora = (d: string | Date | null | undefined): string => (d ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(d)) : '');
const SIT: Record<string, string> = { NORMAL: 'Normal', ATENCAO: 'Atenção', CRITICO: 'Prazo crítico', VENCIDO: 'Vencido', SEM_PRAZO: 'Sem prazo', ENCERRADO: 'Encerrado' };

const COLS_PROJ: Coluna[] = [
  { chave: 'codigo', titulo: 'Código', largura: 9 }, { chave: 'nome', titulo: 'Projeto', largura: 34 }, { chave: 'frente', titulo: 'Frente', largura: 16 },
  { chave: 'dono', titulo: 'Dono', largura: 18 }, { chave: 'scrum', titulo: 'Scrum Master', largura: 18 }, { chave: 'equipe', titulo: 'Equipe', largura: 22 },
  { chave: 'status', titulo: 'Status', largura: 14 }, { chave: 'execucao', titulo: 'Exec. %', largura: 10, num: true },
  { chave: 'inicio', titulo: 'Início', largura: 11 }, { chave: 'prazo', titulo: 'Prazo', largura: 11 }, { chave: 'situacao', titulo: 'Situação', largura: 13 },
  { chave: 'ultima', titulo: 'Últ. movim.', largura: 12 },
];
const COLS_PROJ_PDF = ['codigo', 'nome', 'frente', 'scrum', 'status', 'execucao', 'prazo', 'situacao', 'ultima'];
void COLS_PROJ_PDF;

async function projetosRows(u: User, f: Filtros, max: number, extra?: SQL, ordem: 'codigo' | 'prazo' = 'codigo') {
  const cfg = await getPrazoCfg();
  const w: (SQL | undefined)[] = [condAcesso(u), eq(projetos.ativo, true), extra];
  if (f.frenteId) w.push(eq(projetos.frenteId, f.frenteId));
  if (f.statusId) w.push(eq(projetos.statusId, f.statusId));
  if (f.donoId) w.push(eq(projetos.donoId, f.donoId));
  const rows = await selecionarProjetos().where(and(...w))
    .orderBy(...(ordem === 'prazo' ? [sql`${projetos.dataPrevista} ASC NULLS LAST`] : []), asc(projetos.frenteId), asc(projetos.sequencia)).limit(max + 1);
  return { cfg, itens: rows.slice(0, max).map((r) => formatarProjeto(r, cfg)), truncado: rows.length > max };
}
type P = Awaited<ReturnType<typeof projetosRows>>['itens'][number];
const linhaProj = (p: P): Record<string, Cell> => ({
  codigo: p.codigo, nome: p.nome, frente: p.frente.nome, dono: p.dono?.nome ?? '', scrum: p.scrumNomes.join(', '), equipe: p.equipeNomes.join(', '),
  status: p.status.nome, execucao: p.percentualExecucao, inicio: br(p.dataInicio), prazo: br(p.dataPrevista),
  situacao: p.atrasado ? 'Vencido' : SIT[p.prazo.situacao] ?? '', ultima: br(p.ultimaMovimentacaoEm),
});
const listaProj = (extra: (cfg: Awaited<ReturnType<typeof getPrazoCfg>>, f: Filtros) => SQL | undefined, ordem: 'codigo' | 'prazo' = 'codigo') =>
  async (u: User, f: Filtros, max: number): Promise<Resultado> => {
    const cfg = await getPrazoCfg();
    const r = await projetosRows(u, f, max, extra(cfg, f), ordem);
    return { colunas: COLS_PROJ, linhas: r.itens.map(linhaProj), truncado: r.truncado };
  };
const card = (c: Card) => (cfg: Awaited<ReturnType<typeof getPrazoCfg>>) => condCard(c, cfg);

const COLS_GRUPO: Coluna[] = [
  { chave: 'grupo', titulo: 'Grupo', largura: 28 }, { chave: 'total', titulo: 'Projetos', num: true }, { chave: 'andamento', titulo: 'Em andamento', num: true },
  { chave: 'atrasados', titulo: 'Atrasados', num: true }, { chave: 'finalizados', titulo: 'Finalizados', num: true }, { chave: 'bloqueados', titulo: 'Bloqueados', num: true },
  { chave: 'suspensos', titulo: 'Suspensos', num: true }, { chave: 'execMedia', titulo: 'Exec. média %', num: true },
];
function agrupar(itens: P[], chaves: (p: P) => string[]): Resultado {
  const m = new Map<string, P[]>();
  for (const p of itens) for (const k of (chaves(p).length ? chaves(p) : ['(não informado)'])) (m.get(k) ?? m.set(k, []).get(k)!).push(p);
  const linhas = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([grupo, ps]) => ({
    grupo, total: ps.length, andamento: ps.filter((p) => p.status.classificacao === 'EM_ANDAMENTO').length, atrasados: ps.filter((p) => p.atrasado).length,
    finalizados: ps.filter((p) => p.status.classificacao === 'CONCLUIDO').length, bloqueados: ps.filter((p) => p.status.classificacao === 'BLOQUEIO').length,
    suspensos: ps.filter((p) => p.status.classificacao === 'PAUSADO').length, execMedia: Math.round(ps.reduce((s, p) => s + p.percentualExecucao, 0) / ps.length),
  }));
  return { colunas: COLS_GRUPO, linhas, truncado: false };
}
const porGrupo = (chaves: (p: P) => string[]) => async (u: User, f: Filtros): Promise<Resultado> => agrupar((await projetosRows(u, f, 100000)).itens, chaves);

const dataFiltro = (col: any, f: Filtros): SQL[] => {
  const w: SQL[] = [];
  if (f.de) w.push(gte(col, sql`(${f.de}::date)::timestamp AT TIME ZONE ${TZ}`));
  if (f.ate) w.push(lt(col, sql`((${f.ate}::date + 1)::timestamp) AT TIME ZONE ${TZ}`));
  return w;
};

export const RELATORIOS: Def[] = [
  { id: 'geral', nome: 'Relatório Geral', descricao: 'Todos os projetos ativos.', filtros: ['frenteId', 'statusId', 'donoId'], run: listaProj(() => undefined) },
  { id: 'vigentes', nome: 'Projetos Vigentes', descricao: 'Projetos em aberto (não finalizados nem cancelados).', filtros: ['frenteId', 'statusId', 'donoId'], run: listaProj(card('vigentes')) },
  { id: 'atrasados', nome: 'Projetos Atrasados', descricao: 'Projetos vencidos ou com status de atraso.', filtros: ['frenteId', 'donoId'], run: listaProj(card('atrasados'), 'prazo') },
  {
    id: 'a-vencer', nome: 'Projetos a Vencer', descricao: 'Projetos em aberto com prazo nos próximos N dias (padrão 30).', filtros: ['frenteId', 'donoId', 'dias'],
    run: listaProj((_c, f) => sql`(${statusTbl.classificacao} NOT IN ('CONCLUIDO','CANCELADO') AND ${projetos.dataPrevista} BETWEEN ${hoje()}::date AND ${somaDias(hoje(), f.dias ?? 30)}::date)`, 'prazo'),
  },
  { id: 'por-frente', nome: 'Projetos por Frente', descricao: 'Consolidado de projetos por frente do BSC.', filtros: ['statusId'], run: porGrupo((p) => [`${p.frente.codigo} — ${p.frente.nome}`]) },
  { id: 'por-scrum', nome: 'Projetos por Scrum Master', descricao: 'Consolidado por Scrum Master (definido nas etapas).', filtros: ['frenteId'], run: porGrupo((p) => p.scrumNomes) },
  { id: 'por-equipe', nome: 'Projetos por Equipe', descricao: 'Consolidado por integrante das equipes das etapas.', filtros: ['frenteId'], run: porGrupo((p) => p.equipeNomes) },
  {
    id: 'etapas-atrasadas', nome: 'Etapas Atrasadas', descricao: 'Etapas em aberto vencidas ou com status de atraso.', filtros: ['frenteId', 'donoId'],
    async run(u, f, max) {
      const rows = await db.execute(sql`
        SELECT projetos.codigo, projetos.nome AS projeto, fr.nome AS frente, e.letra, e.nome AS etapa, r.nome AS responsavel, sm.nome AS scrum, s.nome AS status,
               e.data_inicio, e.data_prevista, e.percentual_execucao AS exec,
               (SELECT string_agg(mu.nome, ', ' ORDER BY mu.nome) FROM etapa_membros em JOIN users mu ON mu.id = em.user_id WHERE em.etapa_id = e.id) AS equipe,
               (${hoje()}::date - e.data_prevista) AS dias_atraso
        FROM etapas e JOIN projetos ON projetos.id = e.projeto_id JOIN frentes fr ON fr.id = projetos.frente_id JOIN status s ON s.id = e.status_id
        LEFT JOIN users r ON r.id = e.responsavel_id LEFT JOIN users sm ON sm.id = e.scrum_master_id
        WHERE e.ativo AND projetos.ativo AND ${condAcesso(u)} AND s.classificacao NOT IN ('CONCLUIDO','CANCELADO')
          AND (s.classificacao = 'ATRASO' OR e.data_prevista < ${hoje()}::date)
          ${f.frenteId ? sql`AND projetos.frente_id = ${f.frenteId}` : sql``} ${f.donoId ? sql`AND projetos.dono_id = ${f.donoId}` : sql``}
        ORDER BY e.data_prevista NULLS LAST, projetos.codigo, e.ordem LIMIT ${max + 1}`);
      const r = rows.rows as any[];
      return {
        colunas: [
          { chave: 'codigo', titulo: 'Etapa', largura: 10 }, { chave: 'etapa', titulo: 'Nome da etapa', largura: 32 }, { chave: 'projeto', titulo: 'Projeto', largura: 30 },
          { chave: 'frente', titulo: 'Frente', largura: 14 }, { chave: 'responsavel', titulo: 'Responsável', largura: 18 }, { chave: 'scrum', titulo: 'Scrum Master', largura: 18 },
          { chave: 'equipe', titulo: 'Equipe', largura: 22 }, { chave: 'status', titulo: 'Status', largura: 13 }, { chave: 'prazo', titulo: 'Prazo', largura: 11 },
          { chave: 'atraso', titulo: 'Dias em atraso', num: true }, { chave: 'exec', titulo: 'Exec. %', num: true },
        ],
        linhas: r.slice(0, max).map((x) => ({
          codigo: `${x.codigo} ${x.letra}`, etapa: x.etapa, projeto: `${x.codigo} — ${x.projeto}`, frente: x.frente, responsavel: x.responsavel ?? '', scrum: x.scrum ?? '',
          equipe: x.equipe ?? '', status: x.status, prazo: br(x.data_prevista), atraso: x.dias_atraso == null ? null : Math.max(0, Number(x.dias_atraso)), exec: Number(x.exec),
        })),
        truncado: r.length > max,
      };
    },
  },
  {
    id: 'sem-movimentacao', nome: 'Projetos sem movimentação', descricao: 'Projetos em aberto sem movimentação além do limite configurado.', filtros: ['frenteId', 'donoId'],
    async run(u, f, max) {
      const cfg = await getPrazoCfg();
      const r = await projetosRows(u, f, max, condCard('semMovimentacao', cfg));
      const colunas: Coluna[] = [...COLS_PROJ.slice(0, 4), { chave: 'dias', titulo: 'Dias sem movim.', num: true }, { chave: 'ultima', titulo: 'Últ. movim.', largura: 12 }, { chave: 'scrum', titulo: 'Scrum Master', largura: 18 }, { chave: 'status', titulo: 'Status', largura: 14 }];
      const linhas = r.itens.map((p) => ({ ...linhaProj(p), dias: p.semMovimentacao.dias, ultima: br(p.ultimaMovimentacaoEm) || 'Nunca' })).sort((a, b) => Number(b.dias) - Number(a.dias));
      return { colunas, linhas, truncado: r.truncado };
    },
  },
  {
    id: 'movimentacoes', nome: 'Histórico de movimentações', descricao: 'Movimentações registradas, mais recentes primeiro.', filtros: ['projetoId', 'frenteId', 'userId', 'de', 'ate'],
    async run(u, f, max) {
      const rows = await db.execute(sql`
        SELECT m.data_hora, projetos.codigo, projetos.nome AS projeto, e.letra, a.nome AS atividade, t.nome AS tipo, us.nome AS usuario, m.descricao
        FROM movimentacoes m JOIN projetos ON projetos.id = m.projeto_id JOIN users us ON us.id = m.usuario_id JOIN tipos_movimentacao t ON t.id = m.tipo_id
        LEFT JOIN etapas e ON e.id = m.etapa_id LEFT JOIN atividades a ON a.id = m.atividade_id
        WHERE ${condAcesso(u)}
          ${f.projetoId ? sql`AND m.projeto_id = ${f.projetoId}` : sql``} ${f.frenteId ? sql`AND projetos.frente_id = ${f.frenteId}` : sql``} ${f.userId ? sql`AND m.usuario_id = ${f.userId}` : sql``}
          ${f.de ? sql`AND m.data_hora >= (${f.de}::date)::timestamp AT TIME ZONE ${TZ}` : sql``} ${f.ate ? sql`AND m.data_hora < ((${f.ate}::date + 1)::timestamp) AT TIME ZONE ${TZ}` : sql``}
        ORDER BY m.data_hora DESC, m.id DESC LIMIT ${max + 1}`);
      const r = rows.rows as any[];
      return {
        colunas: [
          { chave: 'data', titulo: 'Data/hora', largura: 16 }, { chave: 'codigo', titulo: 'Projeto', largura: 9 }, { chave: 'nome', titulo: 'Nome do projeto', largura: 28 },
          { chave: 'etapa', titulo: 'Etapa', largura: 7 }, { chave: 'atividade', titulo: 'Atividade', largura: 24 }, { chave: 'tipo', titulo: 'Tipo', largura: 14 },
          { chave: 'usuario', titulo: 'Usuário', largura: 18 }, { chave: 'descricao', titulo: 'Descrição', largura: 60 },
        ],
        linhas: r.slice(0, max).map((x) => ({ data: brHora(x.data_hora), codigo: x.codigo, nome: x.projeto, etapa: x.letra ?? '', atividade: x.atividade ?? '', tipo: x.tipo, usuario: x.usuario, descricao: x.descricao })),
        truncado: r.length > max,
      };
    },
  },
  {
    id: 'auditoria', nome: 'Relatório de auditoria', descricao: 'Trilha de auditoria (restrito a quem pode ver o log completo).', filtros: ['userId', 'modulo', 'projetoId', 'de', 'ate'], perm: 'audit.view',
    async run(_u, f, max) {
      const w: (SQL | undefined)[] = [...dataFiltro(auditLogs.dataHora, f)];
      if (f.userId) w.push(eq(auditLogs.userId, f.userId));
      if (f.projetoId) w.push(eq(auditLogs.projetoId, f.projetoId));
      if (f.modulo) w.push(eq(auditLogs.modulo, f.modulo));
      const r = await db.select().from(auditLogs).where(and(...w)).orderBy(desc(auditLogs.dataHora), desc(auditLogs.id)).limit(max + 1);
      return {
        colunas: [
          { chave: 'data', titulo: 'Data/hora', largura: 16 }, { chave: 'usuario', titulo: 'Usuário', largura: 18 }, { chave: 'acao', titulo: 'Ação', largura: 16 },
          { chave: 'modulo', titulo: 'Módulo', largura: 14 }, { chave: 'registro', titulo: 'Registro', largura: 26 }, { chave: 'campo', titulo: 'Campo', largura: 18 },
          { chave: 'anterior', titulo: 'Valor anterior', largura: 26 }, { chave: 'novo', titulo: 'Novo valor', largura: 26 }, { chave: 'ip', titulo: 'IP', largura: 14 },
        ],
        linhas: r.slice(0, max).map((x) => ({ data: brHora(x.dataHora), usuario: x.usuarioNome ?? '', acao: x.acao, modulo: x.modulo, registro: x.registroRotulo ?? '', campo: x.campo ?? '', anterior: x.valorAnterior ?? '', novo: x.valorNovo ?? '', ip: x.ip ?? '' })),
        truncado: r.length > max,
      };
    },
  },
];
