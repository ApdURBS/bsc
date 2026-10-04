import type { Request } from 'express';
import { inArray } from 'drizzle-orm';
import {
  auditLogs, users, confidencialidades, statusTbl, frentes,
  type Executor,
} from '../db/index.js';

export interface Ctx { userId: number | null; nome: string | null; ip: string | null }
export const ctxOf = (req: Request): Ctx => ({
  userId: req.user?.id ?? null, nome: req.user?.nome ?? null, ip: req.ip ?? null,
});

type Acao = (typeof auditLogs.$inferInsert)['acao'];
export interface AuditEntry {
  acao: Acao; modulo: string; registroId?: string | number | null; rotulo?: string | null; projetoId?: number | null;
  campo?: string | null; anterior?: unknown; novo?: unknown; info?: unknown;
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  if (Array.isArray(v)) return v.join(', ');
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

export async function audit(ex: Executor, ctx: Ctx, e: AuditEntry) {
  await ex.insert(auditLogs).values({
    userId: ctx.userId, usuarioNome: ctx.nome, ip: ctx.ip, acao: e.acao, modulo: e.modulo,
    registroId: e.registroId == null ? null : String(e.registroId), registroRotulo: e.rotulo ?? null,
    projetoId: e.projetoId ?? null, campo: e.campo ?? null,
    valorAnterior: str(e.anterior), valorNovo: str(e.novo), info: (e.info as object) ?? null,
  });
}

// Campos que apontam para cadastros: gravamos o NOME legível (não o id) na auditoria.
const FK_TABLES: Record<string, { table: any; col: 'nome' }> = {
  statusId: { table: statusTbl, col: 'nome' },
  donoId: { table: users, col: 'nome' },
  scrumMasterId: { table: users, col: 'nome' },
  responsavelId: { table: users, col: 'nome' },
  confidencialidadeId: { table: confidencialidades, col: 'nome' },
  frenteId: { table: frentes, col: 'nome' },
};

export interface DiffOpts {
  modulo: string; registroId: string | number; rotulo: string; projetoId?: number | null;
  before: Record<string, unknown>; after: Record<string, unknown>;
  labels: Record<string, string>; // campo -> rótulo legível em pt-BR
  acaoUpdate?: Acao;
}

/** Registra uma linha de auditoria por campo alterado (STATUS_CHANGE para statusId). Retorna a lista de campos alterados. */
export async function auditDiff(ex: Executor, ctx: Ctx, o: DiffOpts): Promise<string[]> {
  const changed: string[] = [];
  for (const k of Object.keys(o.labels)) {
    const a = norm(o.before[k]); const b = norm(o.after[k]);
    if (a !== b) changed.push(k);
  }
  if (!changed.length) return [];
  // resolve nomes das FKs em lote
  const names: Record<string, Map<unknown, string>> = {};
  for (const k of changed) {
    const fk = FK_TABLES[k]; if (!fk) continue;
    const ids = [o.before[k], o.after[k]].filter((v): v is number => typeof v === 'number');
    if (!ids.length) continue;
    const rows = await ex.select({ id: fk.table.id, nome: fk.table[fk.col] }).from(fk.table).where(inArray(fk.table.id, ids));
    names[k] = new Map(rows.map((r: any) => [r.id, r.nome]));
  }
  const show = (k: string, v: unknown) => (names[k] && v != null ? names[k].get(v) ?? String(v) : v);
  for (const k of changed) {
    await audit(ex, ctx, {
      acao: k === 'statusId' ? 'STATUS_CHANGE' : (o.acaoUpdate ?? 'UPDATE'), modulo: o.modulo, registroId: o.registroId, rotulo: o.rotulo,
      projetoId: o.projetoId ?? null, campo: o.labels[k], anterior: show(k, o.before[k]), novo: show(k, o.after[k]),
    });
  }
  return changed;
}
const norm = (v: unknown) => (v === undefined || v === null || v === '' ? '' : Array.isArray(v) ? v.join('\u0001') : String(v));
