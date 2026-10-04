import ExcelJS from 'exceljs';
import { hoje } from './prazo.js';

// ───────────── Leitura (Excel/CSV -> grade de células) ─────────────
export type Grid = { rows: unknown[][]; nome: string };
export interface Arquivo { abas: string[]; aba: string; grid: unknown[][] }

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export { norm };

function celula(v: any): unknown {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return celula(v.result);
    if ('richText' in v) return (v.richText as { text: string }[]).map((t) => t.text).join('');
    if ('text' in v) return celula(v.text);
    if ('error' in v) return null;
    return String(v);
  }
  return v;
}

function parseCsv(texto: string): unknown[][] {
  const t = texto.replace(/^﻿/, '');
  const primeira = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
  const out: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); out.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); out.push(row); }
  return out;
}

export async function lerArquivo(buf: Buffer, nomeArquivo: string, abaPedida?: string): Promise<Arquivo> {
  if (/\.csv$/i.test(nomeArquivo)) return { abas: ['CSV'], aba: 'CSV', grid: parseCsv(buf.toString('utf8')) };
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf as unknown as ArrayBuffer); } catch { throw new Error('Não foi possível ler o arquivo. Envie uma planilha Excel (.xlsx) ou CSV.'); }
  const abas = wb.worksheets.map((w) => w.name);
  const aba = (abaPedida && abas.includes(abaPedida) ? abaPedida : abas.find((a) => /^\d{4}$/.test(a.trim())) ?? abas[0]);
  const ws = wb.getWorksheet(aba);
  if (!ws) throw new Error('A planilha não possui abas.');
  const grid: unknown[][] = [];
  const maxCol = ws.columnCount;
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r); const linha: unknown[] = [];
    for (let c = 1; c <= maxCol; c++) linha.push(celula(row.getCell(c).value));
    grid.push(linha);
  }
  return { abas, aba, grid };
}

// ───────────── Valores ─────────────
export const texto = (v: unknown): string | null => {
  if (v == null) return null;
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
};
const pad = (n: number) => String(n).padStart(2, '0');
function calendario(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1990 && y <= 2100 ? `${y}-${pad(m)}-${pad(d)}` : null;
}
/** ok=false quando há conteúdo que não é uma data válida. Vazio -> { iso: null, ok: true }. */
export function parseData(v: unknown): { iso: string | null; ok: boolean } {
  if (v == null) return { iso: null, ok: true };
  if (v instanceof Date) return { iso: Number.isNaN(+v) ? null : v.toISOString().slice(0, 10), ok: !Number.isNaN(+v) };
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000)); return { iso: d.toISOString().slice(0, 10), ok: v > 20000 && v < 80000 }; }
  const s = String(v).trim();
  if (!s) return { iso: null, ok: true };
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); const iso = calendario(y, Number(m[2]), Number(m[1])); return { iso, ok: !!iso }; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) { const iso = calendario(Number(m[1]), Number(m[2]), Number(m[3])); return { iso, ok: !!iso }; }
  return { iso: null, ok: false };
}

// ───────────── Estrutura da planilha ─────────────
export type Campo = 'mapa' | 'direcionador' | 'codigo' | 'acao' | 'etapa' | 'dono' | 'scrum' | 'equipe' | 'nome' | 'conf' | 'atividade' | 'caminho' | 'status' | 'inicio' | 'prevista' | 'real';
export const CAMPOS_ROTULO: Record<Campo, string> = {
  mapa: 'Mapa Estratégico -> frente', direcionador: 'Direcionador -> campos extras do projeto', codigo: 'Código -> projeto.codigo', acao: 'Cód. Ação Tática -> campos extras do projeto',
  etapa: 'Etapa -> etapa.letra', dono: 'D. Produto -> projeto.dono', scrum: 'Scrum master -> etapa.scrum_master', equipe: 'Equipe -> etapa.responsável e equipe', nome: 'Nome do projeto -> projeto.nome',
  conf: 'Confidencialidade -> projeto.confidencialidade', atividade: 'Atividade -> etapa.nome', caminho: 'Caminho da pasta -> pasta de rede', status: 'Status -> status',
  inicio: 'Data Início -> etapa.data_inicio', prevista: 'Dt. entrega prevista -> etapa.data_prevista', real: 'Dta. entrega real -> etapa.data_conclusao_real',
};
const OBRIGATORIOS: Campo[] = ['codigo', 'etapa', 'nome', 'atividade'];

