import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { aliasedTable, and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import {
  db, documentos, documentoVersoes, projetos, etapas, atividades, ocorrencias, users, tiposDocumento,
} from '../db/index.js';
import { config } from '../config.js';
import { audit, auditDiff, ctxOf } from '../lib/audit.js';
import { AppError, badRequest, notFound, optInt, optStr, pageSchema, parse, wrap } from '../lib/http.js';
import { requirePerm } from '../middleware/auth.js';
import { validarPessoas } from '../lib/pessoas.js';
import { assertProjeto, condAcesso } from '../lib/projetos.js';
import { lerArquivo, salvarArquivo } from '../lib/storage.js';

export const documentsRouter = Router();

export const CATEGORIAS = ['Relatórios', 'Documentos', 'Evidências', 'Outros'] as const;
const BLOQUEADAS = new Set(['exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'js', 'mjs', 'vbs', 'vbe', 'ps1', 'jar', 'sh', 'dll', 'lnk', 'reg', 'hta', 'cpl']);
const INLINE_OK = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 } });
const receber = (req: any, res: any, next: any) => upload.single('arquivo')(req, res, (err: any) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, `Arquivo maior que o limite de ${config.maxUploadMb} MB.`));
  next(new AppError(400, 'Falha ao receber o arquivo.'));
});

const nomeOriginal = (f: Express.Multer.File) => Buffer.from(f.originalname, 'latin1').toString('utf8').replace(/[\\/\x00-\x1f]/g, '_').slice(0, 250);

async function gravar(file: Express.Multer.File) {
  const nome = nomeOriginal(file);
  const ext = path.extname(nome).slice(1).toLowerCase();
  if (BLOQUEADAS.has(ext)) throw badRequest(`Arquivos .${ext} não são permitidos por segurança.`);
  if (!file.size) throw badRequest('O arquivo está vazio.');
  const d = new Date();
  const rel = path.posix.join(String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), randomUUID());
  await salvarArquivo(rel, file.buffer);
  return { arquivoNome: nome, arquivoPath: rel, mimeType: file.mimetype || 'application/octet-stream', tamanho: file.size, sha256: createHash('sha256').update(file.buffer).digest('hex') };
}

const resp = aliasedTable(users, 'resp_doc');
const autor = aliasedTable(users, 'autor_doc');
const ultimaV = sql`(SELECT max(v.versao) FROM documento_versoes v WHERE v.documento_id = ${documentos.id})`;
const vcol = (c: string) => sql`(SELECT v.${sql.raw(c)} FROM documento_versoes v WHERE v.documento_id = ${documentos.id} ORDER BY v.versao DESC LIMIT 1)`;
const cols = {
  id: documentos.id, nome: documentos.nome, categoria: documentos.categoria, observacao: documentos.observacao, caminhoRede: documentos.caminhoRede,
  projetoId: projetos.id, projetoCodigo: projetos.codigo, projetoNome: projetos.nome,
  etapaId: etapas.id, etapaLetra: etapas.letra, atividadeId: atividades.id, atividadeNome: atividades.nome, ocorrenciaId: documentos.ocorrenciaId,
  tipoId: tiposDocumento.id, tipoNome: tiposDocumento.nome, responsavelId: resp.id, responsavelNome: resp.nome,
  criadoPor: autor.nome, confidencialidadeId: documentos.confidencialidadeId, createdAt: documentos.createdAt, updatedAt: documentos.updatedAt,
  versao: sql<number | null>`${ultimaV}`, arquivoNome: sql<string | null>`${vcol('arquivo_nome')}`, tamanho: sql<number | null>`${vcol('tamanho')}`,
  mimeType: sql<string | null>`${vcol('mime_type')}`, ultimaVersaoEm: sql<string | null>`${vcol('created_at')}`,
};
const sel = () => db.select(cols).from(documentos)
  .innerJoin(projetos, eq(projetos.id, documentos.projetoId))
  .leftJoin(etapas, eq(etapas.id, documentos.etapaId)).leftJoin(atividades, eq(atividades.id, documentos.atividadeId))
  .leftJoin(tiposDocumento, eq(tiposDocumento.id, documentos.tipoId)).leftJoin(resp, eq(resp.id, documentos.responsavelId))
  .leftJoin(autor, eq(autor.id, documentos.createdById));
