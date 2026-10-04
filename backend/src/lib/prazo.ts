import { sql, type SQL, type AnyColumn } from 'drizzle-orm';
import { config } from '../config.js';

export type SituacaoPrazo = 'NORMAL' | 'ATENCAO' | 'CRITICO' | 'VENCIDO' | 'SEM_PRAZO' | 'ENCERRADO';
export const ENCERRADOS = ['CONCLUIDO', 'CANCELADO'];

/** Data de hoje (AAAA-MM-DD) no fuso da URBS. */
export function hoje(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
const toUTC = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd); };
/** Dias de a até b (positivo se b é depois de a). */
export function diasEntre(a: string, b: string): number { return Math.round((toUTC(b) - toUTC(a)) / 86400000); }
export function somaDias(d: string, n: number): string { return new Date(toUTC(d) + n * 86400000).toISOString().slice(0, 10); }

export interface PrazoCfg { diasAtencao: number; diasCritico: number }
export interface PrazoInput {
  dataInicio?: string | null; dataPrevista?: string | null; dataConclusaoReal?: string | null;
  classificacao: string; percentualExecucao?: number;
}
export interface PrazoInfo {
  situacao: SituacaoPrazo;
  diasRestantes: number | null;
  diasAtraso: number | null;
  percentualPrazoConsumido: number | null;
}

export function calcPrazo(p: PrazoInput, cfg: PrazoCfg, today = hoje()): PrazoInfo {
  let percentualPrazoConsumido: number | null = null;
  if (p.dataInicio && p.dataPrevista) {
    const total = diasEntre(p.dataInicio, p.dataPrevista);
    const usado = diasEntre(p.dataInicio, today);
    percentualPrazoConsumido = total <= 0 ? (usado >= 0 ? 100 : 0) : Math.max(0, Math.min(100, Math.round((usado / total) * 100)));
  }
  if (ENCERRADOS.includes(p.classificacao)) {
    const atraso = p.dataPrevista && p.dataConclusaoReal ? Math.max(0, diasEntre(p.dataPrevista, p.dataConclusaoReal)) : null;
    return { situacao: 'ENCERRADO', diasRestantes: null, diasAtraso: atraso, percentualPrazoConsumido };
  }
  if (!p.dataPrevista) return { situacao: 'SEM_PRAZO', diasRestantes: null, diasAtraso: null, percentualPrazoConsumido };
  const dias = diasEntre(today, p.dataPrevista);
  if (dias < 0) return { situacao: 'VENCIDO', diasRestantes: null, diasAtraso: -dias, percentualPrazoConsumido };
  const situacao: SituacaoPrazo = dias <= cfg.diasCritico ? 'CRITICO' : dias <= cfg.diasAtencao ? 'ATENCAO' : 'NORMAL';
  return { situacao, diasRestantes: dias, diasAtraso: null, percentualPrazoConsumido };
}

/** Condição SQL equivalente a calcPrazo().situacao (para filtros/contagens no banco). */
export function condSituacao(situacao: SituacaoPrazo, dataPrevista: AnyColumn, classificacao: AnyColumn, cfg: PrazoCfg, today = hoje()): SQL {
  const aberto = sql`${classificacao} NOT IN ('CONCLUIDO','CANCELADO')`;
  const t = today;
  const crit = somaDias(today, cfg.diasCritico);
  const aten = somaDias(today, cfg.diasAtencao);
  switch (situacao) {
    case 'ENCERRADO': return sql`${classificacao} IN ('CONCLUIDO','CANCELADO')`;
    case 'SEM_PRAZO': return sql`(${aberto} AND ${dataPrevista} IS NULL)`;
    case 'VENCIDO': return sql`(${aberto} AND ${dataPrevista} < ${t}::date)`;
    case 'CRITICO': return sql`(${aberto} AND ${dataPrevista} >= ${t}::date AND ${dataPrevista} <= ${crit}::date)`;
    case 'ATENCAO': return sql`(${aberto} AND ${dataPrevista} > ${crit}::date AND ${dataPrevista} <= ${aten}::date)`;
    case 'NORMAL': return sql`(${aberto} AND ${dataPrevista} > ${aten}::date)`;
  }
}