function campoDe(cab: string): Campo | null {
  const n = norm(cab);
  if (!n) return null;
  if (n.includes('mapaestrategico') || n === 'frente') return 'mapa';
  if (n.includes('direcionador')) return 'direcionador';
  if (n.includes('acaotatica')) return 'acao';
  if (n === 'codigo' || n === 'codigodoprojeto' || n === 'codprojeto') return 'codigo';
  if (n === 'etapa' || n === 'letra') return 'etapa';
  if (n === 'dproduto' || n === 'donodoprojeto' || n === 'dono' || n === 'donodoproduto') return 'dono';
  if (n.startsWith('scrum')) return 'scrum';
  if (n === 'equipe') return 'equipe';
  if (n === 'nomedoprojeto' || n === 'projeto') return 'nome';
  if (n.startsWith('confidencialidade')) return 'conf';
  if (n === 'atividade' || n === 'nomedaetapa') return 'atividade';
  if (n.startsWith('caminho')) return 'caminho';
  if (n === 'status') return 'status';
  if (n === 'datainicio' || n === 'inicio') return 'inicio';
  if (n.includes('entrega') && n.includes('prevista')) return 'prevista';
  if (n.includes('entrega') && (n.includes('real') || n.startsWith('dta'))) return 'real';
  return null;
}

export const letraColuna = (i: number) => { let s = ''; let x = i + 1; while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); } return s; };

export interface Movimento { data: string; texto: string; coluna: string }
export interface LinhaBruta {
  linha: number; mapa: string | null; direcionador: string | null; acao: string | null; codigo: string | null; letra: string | null;
  dono: string | null; scrum: string | null; equipe: string | null; nome: string | null; conf: string | null; atividade: string | null; caminho: string | null;
  statusTxt: string | null; inicio: string | null; prevista: string | null; real: string | null; movs: Movimento[];
  invalidas: { campo: string; valor: string }[]; movsInvalidas: { coluna: string; valor: string }[];
}
export interface Estrutura { cabecalhoLinha: number; colunas: { letra: string; titulo: string; campo: Campo | 'movimentacao' }[]; faltando: Campo[]; linhas: LinhaBruta[]; totalColunasData: number }

