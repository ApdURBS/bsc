import { and, eq, inArray } from 'drizzle-orm';
import { db, users } from '../db/index.js';
import { badRequest } from './http.js';

/** Dono, Scrum Master, membros e responsáveis precisam ser usuários ativos marcados como "Pertence à APD/UPD". */
export async function validarPessoas(ids: (number | null | undefined)[], quais = 'Responsável') {
  const lista = [...new Set(ids.filter((x): x is number => typeof x === 'number'))];
  if (!lista.length) return;
  const ok = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, lista), eq(users.ativo, true), eq(users.pertenceApd, true)));
  if (ok.length !== lista.length) throw badRequest(`${quais}: selecione apenas usuários ativos que pertençam à APD/UPD.`);
}
