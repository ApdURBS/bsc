import { Router } from 'express';
import { z } from 'zod';
import { and, sql, type SQL } from 'drizzle-orm';
import { db, projetos, movimentacoes } from '../db/index.js';
import { optInt, parse, wrap } from '../lib/http.js';
import { requirePerm } from '../middleware/auth.js';
import { CARDS, condAcesso, condCard, diasSemMovimentacao, type Card } from '../lib/projetos.js';
import { condSituacao, hoje, somaDias } from '../lib/prazo.js';
import { getPrazoCfg } from '../lib/settings.js';
import { config } from '../config.js';

export const indicadoresRouter = Router();
indicadoresRouter.use(requirePerm('dashboard.view'));
const rows = async <T>(q: SQL) => (await db.execute(q)).rows as T[];
const num = (v: unknown) => Number(v ?? 0);
const FROM_P = sql`FROM projetos JOIN status ON status.id = projetos.status_id`;

/** Participação de uma pessoa em etapas: responsável, Scrum Master ou membro da equipe. */
const PART = sql`(SELECT e.id AS etapa_id, e.responsavel_id AS user_id FROM etapas e WHERE e.responsavel_id IS NOT NULL
  UNION SELECT e.id, e.scrum_master_id FROM etapas e WHERE e.scrum_master_id IS NOT NULL
  UNION SELECT em.etapa_id, em.user_id FROM etapa_membros em)`;
const ETAPA_ATRASADA = (today: string) => sql`(es.classificacao NOT IN ('CONCLUIDO','CANCELADO') AND (es.classificacao = 'ATRASO' OR et.data_prevista < ${today}::date))`;

// Indicadores por Scrum Master (o Scrum Master é definido nas etapas)
indicadoresRouter.get('/por-scrum', wrap(async (req, res) => {
  const cfg = await getPrazoCfg();
  const r = await rows<any>(sql`
    SELECT u.id, u.nome,
      count(DISTINCT projetos.id) AS projetos,
      count(DISTINCT projetos.id) FILTER (WHERE ${condCard('andamento', cfg)}) AS andamento,
      count(DISTINCT projetos.id) FILTER (WHERE ${condCard('atrasados', cfg)}) AS atrasados,
      count(DISTINCT projetos.id) FILTER (WHERE ${condCard('finalizados', cfg)}) AS finalizados,
      count(DISTINCT projetos.id) FILTER (WHERE ${condCard('bloqueados', cfg)}) AS bloqueados
    FROM etapas et JOIN projetos ON projetos.id = et.projeto_id JOIN status ON status.id = projetos.status_id JOIN users u ON u.id = et.scrum_master_id
    WHERE et.ativo AND projetos.ativo AND ${condAcesso(req.user!)}
    GROUP BY u.id, u.nome ORDER BY projetos DESC, u.nome`);
  res.json(r.map((x) => ({ id: x.id, nome: x.nome, projetos: num(x.projetos), andamento: num(x.andamento), atrasados: num(x.atrasados), finalizados: num(x.finalizados), bloqueados: num(x.bloqueados) })));
}));

// Indicadores por equipe (pessoas que participam das etapas)
indicadoresRouter.get('/por-equipe', wrap(async (req, res) => {
  const today = hoje();
  const r = await rows<any>(sql`
    SELECT u.id, u.nome,
      count(DISTINCT projetos.id) AS projetos,
      count(DISTINCT et.id) AS etapas,
      (SELECT count(*) FROM atividades a JOIN etapas e2 ON e2.id = a.etapa_id JOIN projetos p2 ON p2.id = e2.projeto_id
         WHERE a.ativo AND e2.ativo AND p2.ativo AND a.responsavel_id = u.id AND p2.confidencialidade_id IN (${sql.join(req.user!.acessoIds.length ? req.user!.acessoIds.map((i) => sql`${i}`) : [sql`-1`], sql`, `)})) AS atividades,
      count(DISTINCT et.id) FILTER (WHERE ${ETAPA_ATRASADA(today)}) AS atrasos,
      count(DISTINCT et.id) FILTER (WHERE es.classificacao = 'CONCLUIDO') AS finalizacoes,
      count(DISTINCT et.id) FILTER (WHERE es.classificacao NOT IN ('CONCLUIDO','CANCELADO')) AS pendencias
    FROM ${PART} par JOIN users u ON u.id = par.user_id JOIN etapas et ON et.id = par.etapa_id
      JOIN status es ON es.id = et.status_id JOIN projetos ON projetos.id = et.projeto_id
    WHERE et.ativo AND projetos.ativo AND ${condAcesso(req.user!)}
    GROUP BY u.id, u.nome ORDER BY pendencias DESC, u.nome`);
  res.json(r.map((x) => ({ id: x.id, nome: x.nome, projetos: num(x.projetos), etapas: num(x.etapas), atividades: num(x.atividades), atrasos: num(x.atrasos), finalizacoes: num(x.finalizacoes), pendencias: num(x.pendencias) })));
}));