export function analisarEstrutura(grid: unknown[][]): Estrutura {
  // localiza a linha de cabeçalho: contém "Código" e "Etapa"
  let h = -1;
  for (let r = 0; r < Math.min(grid.length, 40); r++) {
    const ns = grid[r].map(norm);
    if (ns.some((x) => x === 'codigo' || x === 'codigodoprojeto') && ns.includes('etapa')) { h = r; break; }
  }
  if (h < 0) throw new Error('Não encontrei o cabeçalho da planilha. A linha de títulos precisa ter as colunas "Código" e "Etapa".');
  const cab = grid[h]; const sub = grid[h + 1] ?? [];
  const mapa: Partial<Record<Campo, number>> = {}; const dataCols: { i: number; iso: string | null; raw: string }[] = [];
  const colunas: Estrutura['colunas'] = [];
  const subTemTexto = sub.some((x) => texto(x) && !(parseData(x).iso));
  cab.forEach((c, i) => {
    const t = texto(c);
    if (!t && !texto(sub[i])) return;
    const d = parseData(c);
    if (c instanceof Date || (typeof c === 'string' && /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,5}$/.test(c.trim()))) {
      dataCols.push({ i, iso: d.iso, raw: t ?? '' }); return;
    }
    const combinado = `${t ?? ''} ${subTemTexto ? texto(sub[i]) ?? '' : ''}`.trim();
    const campo = campoDe(combinado) ?? campoDe(t ?? '');
    if (campo && mapa[campo] === undefined) { mapa[campo] = i; colunas.push({ letra: letraColuna(i), titulo: combinado, campo }); }
    else if (t) colunas.push({ letra: letraColuna(i), titulo: combinado, campo: null as never });
  });
  const faltando = OBRIGATORIOS.filter((c) => mapa[c] === undefined);
  if (dataCols.length) colunas.push({ letra: `${letraColuna(dataCols[0].i)}–${letraColuna(dataCols[dataCols.length - 1].i)}`, titulo: `${dataCols.length} colunas de datas`, campo: 'movimentacao' });
  const get = (row: unknown[], c: Campo) => (mapa[c] === undefined ? null : row[mapa[c]!]);
  const linhas: LinhaBruta[] = [];
  for (let r = h + 1; r < grid.length; r++) {
    const row = grid[r];
    const t = (c: Campo) => texto(get(row, c));
    const chaves = [t('codigo'), t('etapa'), t('nome'), t('atividade')];
    if (!chaves.some(Boolean)) {
      // linha totalmente vazia ou sub-cabeçalho (ex.: "prevista" sob "Dt. / Entrega")
      continue;
    }
    const invalidas: LinhaBruta['invalidas'] = [];
    const dt = (c: Campo, rotulo: string) => { const v = get(row, c); const p = parseData(v); if (!p.ok) invalidas.push({ campo: rotulo, valor: texto(v) ?? '' }); return p.iso; };
    const movs: Movimento[] = []; const movsInvalidas: LinhaBruta['movsInvalidas'] = [];
    for (const dc of dataCols) {
      const tx = texto(row[dc.i]); if (!tx) continue;
      if (!dc.iso) movsInvalidas.push({ coluna: dc.raw, valor: tx }); else movs.push({ data: dc.iso, texto: tx, coluna: dc.raw });
    }
    linhas.push({
      linha: r + 1, mapa: t('mapa'), direcionador: t('direcionador'), acao: t('acao'), codigo: t('codigo'), letra: t('etapa'),
      dono: t('dono'), scrum: t('scrum'), equipe: t('equipe'), nome: t('nome'), conf: t('conf'), atividade: t('atividade'), caminho: t('caminho'),
      statusTxt: t('status'), inicio: dt('inicio', 'Data Início'), prevista: dt('prevista', 'Dt. entrega prevista'), real: dt('real', 'Dta. entrega real'),
      movs, invalidas, movsInvalidas,
    });
  }
  return { cabecalhoLinha: h + 1, colunas, faltando, linhas, totalColunasData: dataCols.length };
}

// ───────────── Validação e consolidação ─────────────
export type Nivel = 'ERRO' | 'AVISO' | 'DUPLICADO';
export type TipoProblema = 'CAMPO_OBRIGATORIO' | 'CODIGO_INVALIDO' | 'DATA_INVALIDA' | 'DUPLICADO' | 'STATUS' | 'CONFIDENCIALIDADE' | 'PESSOA' | 'OUTRO';
export interface Problema { linha: number; nivel: Nivel; tipo: TipoProblema; campo?: string; codigo?: string; mensagem: string }
export interface LinhaPronta {
  linha: number; codigo: string | null; letra: string | null; nome: string | null; atividade: string | null; estado: 'VALIDO' | 'ERRO' | 'DUPLICADO'; movimentos: number;
  _b: LinhaBruta; statusId?: number; existente?: boolean; // etapa/projeto já existe no sistema: só movimentações novas entram
}
export interface Contexto {
  frentes: { id: number; codigo: string; nome: string }[];
  status: { id: number; nome: string }[];
  confs: { id: number; nome: string; regraAcesso: string; nivel: number }[];
  projetosExistentes: Map<string, number>; // codigo -> id
  projetosInativos: Set<string>; // projetos excluídos: códigos nunca são reutilizados
  etapasExistentes: Set<string>; // `${codigo}|${letra}`
  movsExistentes: Set<string>; // `${codigo}|${letra ou ''}|${data}|${texto}`
}
export const NAO_PESSOAS = new Set(['individual', 'equipecompleta', 'equipe']);

