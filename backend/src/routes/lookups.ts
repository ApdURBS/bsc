import { Router } from 'express';
import { z } from 'zod';
import { asc, eq, sql, count } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import {
  db, frentes, statusTbl, confidencialidades, tiposMovimentacao, tiposDocumento, tiposOcorrencia,
  projetos,
} from '../db/index.js';
import { audit, auditDiff, ctxOf } from '../lib/audit.js';
import { conflict, notFound, parse, wrap, optInt } from '../lib/http.js';
import { requirePerm } from '../middleware/auth.js';

/**
 * Cadastros configuráveis (Configurações): leitura para qualquer usuário autenticado
 * (necessária aos formulários); criação/edição exige settings.manage. Nunca há exclusão física: usa-se "ativo".
 */
function lookup(path: string, table: any, modulo: string, body: z.ZodObject<any>, labels: Record<string, string>, order: any[]) {
  const r = Router();
  r.get('/', wrap(async (req, res) => {
    const todos = req.query.todos === '1';
    const q = db.select().from(table as PgTable).orderBy(...order);
    res.json(todos ? await q : await q.where(eq(table.ativo, true)));
  }));
  r.post('/', requirePerm('settings.manage'), wrap(async (req, res) => {
    const d = parse(body, req.body);
    const row = await db.transaction(async (tx) => {
      const [x] = (await (tx.insert(table) as any).values(d).returning()) as any[];
      await audit(tx, ctxOf(req), { acao: 'CREATE', modulo, registroId: (x as any).id, rotulo: (x as any).nome, info: d });
      return x;
    });
    res.status(201).json(row);
  }));
  r.patch('/:id', requirePerm('settings.manage'), wrap(async (req, res) => {
    const id = Number(req.params.id);
    const d = parse(body.partial().extend({ ativo: z.boolean().optional() }), req.body);
    const [antes] = await db.select().from(table as PgTable).where(eq(table.id, id)); if (!antes) throw notFound();
    await db.transaction(async (tx) => {
      await tx.update(table).set(d).where(eq(table.id, id));
      await auditDiff(tx, ctxOf(req), { modulo, registroId: id, rotulo: (antes as any).nome, before: antes as any, after: { ...(antes as any), ...d }, labels: { ...labels, ativo: 'Ativo' } });
    });
    const [depois] = await db.select().from(table as PgTable).where(eq(table.id, id));
    res.json(depois);
  }));
  return { path, router: r };
}

const nome = z.string().trim().min(2).max(120);
export const lookupRouters = [
  lookup('status', statusTbl, 'Status', z.object({
    nome, classificacao: z.enum(['INICIAL', 'EM_ANDAMENTO', 'ATENCAO', 'ATRASO', 'BLOQUEIO', 'PAUSADO', 'CONCLUIDO', 'CANCELADO']),
    cor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), ordem: z.coerce.number().int().optional(),
  }), { nome: 'Nome', classificacao: 'Classificação', cor: 'Cor', ordem: 'Ordem' }, [asc(statusTbl.ordem), asc(statusTbl.id)]),
  lookup('confidencialidades', confidencialidades, 'Confidencialidades', z.object({ nome, nivel: z.coerce.number().int(), regraAcesso: z.enum(['TODOS', 'USUARIOS', 'EQUIPE_APD']).optional() }), { nome: 'Nome', nivel: 'Nível', regraAcesso: 'Regra de acesso' }, [asc(confidencialidades.nivel)]),
  lookup('tipos-movimentacao', tiposMovimentacao, 'Tipos de movimentação', z.object({ nome }), { nome: 'Nome' }, [asc(tiposMovimentacao.nome)]),
  lookup('tipos-documento', tiposDocumento, 'Tipos de documento', z.object({ nome }), { nome: 'Nome' }, [asc(tiposDocumento.nome)]),
  lookup('tipos-ocorrencia', tiposOcorrencia, 'Tipos de ocorrência', z.object({ nome }), { nome: 'Nome' }, [asc(tiposOcorrencia.nome)]),
];

// ─────────────── Frentes: regras específicas (código automático / imutável com projetos) ───────────────
export const frentesRouter = Router();
frentesRouter.get('/', wrap(async (req, res) => {
  const q = db.select().from(frentes).orderBy(asc(frentes.ordem), asc(frentes.id));
  res.json(req.query.todos === '1' ? await q : await q.where(eq(frentes.ativo, true)));
}));
const fb = z.object({ codigo: z.string().trim().regex(/^[A-Za-z0-9]{1,6}$/, 'Código: 1-6 letras/números, sem "_"').optional(), nome, ordem: z.coerce.number().int().optional() });
frentesRouter.post('/', requirePerm('settings.manage'), wrap(async (req, res) => {
  const d = parse(fb, req.body);
  const row = await db.transaction(async (tx) => {
    let codigo = d.codigo;
    if (!codigo) {
      const [{ m }] = await tx.select({ m: sql<number>`COALESCE(MAX(CASE WHEN ${frentes.codigo} ~ '^[0-9]+$' THEN ${frentes.codigo}::int END),0)` }).from(frentes);
      codigo = String(Number(m) + 1);
    }
    const [x] = await tx.insert(frentes).values({ codigo, nome: d.nome, ordem: d.ordem ?? (Number(codigo) || 0) }).returning();
    await audit(tx, ctxOf(req), { acao: 'CREATE', modulo: 'Frentes', registroId: x.id, rotulo: `${x.codigo} — ${x.nome}` });
    return x;
  });
  res.status(201).json(row);
}));
frentesRouter.patch('/:id', requirePerm('settings.manage'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const d = parse(fb.partial().extend({ ativo: z.boolean().optional() }), req.body);
  const [antes] = await db.select().from(frentes).where(eq(frentes.id, id)); if (!antes) throw notFound('Frente');
  if (d.codigo && d.codigo !== antes.codigo) {
    const [{ n }] = await db.select({ n: count() }).from(projetos).where(eq(projetos.frenteId, id));
    if (n > 0) throw conflict('O código da frente não pode ser alterado porque já existem projetos com ele.');
  }
  await db.transaction(async (tx) => {
    await tx.update(frentes).set(d).where(eq(frentes.id, id));
    await auditDiff(tx, ctxOf(req), { modulo: 'Frentes', registroId: id, rotulo: antes.nome, before: antes, after: { ...antes, ...d }, labels: { codigo: 'Código', nome: 'Nome', ordem: 'Ordem', ativo: 'Ativo' } });
  });
  res.json((await db.select().from(frentes).where(eq(frentes.id, id)))[0]);
}));