// Movimentações por mês
const movQ = z.object({ meses: z.coerce.number().int().min(1).max(36).default(12), projetoId: optInt, frenteId: optInt, usuarioId: optInt, scrumMasterId: optInt, membroId: optInt });
indicadoresRouter.get('/movimentacoes-mes', wrap(async (req, res) => {
  const q = parse(movQ, req.query); const today = hoje();
  const ini = `${somaDias(today, -31 * (q.meses - 1)).slice(0, 7)}-01`;
  const w: SQL[] = [condAcesso(req.user!), sql`${movimentacoes.dataHora} >= (${ini}::date::timestamp AT TIME ZONE ${config.tz}::text)`];
  if (q.projetoId) w.push(sql`${movimentacoes.projetoId} = ${q.projetoId}`);
  if (q.frenteId) w.push(sql`${projetos.frenteId} = ${q.frenteId}`);
  if (q.usuarioId) w.push(sql`${movimentacoes.usuarioId} = ${q.usuarioId}`);
  if (q.scrumMasterId) w.push(sql`EXISTS (SELECT 1 FROM etapas e WHERE e.projeto_id = ${projetos.id} AND e.ativo AND e.scrum_master_id = ${q.scrumMasterId})`);
  if (q.membroId) w.push(sql`EXISTS (SELECT 1 FROM ${PART} par JOIN etapas e ON e.id = par.etapa_id WHERE e.projeto_id = ${projetos.id} AND e.ativo AND par.user_id = ${q.membroId})`);
  const r = await rows<{ mes: string; n: string }>(sql`
    SELECT to_char(date_trunc('month', ${movimentacoes.dataHora} AT TIME ZONE ${config.tz}::text), 'YYYY-MM') AS mes, count(*) AS n
    FROM ${movimentacoes} JOIN ${projetos} ON ${projetos.id} = ${movimentacoes.projetoId} WHERE ${and(...w)} GROUP BY 1`);
  const m = new Map(r.map((x) => [x.mes, num(x.n)]));
  const out: { mes: string; total: number }[] = [];
  let [y, mo] = today.split('-').map(Number); mo -= q.meses - 1; while (mo < 1) { mo += 12; y -= 1; }
  for (let i = 0; i < q.meses; i++) { const k = `${y}-${String(mo).padStart(2, '0')}`; out.push({ mes: k, total: m.get(k) ?? 0 }); mo++; if (mo > 12) { mo = 1; y++; } }
  res.json(out);
}));