export function resolverConf(txt: string | null, ctx: Contexto): { id: number | null; aviso?: string } {
  const n = norm(txt); if (!n) return { id: null };
  const porRegra = (re: string) => ctx.confs.find((c) => c.regraAcesso === re)?.id ?? null;
  if (n === 'livre') return { id: porRegra('TODOS') };
  if (n === 'internourbs') return { id: porRegra('USUARIOS') };
  if (n === 'internoapd') return { id: porRegra('EQUIPE_APD') };
  if (n === 'interno') return { id: porRegra('USUARIOS'), aviso: 'Confidencialidade “INTERNO” sem complemento: assumido “Interno URBS”.' };
  const direto = ctx.confs.find((c) => norm(c.nome) === n);
  return direto ? { id: direto.id } : { id: null, aviso: `Confidencialidade “${txt}” não reconhecida: será usado o padrão do sistema.` };
}

export function validar(linhas: LinhaBruta[], ctx: Contexto) {
  const problemas: Problema[] = []; const prontas: LinhaPronta[] = [];
  const vistos = new Map<string, number>(); // codigo|letra -> linha
  const frenteDe = (cod: string) => ctx.frentes.find((f) => f.codigo === cod.split('_')[0]);
  const statusPor = new Map(ctx.status.map((s) => [norm(s.nome), s.id]));
  const add = (p: Problema) => problemas.push(p);
  for (const b of linhas) {
    const L = b.linha; const antes = problemas.length; let dup = false;
    const codigo = b.codigo?.replace(/\s+/g, '') ?? null; const letra = b.letra ? b.letra.toUpperCase() : null;
    const pr: LinhaPronta = { linha: L, codigo, letra, nome: b.nome, atividade: b.atividade, estado: 'VALIDO', movimentos: b.movs.length, _b: b };
    if (!codigo) add({ linha: L, nivel: 'ERRO', tipo: 'CAMPO_OBRIGATORIO', campo: 'Código', mensagem: 'Código do projeto ausente.' });
    else if (!/^\d+_\d+$/.test(codigo)) add({ linha: L, nivel: 'ERRO', tipo: 'CODIGO_INVALIDO', campo: 'Código', codigo, mensagem: `Código “${b.codigo}” fora do formato FRENTE_NÚMERO (ex.: 2_1).` });
    else {
      const f = frenteDe(codigo);
      if (!f) add({ linha: L, nivel: 'ERRO', tipo: 'CODIGO_INVALIDO', campo: 'Código', codigo, mensagem: `A frente ${codigo.split('_')[0]} do código ${codigo} não está cadastrada.` });
      else if (b.mapa) {
        const nm = norm(b.mapa); const fm = ctx.frentes.find((x) => norm(x.nome) === nm);
        if (!fm) add({ linha: L, nivel: 'AVISO', tipo: 'OUTRO', campo: 'Mapa Estratégico', codigo, mensagem: `Mapa Estratégico “${b.mapa}” não corresponde a nenhuma frente; vale a frente do código (${f.nome}).` });
        else if (fm.id !== f.id) add({ linha: L, nivel: 'ERRO', tipo: 'CODIGO_INVALIDO', campo: 'Código', codigo, mensagem: `O código ${codigo} é da frente ${f.nome}, mas o Mapa Estratégico informa ${fm.nome}.` });
      }
    }
    if (letra && !/^[A-Z]{1,3}$/.test(letra)) add({ linha: L, nivel: 'ERRO', tipo: 'CODIGO_INVALIDO', campo: 'Etapa', codigo: codigo ?? undefined, mensagem: `Letra de etapa “${b.letra}” inválida (use A, B, C…).` });
    if (letra && !b.atividade) add({ linha: L, nivel: 'ERRO', tipo: 'CAMPO_OBRIGATORIO', campo: 'Atividade', codigo: codigo ?? undefined, mensagem: 'Nome da etapa (coluna Atividade) ausente.' });
    for (const i of b.invalidas) add({ linha: L, nivel: 'ERRO', tipo: 'DATA_INVALIDA', campo: i.campo, codigo: codigo ?? undefined, mensagem: `Data inválida em ${i.campo}: “${i.valor}”.` });
    if (b.inicio && b.prevista && b.prevista < b.inicio) add({ linha: L, nivel: 'ERRO', tipo: 'DATA_INVALIDA', campo: 'Dt. entrega prevista', codigo: codigo ?? undefined, mensagem: 'A data prevista é anterior à data de início.' });
    if (b.real && b.real > hoje()) add({ linha: L, nivel: 'AVISO', tipo: 'DATA_INVALIDA', campo: 'Dta. entrega real', codigo: codigo ?? undefined, mensagem: 'Data de entrega real no futuro.' });
    for (const m of b.movsInvalidas) add({ linha: L, nivel: 'AVISO', tipo: 'DATA_INVALIDA', campo: 'Coluna de data', codigo: codigo ?? undefined, mensagem: `Movimentação ignorada: cabeçalho de data inválido “${m.coluna}”.` });
    const hojeIso = hoje();
    if (b.movs.some((m) => m.data > hojeIso)) {
      add({ linha: L, nivel: 'AVISO', tipo: 'DATA_INVALIDA', campo: 'Coluna de data', codigo: codigo ?? undefined, mensagem: `${b.movs.filter((m) => m.data > hojeIso).length} movimentação(ões) com data futura serão ignoradas.` });
    }
    if (b.statusTxt) {
      const sid = statusPor.get(norm(b.statusTxt));
      if (!sid) add({ linha: L, nivel: 'ERRO', tipo: 'STATUS', campo: 'Status', codigo: codigo ?? undefined, mensagem: `Status “${b.statusTxt}” não existe no sistema.` });
      else pr.statusId = sid;
    } else add({ linha: L, nivel: 'AVISO', tipo: 'STATUS', campo: 'Status', codigo: codigo ?? undefined, mensagem: 'Status em branco: será usado “Aguardando”.' });
    // duplicados
    if (codigo && /^\d+_\d+$/.test(codigo)) {
      const k = `${codigo}|${letra ?? ''}`;
      if (vistos.has(k)) { dup = true; add({ linha: L, nivel: 'DUPLICADO', tipo: 'DUPLICADO', campo: letra ? 'Etapa' : 'Código', codigo, mensagem: `${letra ? `Etapa ${codigo} ${letra}` : `Linha do projeto ${codigo}`} repetida (já informada na linha ${vistos.get(k)}).` }); }
      else {
        vistos.set(k, L);
        if (ctx.projetosInativos.has(codigo)) add({ linha: L, nivel: 'ERRO', tipo: 'CODIGO_INVALIDO', campo: 'Código', codigo, mensagem: `O código ${codigo} pertence a um projeto excluído e não pode ser reutilizado.` });
        if (letra && ctx.etapasExistentes.has(k)) { dup = true; pr.existente = true; add({ linha: L, nivel: 'DUPLICADO', tipo: 'DUPLICADO', campo: 'Etapa', codigo, mensagem: `A etapa ${codigo} ${letra} já existe no sistema.` }); }
        if (!letra && ctx.projetosExistentes.has(codigo)) { dup = true; pr.existente = true; add({ linha: L, nivel: 'DUPLICADO', tipo: 'DUPLICADO', campo: 'Código', codigo, mensagem: `O projeto ${codigo} já existe no sistema (será mantido como está).` }); }
      }
    }
    const novos = problemas.slice(antes);
    pr.estado = novos.some((p) => p.nivel === 'ERRO') ? 'ERRO' : dup ? 'DUPLICADO' : 'VALIDO';
    prontas.push(pr);
  }
  // projetos: nome obrigatório e confidencialidade consolidada
  const grupos = new Map<string, LinhaPronta[]>();
  for (const p of prontas) if (p.codigo && /^\d+_\d+$/.test(p.codigo)) (grupos.get(p.codigo) ?? grupos.set(p.codigo, []).get(p.codigo)!).push(p);
  for (const [cod, ls] of grupos) {
    if (!ls.some((l) => l._b.nome)) for (const l of ls) { if (l.estado !== 'ERRO') l.estado = 'ERRO'; add({ linha: l.linha, nivel: 'ERRO', tipo: 'CAMPO_OBRIGATORIO', campo: 'Nome do projeto', codigo: cod, mensagem: `Nome do projeto ausente para ${cod}.` }); }
    const confs = new Set(ls.map((l) => norm(l._b.conf)).filter(Boolean));
    if (confs.size > 1) add({ linha: ls[0].linha, nivel: 'AVISO', tipo: 'CONFIDENCIALIDADE', campo: 'Confidencialidade', codigo: cod, mensagem: `As linhas de ${cod} têm confidencialidades diferentes: será usada a mais restritiva.` });
    const interno = ls.find((l) => norm(l._b.conf) === 'interno');
    if (interno) add({ linha: interno.linha, nivel: 'AVISO', tipo: 'CONFIDENCIALIDADE', campo: 'Confidencialidade', codigo: cod, mensagem: `${cod}: confidencialidade “INTERNO” sem complemento — assumido “Interno URBS”.` });
    const ex = ctx.projetosExistentes.has(cod);
    if (ex && ls.some((l) => l.estado === 'VALIDO')) add({ linha: ls[0].linha, nivel: 'AVISO', tipo: 'OUTRO', codigo: cod, mensagem: `O projeto ${cod} já existe: seus dados são mantidos e apenas etapas/movimentações novas serão acrescentadas.` });
  }
  return { problemas, prontas };
}

