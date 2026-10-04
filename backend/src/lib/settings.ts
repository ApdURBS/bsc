import { db, configuracoes } from '../db/index.js';
import { CONFIG_PADRAO } from '../db/catalog.js';
import type { PrazoCfg } from './prazo.js';

let cache: { at: number; data: Record<string, unknown> } | null = null;

export async function getConfigs(force = false): Promise<Record<string, unknown>> {
  if (!force && cache && Date.now() - cache.at < 10_000) return cache.data;
  const rows = await db.select().from(configuracoes);
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(CONFIG_PADRAO)) data[k] = v.valor;
  for (const r of rows) data[r.chave] = r.valor;
  cache = { at: Date.now(), data };
  return data;
}
export const invalidateConfigs = () => { cache = null; };

export async function getPrazoCfg(): Promise<PrazoCfg & { diasInatividade: number }> {
  const c = await getConfigs();
  return { diasAtencao: Number(c['prazo.dias_atencao']), diasCritico: Number(c['prazo.dias_critico']), diasInatividade: Number(c['inatividade.dias']) };
}