// Projetos sem movimentação recente
indicadoresRouter.get('/inatividade', wrap(async (req, res) => {
  const cfg = await getPrazoCfg();
  const dias = z.coerce.number().int().min(1).max(3650).default(cfg.diasInatividade).parse(req.query.dias ?? undefined);
  const limite = new Date(Date.now() - dias * 86400000).toISOString();
  const r = await rows<any>(sql`
    SELECT projetos.id, projetos.codigo, projetos.nome, projetos.ultima_movimentacao_em AS ultima, projetos.created_at AS criado,
      du.nome AS dono,
      (SELECT string_agg(DISTINCT su.nome, ', ') FROM etapas e JOIN users su ON su.id = e.scrum_master_id WHERE e.projeto_id = projetos.id AND e.ativo) AS scrum,
      (SELECT u2.nome FROM movimentacoes m JOIN users u2 ON u2.id = m.usuario_id WHERE m.projeto_id = projetos.id ORDER BY m.data_hora DESC LIMIT 1) AS usuario
    ${FROM_P} LEFT JOIN users du ON du.id = projetos.dono_id
    WHERE projetos.ativo AND status.classificacao NOT IN ('CONCLUIDO','CANCELADO') AND ${condAcesso(req.user!)}
      AND COALESCE(projetos.ultima_movimentacao_em, projetos.created_at) < ${limite}::timestamptz
    ORDER BY COALESCE(projetos.ultima_movimentacao_em, projetos.created_at) ASC LIMIT 50`);
  res.json({ dias, itens: r.map((x) => ({ id: x.id, codigo: x.codigo, nome: x.nome, ultimaMovimentacaoEm: x.ultima, usuario: x.usuario, diasSemMovimentacao: diasSemMovimentacao(x.ultima ? new Date(x.ultima) : null, new Date(x.criado)), scrumMasters: x.scrum, dono: x.dono })) });
}));

// Painel de prazos: projetos e etapas por faixa + listas de atenção
indicadoresRouter.get('/prazos', wrap(async (req, res) => {
  const cfg = await getPrazoCfg(); const today = hoje();
  const aberto = sql`status.classificacao NOT IN ('CONCLUIDO','CANCELADO')`;
  const faixa = (col: SQL, min: number, max: number | null) => sql`count(*) FILTER (WHERE ${aberto} AND ${col} >= ${somaDias(today, min)}::date ${max == null ? sql`` : sql`AND ${col} <= ${somaDias(today, max)}::date`})`;
  const contagens = (col: SQL) => sql`
    count(*) FILTER (WHERE ${aberto} AND ${col} < ${today}::date) AS vencidos,
    ${faixa(col, 0, 7)} AS ate7, ${faixa(col, 8, 15)} AS ate15, ${faixa(col, 16, 30)} AS ate30, ${faixa(col, 31, 60)} AS ate60, ${faixa(col, 61, 90)} AS ate90, ${faixa(col, 91, null)} AS mais90,
    count(*) FILTER (WHERE ${aberto} AND ${col} IS NULL) AS "semPrazo"`;
  const [pj] = await rows<any>(sql`SELECT ${contagens(sql`projetos.data_prevista`)} ${FROM_P} WHERE projetos.ativo AND ${condAcesso(req.user!)}`);
  const [et] = await rows<any>(sql`SELECT ${contagens(sql`et.data_prevista`)} FROM etapas et JOIN projetos ON projetos.id = et.projeto_id JOIN status ON status.id = et.status_id WHERE et.ativo AND projetos.ativo AND ${condAcesso(req.user!)}`);
  const proximos = await rows<any>(sql`
    SELECT et.id, projetos.id AS "projetoId", projetos.codigo || ' ' || et.letra AS codigo, et.nome, et.data_prevista::text AS prevista, (SELECT nome FROM users WHERE id = et.responsavel_id) AS responsavel,
      (et.data_prevista - ${today}::date) AS dias
    FROM etapas et JOIN projetos ON projetos.id = et.projeto_id JOIN status ON status.id = et.status_id
    WHERE et.ativo AND projetos.ativo AND ${aberto} AND et.data_prevista >= ${today}::date AND ${condAcesso(req.user!)} ORDER BY et.data_prevista, et.id LIMIT 10`);
  const atrasadas = await rows<any>(sql`
    SELECT et.id, projetos.id AS "projetoId", projetos.codigo || ' ' || et.letra AS codigo, et.nome, et.data_prevista::text AS prevista, (SELECT nome FROM users WHERE id = et.responsavel_id) AS responsavel,
      (${today}::date - et.data_prevista) AS dias
    FROM etapas et JOIN projetos ON projetos.id = et.projeto_id JOIN status ON status.id = et.status_id
    WHERE et.ativo AND projetos.ativo AND ${aberto} AND et.data_prevista < ${today}::date AND ${condAcesso(req.user!)} ORDER BY et.data_prevista, et.id LIMIT 10`);
  const norm = (o: any) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, num(v)]));
  const sit = async (s: 'NORMAL' | 'ATENCAO' | 'CRITICO' | 'VENCIDO') => num((await rows<any>(sql`SELECT count(*) AS n ${FROM_P} WHERE projetos.ativo AND ${condAcesso(req.user!)} AND ${condSituacao(s, sql`projetos.data_prevista` as any, sql`status.classificacao` as any, cfg)}`))[0].n);
  res.json({
    projetos: norm(pj), etapas: norm(et), limites: { atencao: cfg.diasAtencao, critico: cfg.diasCritico },
    situacao: { normal: await sit('NORMAL'), atencao: await sit('ATENCAO'), critico: await sit('CRITICO'), vencido: await sit('VENCIDO') },
    proximos: proximos.map((x) => ({ ...x, dias: num(x.dias) })), atrasadas: atrasadas.map((x) => ({ ...x, dias: num(x.dias) })),
  });
}));