const fmt = (r: Awaited<ReturnType<typeof sel>>[number]) => ({
  id: r.id, nome: r.nome, categoria: r.categoria, observacao: r.observacao, caminhoRede: r.caminhoRede,
  projeto: { id: r.projetoId, codigo: r.projetoCodigo, nome: r.projetoNome },
  etapa: r.etapaId ? { id: r.etapaId, letra: r.etapaLetra, codigo: `${r.projetoCodigo} ${r.etapaLetra}` } : null,
  atividade: r.atividadeId ? { id: r.atividadeId, nome: r.atividadeNome } : null, ocorrenciaId: r.ocorrenciaId,
  tipo: r.tipoId ? { id: r.tipoId, nome: r.tipoNome } : null, responsavel: r.responsavelId ? { id: r.responsavelId, nome: r.responsavelNome } : null,
  criadoPor: r.criadoPor, confidencialidadeId: r.confidencialidadeId, createdAt: r.createdAt, updatedAt: r.updatedAt,
  versao: r.versao == null ? null : Number(r.versao), arquivoNome: r.arquivoNome, tamanho: r.tamanho == null ? null : Number(r.tamanho),
  mimeType: r.mimeType, ultimaVersaoEm: r.ultimaVersaoEm,
  visualizavel: !!r.mimeType && INLINE_OK.has(r.mimeType),
});

/** Visível = projeto acessível E (documento sem nível próprio OU nível acessível). */
function condVisivel(user: { acessoIds: number[] }): SQL {
  const ids = user.acessoIds.length ? user.acessoIds : [-1];
  return and(condAcesso(user), or(sql`${documentos.confidencialidadeId} IS NULL`, sql`${documentos.confidencialidadeId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`))!;
}
async function carregar(req: any, id: number) {
  const [r] = await sel().where(and(eq(documentos.id, id), eq(documentos.ativo, true), condVisivel(req.user)));
  if (!r) throw notFound('Documento');
  return r;
}

