import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { notFound, optDate, optInt, optStr, parse, wrap, forbidden } from '../lib/http.js';
import { requirePerm } from '../middleware/auth.js';
import { RELATORIOS, brHora, type Cell, type Resultado } from '../lib/reports.js';

export const reportsRouter = Router();
const VERSAO = '0.6.0';
const MAX = { json: 500, csv: 200000, xlsx: 200000, pdf: 50000 };
const SISTEMA = 'Controle BSC — APD/UPD';

const logoSvg = (() => {
  for (const p of [path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/logoUrbs.svg'), path.resolve(process.cwd(), 'assets/logoUrbs.svg')]) {
    try { return readFileSync(p, 'utf8'); } catch { /* tenta o próximo */ }
  }
  return null;
})();

const filtrosQ = z.object({
  formato: z.enum(['json', 'xlsx', 'csv', 'pdf']).default('json'),
  frenteId: optInt, statusId: optInt, donoId: optInt, projetoId: optInt, userId: optInt, dias: optInt, modulo: optStr, de: optDate, ate: optDate,
});

reportsRouter.get('/', requirePerm('reports.view'), wrap(async (req, res) => {
  res.json(RELATORIOS.filter((r) => !r.perm || req.user!.permissions.has(r.perm)).map(({ id, nome, descricao, filtros }) => ({ id, nome, descricao, filtros })));
}));

reportsRouter.get('/:id', requirePerm('reports.view'), wrap(async (req, res) => {
  const def = RELATORIOS.find((r) => r.id === req.params.id);
  if (!def) throw notFound('Relatório');
  if (def.perm && !req.user!.permissions.has(def.perm)) throw forbidden();
  const { formato, ...f } = parse(filtrosQ, req.query);
  const r = await def.run(req.user!, f, MAX[formato]);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const nomeArq = `relatorio-${def.id}-${stamp}`;
  const filtrosTxt = Object.entries(f).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`).join(' · ');
  if (formato === 'json') return res.json({ id: def.id, nome: def.nome, geradoEm: new Date().toISOString(), total: r.linhas.length, ...r });
  if (formato === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArq}.csv"`);
    return res.send(toCsv(r));
  }
  if (formato === 'xlsx') {
    const buf = await toXlsx(def.nome, r, req.user!.nome, filtrosTxt);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArq}.xlsx"`);
    return res.send(buf);
  }
  const buf = await toPdf(def.nome, r, req.user!.nome, filtrosTxt);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeArq}.pdf"`);
  res.send(buf);
}));