// Indicadores gerenciais
indicadoresRouter.get('/indicadores', wrap(async (req, res) => {
  const cfg = await getPrazoCfg(); const today = hoje();
  const base = and(sql`projetos.ativo`, condAcesso(req.user!));
  const fields: SQL[] = CARDS.map((c) => sql`count(*) FILTER (WHERE ${condCard(c as Card, cfg)}) AS ${sql.raw(`"${c}"`)}`);
  const [c] = await rows<any>(sql`SELECT ${sql.join(fields, sql`, `)},
      count(*) FILTER (WHERE ${condSituacao('CRITICO', sql`projetos.data_prevista` as any, sql`status.classificacao` as any, cfg)} OR ${condSituacao('ATENCAO', sql`projetos.data_prevista` as any, sql`status.classificacao` as any, cfg)}) AS "proximos",
      round(avg(projetos.data_prevista - projetos.data_inicio) FILTER (WHERE projetos.data_prevista IS NOT NULL AND projetos.data_inicio IS NOT NULL AND status.classificacao <> 'CANCELADO')) AS "prazoMedio",
      round(avg(projetos.data_conclusao_real - projetos.data_inicio) FILTER (WHERE status.classificacao = 'CONCLUIDO' AND projetos.data_conclusao_real IS NOT NULL AND projetos.data_inicio IS NOT NULL)) AS "tempoMedio"
    ${FROM_P} WHERE ${base}`);
  const [e] = await rows<any>(sql`SELECT count(*) AS total, count(*) FILTER (WHERE ${ETAPA_ATRASADA(today)}) AS atrasadas
    FROM etapas et JOIN status es ON es.id = et.status_id JOIN projetos ON projetos.id = et.projeto_id WHERE et.ativo AND ${base}`);
  const [a] = await rows<any>(sql`SELECT count(*) AS total FROM atividades at JOIN etapas et ON et.id = at.etapa_id JOIN projetos ON projetos.id = et.projeto_id WHERE at.ativo AND et.ativo AND ${base}`);
  const total = num(c.total); const pct = (n: unknown) => (total ? Math.round((100 * num(n)) / total) : 0);
  res.json({
    totais: { projetos: total, etapas: num(e.total), atividades: num(a.total) },
    percentuais: { concluido: pct(c.finalizados), andamento: pct(c.andamento), atrasado: pct(c.atrasados), bloqueado: pct(c.bloqueados), suspenso: pct(c.suspensos), proximoVencimento: pct(c.proximos) },
    contagens: { concluido: num(c.finalizados), andamento: num(c.andamento), atrasado: num(c.atrasados), bloqueado: num(c.bloqueados), suspenso: num(c.suspensos), proximoVencimento: num(c.proximos), semMovimentacao: num(c.semMovimentacao), etapasAtrasadas: num(e.atrasadas) },
    prazoMedioDias: c.prazoMedio == null ? null : num(c.prazoMedio), tempoMedioConclusaoDias: c.tempoMedio == null ? null : num(c.tempoMedio),
    diasInatividade: cfg.diasInatividade,
  });
}));