const listQ = pageSchema.extend({ projetoId: optInt, etapaId: optInt, atividadeId: optInt, ocorrenciaId: optInt, tipoId: optInt, categoria: optStr, busca: optStr });
documentsRouter.get('/', requirePerm('documents.view'), wrap(async (req, res) => {
  const q = parse(listQ, req.query);
  const w: (SQL | undefined)[] = [eq(documentos.ativo, true), condVisivel(req.user!)];
  if (q.projetoId) w.push(eq(documentos.projetoId, q.projetoId));
  if (q.etapaId) w.push(eq(documentos.etapaId, q.etapaId));
  if (q.atividadeId) w.push(eq(documentos.atividadeId, q.atividadeId));
  if (q.ocorrenciaId) w.push(eq(documentos.ocorrenciaId, q.ocorrenciaId));
  if (q.tipoId) w.push(eq(documentos.tipoId, q.tipoId));
  if (q.categoria) w.push(eq(documentos.categoria, q.categoria));
  if (q.busca) { const b = `%${q.busca}%`; w.push(or(ilike(documentos.nome, b), ilike(documentos.observacao, b), ilike(projetos.codigo, b), ilike(documentos.caminhoRede, b))); }
  const where = and(...w);
  const [{ n }] = await db.select({ n: count() }).from(documentos).innerJoin(projetos, eq(projetos.id, documentos.projetoId)).where(where);
  const rows = await sel().where(where).orderBy(desc(documentos.updatedAt), desc(documentos.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  res.json({ itens: rows.map(fmt), total: n, page: q.page, pageSize: q.pageSize });
}));

const corpo = z.object({
  projetoId: z.coerce.number().int(), nome: optStr, tipoId: optInt, categoria: z.preprocess((v) => (v === '' ? undefined : v), z.enum(CATEGORIAS).optional()),
  etapaId: optInt, atividadeId: optInt, ocorrenciaId: optInt, responsavelId: optInt, confidencialidadeId: optInt,
  caminhoRede: optStr, observacao: optStr, versaoObs: optStr,
});

/** Garante que etapa/atividade/ocorrência pertencem ao projeto informado. */
async function validarVinculos(d: { projetoId: number; etapaId?: number; atividadeId?: number; ocorrenciaId?: number }) {
  if (d.etapaId) {
    const [e] = await db.select({ p: etapas.projetoId }).from(etapas).where(eq(etapas.id, d.etapaId));
    if (!e || e.p !== d.projetoId) throw badRequest('A etapa não pertence ao projeto.');
  }
  if (d.atividadeId) {
    const [a] = await db.select({ e: atividades.etapaId, p: etapas.projetoId }).from(atividades).innerJoin(etapas, eq(etapas.id, atividades.etapaId)).where(eq(atividades.id, d.atividadeId));
    if (!a || a.p !== d.projetoId) throw badRequest('A atividade não pertence ao projeto.');
    if (d.etapaId && a.e !== d.etapaId) throw badRequest('A atividade não pertence à etapa.');
  }
  if (d.ocorrenciaId) {
    const [o] = await db.select({ p: ocorrencias.projetoId }).from(ocorrencias).where(eq(ocorrencias.id, d.ocorrenciaId));
    if (!o || o.p !== d.projetoId) throw badRequest('A ocorrência não pertence ao projeto.');
  }
}

documentsRouter.post('/', requirePerm('documents.create'), receber, wrap(async (req, res) => {
  const d = parse(corpo, req.body);
  await assertProjeto(req.user!, d.projetoId);
  await validarVinculos(d); await validarPessoas([d.responsavelId]);
  if (d.confidencialidadeId && !req.user!.acessoIds.includes(d.confidencialidadeId)) throw badRequest('Nível de confidencialidade inválido.');
  const file = req.file;
  if (!file && !d.caminhoRede) throw badRequest('Envie um arquivo ou informe o caminho da pasta de rede.');
  const info = file ? await gravar(file) : null;
  const nome = d.nome ?? info?.arquivoNome ?? d.caminhoRede!;
  const ctx = ctxOf(req);
  const id = await db.transaction(async (tx) => {
    const [doc] = await tx.insert(documentos).values({
      nome, tipoId: d.tipoId, categoria: d.categoria ?? 'Documentos', projetoId: d.projetoId, etapaId: d.etapaId, atividadeId: d.atividadeId,
      ocorrenciaId: d.ocorrenciaId, responsavelId: d.responsavelId, confidencialidadeId: d.confidencialidadeId,
      caminhoRede: d.caminhoRede, observacao: d.observacao, createdById: req.user!.id,
    }).returning({ id: documentos.id });
    if (info) await tx.insert(documentoVersoes).values({ documentoId: doc.id, versao: 1, ...info, observacao: d.versaoObs, usuarioId: req.user!.id });
    await audit(tx, ctx, { acao: 'DOCUMENT_UPLOAD', modulo: 'Documentos', registroId: doc.id, rotulo: nome, projetoId: d.projetoId, campo: info ? 'Arquivo' : 'Caminho de rede', novo: info ? `${info.arquivoNome} (v1)` : d.caminhoRede, info: info ? { tamanho: info.tamanho, sha256: info.sha256 } : undefined });
    return doc.id;
  });
  res.status(201).json(fmt(await carregar(req, id)));
}));

documentsRouter.get('/:id', requirePerm('documents.view'), wrap(async (req, res) => {
  const doc = await carregar(req, Number(req.params.id));
  const versoes = await db.select({
    id: documentoVersoes.id, versao: documentoVersoes.versao, arquivoNome: documentoVersoes.arquivoNome, mimeType: documentoVersoes.mimeType,
    tamanho: documentoVersoes.tamanho, sha256: documentoVersoes.sha256, observacao: documentoVersoes.observacao, createdAt: documentoVersoes.createdAt, usuarioNome: users.nome,
  }).from(documentoVersoes).leftJoin(users, eq(users.id, documentoVersoes.usuarioId)).where(eq(documentoVersoes.documentoId, doc.id)).orderBy(desc(documentoVersoes.versao));
  res.json({ ...fmt(doc), versoes });
}));

const patch = z.object({
  nome: z.string().trim().min(1).max(250).optional(), tipoId: optInt, categoria: z.preprocess((v) => (v === '' ? undefined : v), z.enum(CATEGORIAS).optional()),
  etapaId: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().nullable().optional()),
  atividadeId: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().nullable().optional()),
  responsavelId: optInt, caminhoRede: z.string().nullable().optional(), observacao: z.string().nullable().optional(),
});
documentsRouter.patch('/:id', requirePerm('documents.create'), wrap(async (req, res) => {
  const doc = await carregar(req, Number(req.params.id));
  const b = parse(patch, req.body);
  const [antes] = await db.select().from(documentos).where(eq(documentos.id, doc.id));
  const novo: Record<string, unknown> = { ...antes };
  for (const k of Object.keys(b) as (keyof typeof b)[]) if (b[k] !== undefined) novo[k] = typeof b[k] === 'string' && b[k] === '' ? null : b[k];
  await validarVinculos({ projetoId: antes.projetoId, etapaId: (novo.etapaId as number) ?? undefined, atividadeId: (novo.atividadeId as number) ?? undefined });
  if (b.responsavelId !== undefined) await validarPessoas([novo.responsavelId as number]);
  if (!novo.caminhoRede && doc.versao == null) throw badRequest('Um documento sem arquivo precisa manter o caminho de rede.');
  await db.transaction(async (tx) => {
    await tx.update(documentos).set({ nome: novo.nome as string, tipoId: novo.tipoId as number, categoria: novo.categoria as string, etapaId: novo.etapaId as number, atividadeId: novo.atividadeId as number, responsavelId: novo.responsavelId as number, caminhoRede: novo.caminhoRede as string, observacao: novo.observacao as string, updatedAt: new Date() }).where(eq(documentos.id, doc.id));
    await auditDiff(tx, ctxOf(req), {
      modulo: 'Documentos', registroId: doc.id, rotulo: antes.nome, projetoId: antes.projetoId, before: antes, after: novo,
      labels: { nome: 'Nome', tipoId: 'Tipo', categoria: 'Categoria', etapaId: 'Etapa', atividadeId: 'Atividade', responsavelId: 'Responsável', caminhoRede: 'Caminho de rede', observacao: 'Observação' },
    });
  });
  res.json(fmt(await carregar(req, doc.id)));
}));