/** Status do projeto quando a planilha não traz linha própria do projeto: deriva das etapas. */
export function statusDerivado(nomes: string[]): string {
  const n = nomes.map(norm);
  const abertos = n.filter((x) => x !== 'cancelado');
  if (!abertos.length) return 'aguardando';
  if (abertos.every((x) => x === 'finalizado')) return 'finalizado';
  for (const k of ['atrasado', 'bloqueado', 'emandamento']) if (abertos.includes(k)) return k;
  if (abertos.every((x) => x === 'suspenso' || x === 'finalizado')) return 'suspenso';
  return 'aguardando';
}

// ───────────── Pessoas ─────────────
export interface PessoaUsuario { id: number; nome: string; username: string }
export function candidatos(nomePlanilha: string, usuarios: PessoaUsuario[]): PessoaUsuario[] {
  const n = norm(nomePlanilha); if (!n) return [];
  const exato = usuarios.filter((u) => norm(u.nome) === n || norm(u.username) === n);
  if (exato.length) return exato;
  return usuarios.filter((u) => norm(u.nome.split(/\s+/)[0]) === n);
}
export const bracketAutor = (t: string): string | null => { const m = t.match(/^\s*\[\s*([^\]\-–]+?)\s*(?:[-–][^\]]*)?\]/); return m ? m[1].trim() : null; };

export const pessoasMencionadas = (b: LinhaBruta): { nome: string; papel: 'dono' | 'scrum' | 'equipe' | 'autor' }[] => {
  const out: { nome: string; papel: 'dono' | 'scrum' | 'equipe' | 'autor' }[] = [];
  for (const m of b.movs) { const a = bracketAutor(m.texto); if (a) out.push({ nome: a, papel: 'autor' }); }
  for (const [campo, papel] of [['dono', 'dono'], ['scrum', 'scrum'], ['equipe', 'equipe']] as const) {
    const v = b[campo]; if (v && !NAO_PESSOAS.has(norm(v))) out.push({ nome: v, papel });
  }
  return out;
};
