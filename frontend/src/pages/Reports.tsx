import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileText, FileDown, BarChart3 } from 'lucide-react';
import { API_URL, get, qs } from '../lib/api';
import { useFrentes, useStatus, usePessoas } from '../lib/queries';
import { Button, Card, Empty, ErrorBox, Field, Input, Loading, Opts, PageHeader, Select, Table, Td, Th, cx } from '../components/ui';

const ROT: Record<string, string> = { frenteId: 'Frente', statusId: 'Status', donoId: 'Dono', projetoId: 'Projeto', userId: 'Usuário', dias: 'Vencendo em (dias)', modulo: 'Módulo', de: 'De', ate: 'Até' };

export default function ReportsPage() {
  const cat = useQuery({ queryKey: ['reports-cat'], queryFn: () => get('/reports') });
  const frentes = useFrentes(); const status = useStatus(); const pessoas = usePessoas();
  const [sel, setSel] = useState<string>(''); const [f, setF] = useState<Record<string, string>>({});
  useEffect(() => { if (!sel && cat.data?.length) setSel(cat.data[0].id); }, [cat.data, sel]);
  const def = cat.data?.find((r: any) => r.id === sel);
  const q = qs(f);
  const prev = useQuery({ queryKey: ['report', sel, q], queryFn: () => get(`/reports/${sel}${q}`), enabled: !!sel, placeholderData: (p) => p });
  const link = (fmt: string) => `${API_URL}/reports/${sel}${qs({ ...f, formato: fmt })}`;
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  return (
    <>
      <PageHeader title="Relatórios" subtitle="Escolha um relatório, ajuste os filtros e exporte em Excel, CSV ou PDF." />
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit p-2">
          {cat.isLoading ? <Loading /> : cat.data?.map((r: any) => (
            <button key={r.id} onClick={() => { setSel(r.id); setF({}); }} className={cx('flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors', sel === r.id ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-50')}>
              <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 opacity-60" /><span><span className="block font-medium">{r.nome}</span></span>
            </button>))}
        </Card>
        <div className="min-w-0">
          {def && (
            <Card className="mb-4 p-4">
              <p className="mb-3 text-sm text-slate-500">{def.descricao}</p>
              <div className="flex flex-wrap items-end gap-2">
                {def.filtros.includes('frenteId') && <Field label={ROT.frenteId}><Select className="!w-44" value={f.frenteId ?? ''} onChange={(e) => set('frenteId', e.target.value)}><Opts items={frentes.data} empty="Todas" /></Select></Field>}
                {def.filtros.includes('statusId') && <Field label={ROT.statusId}><Select className="!w-40" value={f.statusId ?? ''} onChange={(e) => set('statusId', e.target.value)}><Opts items={status.data} empty="Todos" /></Select></Field>}
                {def.filtros.includes('donoId') && <Field label={ROT.donoId}><Select className="!w-44" value={f.donoId ?? ''} onChange={(e) => set('donoId', e.target.value)}><Opts items={pessoas.data} empty="Todos" /></Select></Field>}
                {def.filtros.includes('userId') && <Field label={ROT.userId}><Select className="!w-44" value={f.userId ?? ''} onChange={(e) => set('userId', e.target.value)}><Opts items={pessoas.data} empty="Todos" /></Select></Field>}
                {def.filtros.includes('dias') && <Field label={ROT.dias}><Input type="number" min={1} max={365} className="!w-28" placeholder="30" value={f.dias ?? ''} onChange={(e) => set('dias', e.target.value)} /></Field>}
                {def.filtros.includes('modulo') && <Field label={ROT.modulo}><Input className="!w-36" value={f.modulo ?? ''} onChange={(e) => set('modulo', e.target.value)} /></Field>}
                {def.filtros.includes('de') && <Field label={ROT.de}><Input type="date" className="!w-36" value={f.de ?? ''} onChange={(e) => set('de', e.target.value)} /></Field>}
                {def.filtros.includes('ate') && <Field label={ROT.ate}><Input type="date" className="!w-36" value={f.ate ?? ''} onChange={(e) => set('ate', e.target.value)} /></Field>}
                <Button variant="ghost" onClick={() => setF({})}>Limpar</Button>
                <div className="ml-auto flex gap-2">
                  <a href={link('xlsx')}><Button><FileSpreadsheet className="h-4 w-4 text-emerald-600" />Excel</Button></a>
                  <a href={link('csv')}><Button><FileDown className="h-4 w-4" />CSV</Button></a>
                  <a href={link('pdf')}><Button variant="primary"><FileText className="h-4 w-4" />PDF</Button></a>
                </div>
              </div>
            </Card>
          )}
          <ErrorBox error={prev.error} />
          <Card>
            {prev.isLoading ? <Loading /> : !prev.data?.linhas.length ? <Empty>Nenhum registro para os filtros informados.</Empty> : (
              <>
                <Table>
                  <thead><tr>{prev.data.colunas.map((c: any) => <Th key={c.chave} className={c.num ? 'text-right' : ''}>{c.titulo}</Th>)}</tr></thead>
                  <tbody>{prev.data.linhas.map((l: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50/60">{prev.data.colunas.map((c: any) => <Td key={c.chave} className={cx('max-w-[320px] truncate', c.num && 'text-right tabular-nums')} title={String(l[c.chave] ?? '')}>{l[c.chave] ?? ''}</Td>)}</tr>))}</tbody>
                </Table>
                <div className="border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500">
                  Prévia: {prev.data.linhas.length} linha(s){prev.data.truncado ? ' (limitada — os arquivos exportados trazem o resultado completo)' : ''}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