documentsRouter.post('/:id/versions', requirePerm('documents.create'), receber, wrap(async (req, res) => {
  const doc = await carregar(req, Number(req.params.id));
  if (!req.file) throw badRequest('Envie o arquivo da nova versão.');
  const obs = parse(z.object({ observacao: optStr }), req.body).observacao;
  const info = await gravar(req.file);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM documentos WHERE id = ${doc.id} FOR UPDATE`);
    const [{ m }] = await tx.select({ m: sql<number>`COALESCE(max(${documentoVersoes.versao}), 0)` }).from(documentoVersoes).where(eq(documentoVersoes.documentoId, doc.id));
    const versao = Number(m) + 1;
    await tx.insert(documentoVersoes).values({ documentoId: doc.id, versao, ...info, observacao: obs, usuarioId: req.user!.id });
    await tx.update(documentos).set({ updatedAt: new Date() }).where(eq(documentos.id, doc.id));
    await audit(tx, ctxOf(req), { acao: 'DOCUMENT_UPLOAD', modulo: 'Documentos', registroId: doc.id, rotulo: doc.nome, projetoId: doc.projetoId, campo: 'Nova versão', anterior: m ? `v${m}` : null, novo: `${info.arquivoNome} (v${versao})`, info: { tamanho: info.tamanho, sha256: info.sha256 } });
  });
  res.status(201).json(fmt(await carregar(req, doc.id)));
}));

// Exclusão lógica: o arquivo físico e as versões permanecem preservados (rastreabilidade).
documentsRouter.delete('/:id', requirePerm('documents.manage'), wrap(async (req, res) => {
  const doc = await carregar(req, Number(req.params.id));
  await db.transaction(async (tx) => {
    await tx.update(documentos).set({ ativo: false, updatedAt: new Date() }).where(eq(documentos.id, doc.id));
    await audit(tx, ctxOf(req), { acao: 'DOCUMENT_DELETE', modulo: 'Documentos', registroId: doc.id, rotulo: doc.nome, projetoId: doc.projetoId, campo: 'Documento', anterior: doc.arquivoNome ?? doc.caminhoRede, novo: null });
  });
  res.status(204).end();
}));

documentsRouter.get('/:id/download', requirePerm('documents.view'), wrap(async (req, res) => {
  const doc = await carregar(req, Number(req.params.id));
  const vn = req.query.versao ? Number(req.query.versao) : undefined;
  const [v] = await db.select().from(documentoVersoes).where(and(eq(documentoVersoes.documentoId, doc.id), vn ? eq(documentoVersoes.versao, vn) : undefined)).orderBy(desc(documentoVersoes.versao)).limit(1);
  if (!v) throw notFound('Arquivo');
  const buffer = await lerArquivo(v.arquivoPath);
  if (!buffer) throw new AppError(410, 'O arquivo físico não foi encontrado no servidor.');
  const inline = req.query.inline === '1' && !!v.mimeType && INLINE_OK.has(v.mimeType);
  res.setHeader('Content-Type', inline ? v.mimeType! : 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(v.arquivoNome)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Content-Length', String(buffer.length));
  res.end(buffer);
}));
void asc;