// ───────────── Renderizadores ─────────────
const guardaFormula = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
function toCsv(r: Resultado): Buffer {
  const esc = (c: Cell) => {
    if (c == null) return '';
    const s = typeof c === 'number' ? String(c).replace('.', ',') : guardaFormula(c);
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = [r.colunas.map((c) => esc(c.titulo)).join(';'), ...r.linhas.map((l) => r.colunas.map((c) => esc(l[c.chave] ?? null)).join(';'))];
  return Buffer.from('﻿' + linhas.join('\r\n') + '\r\n', 'utf8');
}

async function toXlsx(nome: string, r: Resultado, usuario: string, filtros: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = SISTEMA; wb.created = new Date();
  const ws = wb.addWorksheet(nome.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '), { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.addRow([`${SISTEMA} — ${nome}`]).font = { bold: true, size: 14, color: { argb: 'FF586877' } };
  ws.addRow([`Gerado em ${brHora(new Date())} por ${usuario}${filtros ? ` · Filtros: ${filtros}` : ''}${r.truncado ? ' · RESULTADO TRUNCADO' : ''}`]).font = { italic: true, size: 9, color: { argb: 'FF666666' } };
  ws.addRow([]);
  const h = ws.addRow(r.colunas.map((c) => c.titulo));
  h.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF586877' } }; c.alignment = { vertical: 'middle', wrapText: true }; });
  for (const l of r.linhas) {
    const row = ws.addRow(r.colunas.map((c) => l[c.chave] ?? null));
    r.colunas.forEach((c, i) => { if (c.num) row.getCell(i + 1).alignment = { horizontal: 'right' }; else row.getCell(i + 1).alignment = { vertical: 'top', wrapText: true }; });
  }
  r.colunas.forEach((c, i) => { ws.getColumn(i + 1).width = c.largura ?? (c.num ? 13 : 16); });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: r.colunas.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function toPdf(nome: string, r: Resultado, usuario: string, filtros: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, bufferPages: true, info: { Title: nome, Author: SISTEMA, Producer: SISTEMA } });
    const parts: Buffer[] = [];
    doc.on('data', (b: Buffer) => parts.push(b)); doc.on('end', () => resolve(Buffer.concat(parts))); doc.on('error', reject);
    const M = 28; const W = doc.page.width - M * 2; const TOP = 78; const BOTTOM = doc.page.height - 34;
    const soma = r.colunas.reduce((s, c) => s + (c.largura ?? (c.num ? 9 : 14)), 0);
    const ws = r.colunas.map((c) => ((c.largura ?? (c.num ? 9 : 14)) / soma) * W);
    const geradoEm = brHora(new Date());

    const cabecalho = () => {
      if (logoSvg) { doc.save(); doc.translate(M, 21); doc.scale(78 / 410); SVGtoPDF(doc, logoSvg, 0, 0); doc.restore(); }
      doc.fillColor('#586877').font('Helvetica-Bold').fontSize(13).text(SISTEMA, M + 92, 24, { width: W - 92, lineBreak: false });
      doc.fillColor('#111').fontSize(11).text(nome, M + 92, 41, { width: W - 92, lineBreak: false });
      doc.fillColor('#666').font('Helvetica').fontSize(7.5).text(`Gerado em ${geradoEm} por ${usuario}${filtros ? ` · ${filtros}` : ''}`, M + 92, 56, { width: W - 92, lineBreak: false });
      doc.moveTo(M, 70).lineTo(M + W, 70).strokeColor('#586877').lineWidth(1).stroke();
    };
    const linhaTitulo = (y: number) => {
      doc.rect(M, y, W, 16).fill('#586877');
      let x = M; doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7.5);
      r.colunas.forEach((c, i) => { doc.text(c.titulo, x + 3, y + 4.5, { width: ws[i] - 6, lineBreak: false, ellipsis: true, align: c.num ? 'right' : 'left' }); x += ws[i]; });
      return y + 16;
    };
    cabecalho(); let y = linhaTitulo(TOP);
    doc.font('Helvetica').fontSize(7.5);
    if (!r.linhas.length) { doc.fillColor('#666').text('Nenhum registro encontrado para os filtros informados.', M, y + 10); }
    r.linhas.forEach((l, n) => {
      const txt = r.colunas.map((c) => String(l[c.chave] ?? ''));
      const hs = txt.map((t, i) => doc.heightOfString(t, { width: ws[i] - 6 }));
      const h = Math.min(Math.max(...hs, 9) + 6, 90);
      if (y + h > BOTTOM) { doc.addPage(); cabecalho(); y = linhaTitulo(TOP); doc.font('Helvetica').fontSize(7.5); }
      if (n % 2 === 1) doc.rect(M, y, W, h).fill('#f3f5f7');
      doc.fillColor('#222'); let x = M;
      txt.forEach((t, i) => { doc.text(t, x + 3, y + 3, { width: ws[i] - 6, height: h - 4, ellipsis: true, align: r.colunas[i].num ? 'right' : 'left' }); x += ws[i]; });
      y += h;
    });
    if (r.truncado) { doc.fillColor('#b45309').font('Helvetica-Bold').text('Resultado truncado: refine os filtros para ver todos os registros.', M, Math.min(y + 8, BOTTOM)); }
    const total = doc.bufferedPageRange().count;
    for (let i = 0; i < total; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc.moveTo(M, doc.page.height - 30).lineTo(M + W, doc.page.height - 30).strokeColor('#cbd2d9').lineWidth(0.5).stroke();
      doc.fillColor('#666').font('Helvetica').fontSize(7)
        .text(`${SISTEMA} · v${VERSAO} · URBS — Urbanização de Curitiba · ${r.linhas.length} registro(s)`, M, doc.page.height - 24, { width: W - 90, lineBreak: false })
        .text(`Página ${i + 1} de ${total}`, M + W - 90, doc.page.height - 24, { width: 90, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}
void optStr;
