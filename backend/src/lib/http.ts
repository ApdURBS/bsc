import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, z } from 'zod';

export class AppError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}
export const notFound = (what = 'Registro') => new AppError(404, `${what} não encontrado.`);
export const forbidden = (msg = 'Você não tem permissão para esta ação.') => new AppError(403, msg);
export const badRequest = (msg: string, details?: unknown) => new AppError(400, msg, details);
export const conflict = (msg: string) => new AppError(409, msg);

export const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new AppError(422, 'Dados inválidos.', r.error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })));
  return r.data;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) return res.status(err.status).json({ erro: err.message, detalhes: err.details });
  if (err instanceof ZodError) return res.status(422).json({ erro: 'Dados inválidos.', detalhes: err.issues });
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e?.code === '23505') return res.status(409).json({ erro: 'Já existe um registro com estes dados.', detalhes: e.constraint });
  if (e?.code === '23503') return res.status(409).json({ erro: 'Referência inválida: o registro relacionado não existe ou impede a operação.', detalhes: e.constraint });
  if (e?.code === '42501') return res.status(403).json({ erro: 'Operação bloqueada: registro imutável.' });
  console.error(err);
  const c = e?.code ?? '';
  if (['ECONNREFUSED', 'ENOTFOUND', '57P01', '53300'].includes(c) || /ECONNREFUSED|Connection terminated/i.test(e?.message ?? ''))
    return res.status(503).json({ erro: 'Banco de dados indisponível. Verifique se o PostgreSQL está em execução (docker compose up -d db).' });
  if (c === '28P01' || c === '28000') return res.status(500).json({ erro: 'Falha de autenticação no banco: confira DATABASE_URL em backend/.env.' });
  if (c === '42P01') return res.status(500).json({ erro: 'Tabelas do banco não encontradas. Reinicie a API (as migrações são aplicadas na inicialização).' });
  res.status(500).json({ erro: 'Erro interno do servidor.' });
}

// Paginação padrão
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export const emptyToUndef = (v: unknown) => (v === '' || v === null ? undefined : v);
export const optInt = z.preprocess(emptyToUndef, z.coerce.number().int().optional());
export const optStr = z.preprocess(emptyToUndef, z.string().optional());
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD).');
export const optDate = z.preprocess(emptyToUndef, isoDate.optional());
