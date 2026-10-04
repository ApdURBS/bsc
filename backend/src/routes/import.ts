import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  db, importacoes, projetos, etapas, etapaMembros, movimentacoes, frentes, statusTbl, confidencialidades, tiposMovimentacao, users,
} from '../db/index.js';
import { audit, ctxOf } from '../lib/audit.js';
import { AppError, badRequest, notFound, optStr, pageSchema, parse, wrap } from '../lib/http.js';
import { requirePerm } from '../middleware/auth.js';
import { hoje } from '../lib/prazo.js';
import { ordemDeLetra } from '../lib/codes.js';
import { recalcEtapa, recalcProjeto } from '../lib/execucao.js';
import {
  analisarEstrutura, bracketAutor, candidatos, lerArquivo, NAO_PESSOAS, norm, pessoasMencionadas, resolverConf, statusDerivado, validar,
  type Contexto, type LinhaPronta, type Problema,
} from '../lib/importer.js';

export const importRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
const receber = (req: any, res: any, next: any) => upload.single('arquivo')(req, res, (err: any) => (err ? next(new AppError(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400, err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo maior que 25 MB.' : 'Falha ao receber o arquivo.')) : next()));
const TZ = process.env.TZ ?? 'America/Sao_Paulo';

interface Payload { cabecalhoLinha: number; colunas: unknown[]; totalColunasData: number; linhas: LinhaPronta[]; pessoas: PessoaPlan[] }
interface PessoaPlan { nome: string; chave: string; ocorrencias: number; papeis: string[]; sugestaoUserId: number | null; candidatos: { id: number; nome: string }[] }

async function pessoasApd() {
  return db.select({ id: users.id, nome: users.nome, username: users.username }).from(users).where(and(eq(users.ativo, true), eq(users.pertenceApd, true))).orderBy(asc(users.nome));
}

async function montarContexto(codigos: string[]): Promise<Contexto> {
  const [fr, st, cf] = await Promise.all([
    db.select({ id: frentes.id, codigo: frentes.codigo, nome: frentes.nome }).from(frentes).where(eq(frentes.ativo, true)),
    db.select({ id: statusTbl.id, nome: statusTbl.nome }).from(statusTbl).where(eq(statusTbl.ativo, true)),
    db.select({ id: confidencialidades.id, nome: confidencialidades.nome, regraAcesso: confidencialidades.regraAcesso, nivel: confidencialidades.nivel }).from(confidencialidades).where(eq(confidencialidades.ativo, true)),
  ]);
  const ex = codigos.length ? await db.select({ id: projetos.id, codigo: projetos.codigo, ativo: projetos.ativo }).from(projetos).where(inArray(projetos.codigo, codigos)) : [];
  const et = ex.length ? await db.select({ codigo: projetos.codigo, letra: etapas.letra }).from(etapas).innerJoin(projetos, eq(projetos.id, etapas.projetoId)).where(inArray(etapas.projetoId, ex.map((p) => p.id))) : [];
  const mv = ex.length ? await db.execute(sql`SELECT p.codigo, e.letra, to_char(m.data_hora AT TIME ZONE ${TZ}::text, 'YYYY-MM-DD') AS dia, m.descricao
    FROM movimentacoes m JOIN projetos p ON p.id = m.projeto_id LEFT JOIN etapas e ON e.id = m.etapa_id WHERE m.projeto_id IN (${sql.join(ex.map((p) => sql`${p.id}`), sql`, `)})`) : { rows: [] as any[] };
  return {
    frentes: fr, status: st, confs: cf,
    projetosExistentes: new Map(ex.filter((p) => p.ativo).map((p) => [p.codigo, p.id])), projetosInativos: new Set(ex.filter((p) => !p.ativo).map((p) => p.codigo)),
    etapasExistentes: new Set(et.map((e) => `${e.codigo}|${e.letra}`)),
    movsExistentes: new Set((mv.rows as any[]).map((m) => `${m.codigo}|${m.letra ?? ''}|${m.dia}|${m.descricao}`)),
  };
}

const movKey = (cod: string, letra: string | null, data: string, t: string) => `${cod}|${letra ?? ''}|${data}|${t}`;

/** Movimentações que seriam efetivamente criadas por uma linha (data não futura e ainda inexistente). */
function movsDaLinha(l: LinhaPronta, ctx: Contexto, vistas: Set<string>) {
  if (l.estado === 'ERRO' || (l.estado === 'DUPLICADO' && !l.existente) || !l.codigo) return [];
  const h = hoje(); const out = [];
  for (const m of l._b.movs) {
    if (m.data > h) continue;
    const k = movKey(l.codigo, l.letra, m.data, m.texto);
    if (ctx.movsExistentes.has(k) || vistas.has(k)) continue;
    vistas.add(k); out.push(m);
  }
  return out;
}

// ───────────── Prévia ─────────────
importRouter.post('/preview', requirePerm('import.manage'), receber, wrap(async (req, res) => {
  if (!req.file) throw badRequest('Envie a planilha (.xlsx) ou um arquivo .csv.');
  const nomeArq = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  if (!/\.(xlsx|xlsm|csv)$/i.test(nomeArq)) throw badRequest('Formato não aceito. Envie um arquivo .xlsx, .xlsm ou .csv.');
  const aba = parse(z.object({ aba: optStr }), req.body).aba;
  let arq; let est;
  try { arq = await lerArquivo(req.file.buffer, nomeArq, aba); est = analisarEstrutura(arq.grid); } catch (e: any) { throw badRequest(e.message); }
  if (est.faltando.length) throw badRequest(`Colunas obrigatórias não encontradas na aba “${arq.aba}”: ${est.faltando.join(', ')}.`, { abas: arq.abas });
  if (!est.linhas.length) throw badRequest(`A aba “${arq.aba}” não tem linhas de dados abaixo do cabeçalho.`, { abas: arq.abas });
  const codigos = [...new Set(est.linhas.map((l) => l.codigo?.replace(/\s+/g, '')).filter((c): c is string => !!c && /^\d+_\d+$/.test(c)))];
  const ctx = await montarContexto(codigos);
  const { problemas, prontas } = validar(est.linhas, ctx);
  // pessoas citadas
  const apd = await pessoasApd(); const mapa = new Map<string, PessoaPlan>();
  for (const p of prontas) for (const m of pessoasMencionadas(p._b)) {
    const ch = norm(m.nome); if (!ch) continue;
    const e = mapa.get(ch) ?? mapa.set(ch, { nome: m.nome, chave: ch, ocorrencias: 0, papeis: [], sugestaoUserId: null, candidatos: [] }).get(ch)!;
    e.ocorrencias++; if (!e.papeis.includes(m.papel)) e.papeis.push(m.papel);
  }
  for (const e of mapa.values()) { const c = candidatos(e.nome, apd); e.candidatos = c.map((u) => ({ id: u.id, nome: u.nome })); e.sugestaoUserId = c.length === 1 ? c[0].id : null; }
  const pessoas = [...mapa.values()].sort((a, b) => b.ocorrencias - a.ocorrencias);
  for (const e of pessoas.filter((x) => !x.sugestaoUserId)) problemas.push({ linha: 0, nivel: 'AVISO', tipo: 'PESSOA', campo: e.papeis.join('/'), mensagem: e.candidatos.length > 1 ? `“${e.nome}” corresponde a mais de um usuário da APD/UPD: escolha qual na tela de pessoas.` : `“${e.nome}” não foi encontrado entre os usuários da APD/UPD: ficará sem vínculo, a menos que você escolha um usuário.` });
  // resumo
  const validas = prontas.filter((p) => p.estado === 'VALIDO'); const vistas = new Set<string>();
  const nMovs = prontas.reduce((s, p) => s + movsDaLinha(p, ctx, vistas).length, 0);
  const novosCod = new Set(validas.map((p) => p.codigo).filter((c): c is string => !!c && !ctx.projetosExistentes.has(c)));
  const sha = createHash('sha256').update(req.file.buffer).digest('hex');
  const [ja] = await db.select({ id: importacoes.id, em: importacoes.concluidaEm }).from(importacoes).where(and(eq(importacoes.arquivoSha256, sha), eq(importacoes.status, 'CONCLUIDA'))).limit(1);
  if (ja) problemas.unshift({ linha: 0, nivel: 'AVISO', tipo: 'OUTRO', mensagem: `Este mesmo arquivo já foi importado (importação nº ${ja.id}). Itens já existentes serão tratados como duplicados.` });
  const resumo = {
    linhas: prontas.length, validos: validas.length, duplicados: prontas.filter((p) => p.estado === 'DUPLICADO').length, erros: prontas.filter((p) => p.estado === 'ERRO').length,
    avisos: problemas.filter((p) => p.nivel === 'AVISO').length, projetosNovos: novosCod.size, projetosExistentes: new Set(prontas.filter((p) => p.codigo && ctx.projetosExistentes.has(p.codigo)).map((p) => p.codigo)).size,
    etapas: validas.filter((p) => p.letra).length, movimentacoes: nMovs, colunasDatas: est.totalColunasData,
    porTipo: Object.fromEntries(['CAMPO_OBRIGATORIO', 'CODIGO_INVALIDO', 'DATA_INVALIDA', 'DUPLICADO', 'STATUS', 'CONFIDENCIALIDADE', 'PESSOA', 'OUTRO'].map((t) => [t, problemas.filter((p) => p.tipo === t).length])),
  };
  const payload: Payload = { cabecalhoLinha: est.cabecalhoLinha, colunas: est.colunas, totalColunasData: est.totalColunasData, linhas: prontas, pessoas };
  const [imp] = await db.insert(importacoes).values({ arquivoNome: nomeArq, arquivoSha256: sha, aba: arq.aba, usuarioId: req.user!.id, resumo, problemas: problemas.slice(0, 5000), payload: payload as never }).returning({ id: importacoes.id });
  res.status(201).json({ id: imp.id, arquivo: nomeArq, aba: arq.aba, abas: arq.abas, cabecalhoLinha: est.cabecalhoLinha, colunas: est.colunas, resumo, pessoas, apd });
}));

// ───────────── Consulta ─────────────
importRouter.get('/', requirePerm('import.manage'), wrap(async (req, res) => {
  const q = parse(pageSchema, req.query);
  const [{ n }] = await db.select({ n: count() }).from(importacoes);
  const itens = await db.select({ id: importacoes.id, arquivoNome: importacoes.arquivoNome, aba: importacoes.aba, status: importacoes.status, resumo: importacoes.resumo, resultado: importacoes.resultado, createdAt: importacoes.createdAt, concluidaEm: importacoes.concluidaEm, usuario: users.nome })
    .from(importacoes).innerJoin(users, eq(users.id, importacoes.usuarioId)).orderBy(desc(importacoes.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  res.json({ itens, total: n, page: q.page, pageSize: q.pageSize });
}));

async function carregar(id: number) {
  const [i] = await db.select().from(importacoes).where(eq(importacoes.id, id));
  if (!i) throw notFound('Importação');
  return i;
}
const idParam = (req: any) => { const n = Number(req.params.id); if (!Number.isInteger(n)) throw notFound('Importação'); return n; };

importRouter.get('/:id', requirePerm('import.manage'), wrap(async (req, res) => {
  const i = await carregar(idParam(req)); const p = i.payload as unknown as Payload | null;
  res.json({ id: i.id, arquivo: i.arquivoNome, aba: i.aba, status: i.status, resumo: i.resumo, resultado: i.resultado, colunas: p?.colunas ?? [], pessoas: p?.pessoas ?? [], apd: await pessoasApd(), problemas: (i.problemas as Problema[] | null)?.slice(0, 1000) ?? [], createdAt: i.createdAt, concluidaEm: i.concluidaEm });
}));

importRouter.get('/:id/linhas', requirePerm('import.manage'), wrap(async (req, res) => {
  const i = await carregar(idParam(req)); const p = i.payload as unknown as Payload | null;
  const q = parse(pageSchema.extend({ estado: z.enum(['VALIDO', 'ERRO', 'DUPLICADO']).optional() }), req.query);
  const todas = (p?.linhas ?? []).filter((l) => !q.estado || l.estado === q.estado);
  const itens = todas.slice((q.page - 1) * q.pageSize, q.page * q.pageSize).map((l) => ({ linha: l.linha, codigo: l.codigo, letra: l.letra, nome: l._b.nome, atividade: l.atividade, status: l._b.statusTxt, inicio: l._b.inicio, prevista: l._b.prevista, real: l._b.real, scrum: l._b.scrum, equipe: l._b.equipe, estado: l.estado, movimentos: l.movimentos }));
  res.json({ itens, total: todas.length, page: q.page, pageSize: q.pageSize });
}));

importRouter.get('/:id/problemas.csv', requirePerm('import.manage'), wrap(async (req, res) => {
  const i = await carregar(idParam(req)); const pr = (i.problemas as Problema[] | null) ?? [];
  const esc = (v: unknown) => { const s = String(v ?? ''); return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = ['Linha;Nível;Tipo;Código;Campo;Mensagem', ...pr.map((p) => [p.linha || '', p.nivel, p.tipo, p.codigo ?? '', p.campo ?? '', p.mensagem].map(esc).join(';'))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="importacao-${i.id}-problemas.csv"`);
  res.send('﻿' + csv + '\r\n');
}));

importRouter.post('/:id/cancel', requirePerm('import.manage'), wrap(async (req, res) => {
  const id = idParam(req); const i = await carregar(id);
  if (i.status !== 'PREVIA') throw badRequest('Só é possível cancelar uma importação que ainda não foi confirmada.');
  await db.transaction(async (tx) => {
    await tx.update(importacoes).set({ status: 'CANCELADA', payload: null, concluidaEm: new Date() }).where(eq(importacoes.id, id));
    await audit(tx, ctxOf(req), { acao: 'UPDATE', modulo: 'Importação', registroId: id, rotulo: i.arquivoNome, campo: 'Status', anterior: 'Prévia', novo: 'Cancelada' });
  });
  res.json({ ok: true });
}));

// ───────────── Confirmação ─────────────
const confirmarBody = z.object({ pessoas: z.record(z.string(), z.union([z.null(), z.coerce.number().int().positive()])).default({}) });

importRouter.post('/:id/confirm', requirePerm('import.manage'), wrap(async (req, res) => {
  const id = idParam(req); const body = parse(confirmarBody, req.body);
  const apd = await pessoasApd(); const apdIds = new Set(apd.map((u) => u.id));
  for (const v of Object.values(body.pessoas)) if (v != null && !apdIds.has(v)) throw badRequest('Escolha apenas usuários ativos que pertençam à APD/UPD.');
  const [stIni] = await db.select().from(statusTbl).where(and(eq(statusTbl.classificacao, 'INICIAL'), eq(statusTbl.ativo, true))).orderBy(asc(statusTbl.ordem)).limit(1);
  const cfs = await db.select().from(confidencialidades).where(eq(confidencialidades.ativo, true)).orderBy(asc(confidencialidades.nivel));
  const cfPadrao = (cfs.find((c) => c.regraAcesso === 'USUARIOS') ?? cfs[0]).id;
  const [tipoAtu] = await db.select().from(tiposMovimentacao).where(and(eq(tiposMovimentacao.ativo, true))).orderBy(sql`(${tiposMovimentacao.nome} = 'Atualização') DESC`, asc(tiposMovimentacao.id)).limit(1);
  const ctxA = ctxOf(req);

  const resultado = await db.transaction(async (tx) => {
    const lock = await tx.execute(sql`SELECT id FROM importacoes WHERE id = ${id} FOR UPDATE`); if (!lock.rows.length) throw notFound('Importação');
    const [imp] = await tx.select().from(importacoes).where(eq(importacoes.id, id));
    if (imp.status !== 'PREVIA' || !imp.payload) throw badRequest('Esta importação já foi concluída ou cancelada.');
    const pay = imp.payload as unknown as Payload;
    const codigos = [...new Set(pay.linhas.map((l) => l.codigo).filter((c): c is string => !!c && /^\d+_\d+$/.test(c)))];
    const ctx = await montarContexto(codigos);
    // pessoas: escolha do usuário > sugestão automática > sem vínculo
    const userPor = new Map<string, number | null>();
    for (const p of pay.pessoas) userPor.set(p.chave, p.nome in body.pessoas ? body.pessoas[p.nome] : p.sugestaoUserId);
    const pessoa = (nome: string | null): number | null => (nome && !NAO_PESSOAS.has(norm(nome)) ? userPor.get(norm(nome)) ?? null : null);
    const mais = <T,>(xs: T[]): T | null => { const m = new Map<T, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };

    const grupos = new Map<string, LinhaPronta[]>();
    for (const l of pay.linhas) if (l.codigo && /^\d+_\d+$/.test(l.codigo) && l.estado !== 'ERRO') (grupos.get(l.codigo) ?? grupos.set(l.codigo, []).get(l.codigo)!).push(l);
    const r = { projetosCriados: 0, projetosAtualizados: 0, etapasCriadas: 0, movimentacoes: 0, etapasIgnoradas: 0, pessoasSemVinculo: 0 };
    const semVinculo = new Set<string>(); const vistas = new Set<string>(); const origem = (l: number) => `Importação #${id} · ${imp.arquivoNome} · linha ${l}`;
    const ordenados = [...grupos.entries()].sort((a, b) => { const [fa, sa] = a[0].split('_').map(Number); const [fb, sb] = b[0].split('_').map(Number); return fa - fb || sa - sb; });

    for (const [cod, ls] of ordenados) {
      const validas = ls.filter((l) => l.estado === 'VALIDO');
      const comMovs = ls.filter((l) => l.existente);
      if (!validas.length && !comMovs.length) continue;
      let projetoId = ctx.projetosExistentes.get(cod) ?? null;
      const linhaProj = ls.find((l) => !l.letra) ?? ls[0];
      if (!projetoId) {
        const [fc, sq] = cod.split('_'); const frente = ctx.frentes.find((f) => f.codigo === fc)!;
        const todas = pay.linhas.filter((l) => l.codigo === cod);
        const rowProj = todas.find((l) => !l.letra && l.estado === 'VALIDO');
        const nome = rowProj?._b.nome ?? mais(validas.map((l) => l._b.nome).filter((x): x is string => !!x)) ?? cod;
        const confId = rowProj ? resolverConf(rowProj._b.conf, ctx).id : null;
        const confsLinhas = validas.map((l) => resolverConf(l._b.conf, ctx).id).filter((x): x is number => !!x);
        const conf = confId ?? (confsLinhas.length ? confsLinhas.sort((a, b) => (cfs.find((c) => c.id === b)?.nivel ?? 0) - (cfs.find((c) => c.id === a)?.nivel ?? 0))[0] : cfPadrao);
        const donoNome = rowProj?._b.dono ?? mais(validas.map((l) => l._b.dono).filter((x): x is string => !!x));
        const donoId = pessoa(donoNome); if (donoNome && !NAO_PESSOAS.has(norm(donoNome)) && !donoId) semVinculo.add(norm(donoNome));
        const stMapa = new Map(ctx.status.map((s) => [norm(s.nome), s.id]));
        const nomesEt = validas.filter((l) => l.letra).map((l) => l._b.statusTxt ?? 'Aguardando');
        const statusId = rowProj?.statusId ?? stMapa.get(statusDerivado(nomesEt)) ?? stIni.id;
        const extras: Record<string, unknown> = {
          importacao: { id, arquivo: imp.arquivoNome, aba: imp.aba, linha: linhaProj.linha },
          direcionador: mais(todas.map((l) => l._b.direcionador).filter(Boolean)), codigoAcaoTatica: mais(todas.map((l) => l._b.acao).filter(Boolean)),
        };
        if (!validas.some((l) => l.letra) && rowProj) extras.planilhaDatas = { inicio: rowProj._b.inicio, prevista: rowProj._b.prevista };
        const [p] = await tx.insert(projetos).values({
          frenteId: frente.id, sequencia: Number(sq), codigo: cod, nome, donoId, statusId, confidencialidadeId: conf, pastaCaminho: rowProj?._b.caminho ?? null,
          dataConclusaoReal: rowProj?._b.real ?? null, camposExtras: extras, origemImportacao: origem(linhaProj.linha), importacaoId: id, createdById: req.user!.id, updatedById: req.user!.id,
        } as never).returning({ id: projetos.id });
        projetoId = p.id; r.projetosCriados++;
        await audit(tx, ctxA, { acao: 'CREATE', modulo: 'Projetos', registroId: p.id, rotulo: cod, projetoId: p.id, novo: nome, info: { importacaoId: id, linha: linhaProj.linha } });
      } else r.projetosAtualizados++;
      // etapas
      const etapaId = new Map<string, number>();
      const existentes = await tx.select({ id: etapas.id, letra: etapas.letra }).from(etapas).where(eq(etapas.projetoId, projetoId));
      for (const e of existentes) etapaId.set(e.letra, e.id);
      const stMapa = new Map(ctx.status.map((s) => [norm(s.nome), s.id]));
      for (const l of validas.filter((x) => x.letra)) {
        const b = l._b; const resp = pessoa(b.equipe); const sm = pessoa(b.scrum);
        for (const nm of [b.equipe, b.scrum]) if (nm && !NAO_PESSOAS.has(norm(nm)) && !pessoa(nm)) semVinculo.add(norm(nm));
        const tags = [b.equipe, b.scrum].filter((x): x is string => !!x && NAO_PESSOAS.has(norm(x))).map((x) => (norm(x) === 'individual' ? 'Individual' : 'Equipe completa'));
        const [e] = await tx.insert(etapas).values({
          projetoId, letra: l.letra!, ordem: ordemDeLetra(l.letra!), nome: b.atividade!, responsavelId: resp, scrumMasterId: sm, tags: [...new Set(tags)],
          statusId: l.statusId ?? stMapa.get('aguardando') ?? stIni.id, dataInicio: b.inicio, dataPrevista: b.prevista, dataConclusaoReal: b.real, pastaCaminho: b.caminho,
          origemImportacao: origem(l.linha), importacaoId: id,
        }).returning({ id: etapas.id });
        if (resp) await tx.insert(etapaMembros).values({ etapaId: e.id, userId: resp }).onConflictDoNothing();
        etapaId.set(l.letra!, e.id); r.etapasCriadas++;
        await audit(tx, ctxA, { acao: 'CREATE', modulo: 'Etapas', registroId: e.id, rotulo: `${cod} ${l.letra}`, projetoId, novo: b.atividade, info: { importacaoId: id, linha: l.linha } });
      }
      // movimentações (inclui as novas de linhas cujo projeto/etapa já existia)
      for (const l of ls) {
        if (l.estado === 'DUPLICADO' && !l.existente) continue;
        const eid = l.letra ? etapaId.get(l.letra) ?? null : null;
        if (l.letra && !eid) continue;
        for (const m of l._b.movs) {
          if (m.data > hoje()) continue;
          const k = movKey(cod, l.letra, m.data, m.texto);
          if (ctx.movsExistentes.has(k) || vistas.has(k)) continue; vistas.add(k);
          const autor = bracketAutor(m.texto); const uid = (autor ? userPor.get(norm(autor)) : null) ?? req.user!.id;
          const [mv] = await tx.insert(movimentacoes).values({
            projetoId, etapaId: eid, tipoId: tipoAtu.id, usuarioId: uid, descricao: m.texto, importada: true, importacaoId: id, origemLinha: l.linha,
            dataHora: sql`((${m.data}::text)::date + time '12:00')::timestamp AT TIME ZONE ${TZ}::text` as never,
          }).returning({ dh: movimentacoes.dataHora });
          await tx.update(projetos).set({ ultimaMovimentacaoEm: sql`GREATEST(COALESCE(${projetos.ultimaMovimentacaoEm}, ${mv.dh}), ${mv.dh})` }).where(eq(projetos.id, projetoId));
          r.movimentacoes++;
        }
      }
      for (const eid of etapaId.values()) await recalcEtapa(tx, eid);
      await recalcProjeto(tx, projetoId);
    }
    r.pessoasSemVinculo = semVinculo.size;
    r.etapasIgnoradas = pay.linhas.filter((l) => l.letra && l.estado !== 'VALIDO').length;
    await tx.update(importacoes).set({ status: 'CONCLUIDA', resultado: r, payload: null, concluidaEm: new Date() }).where(eq(importacoes.id, id));
    await audit(tx, ctxA, { acao: 'CREATE', modulo: 'Importação', registroId: id, rotulo: imp.arquivoNome, novo: `${r.projetosCriados} projeto(s), ${r.etapasCriadas} etapa(s), ${r.movimentacoes} movimentação(ões)`, info: r });
    return r;
  });
  res.json({ ok: true, resultado });
}));
