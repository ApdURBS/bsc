import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Columns3, Download, Filter, Plus, X } from 'lucide-react';
import { get, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePessoas, useFrentes, useConfidencialidades, useStatus } from '../lib/queries';
import { Badge, Button, Card, Empty, Input, Loading, Opts, PageHeader, Pagination, PrazoBadge, Progress, Select, StatusBadge, Table, Td, Th, cx } from '../components/ui';
import { ProjectFormModal } from '../components/ProjectForm';
import { SITUACAO, fmtData, fmtDataHora } from '../lib/format';
import { Modal } from '../components/ui';
import { Plus as PlusIcon } from 'lucide-react';

const CARD_LABEL: Record<string, string> = { total: 'Total de projetos', vigentes: 'Projetos vigentes', andamento: 'Em andamento', finalizados: 'Finalizados', atrasados: 'Atrasados', bloqueados: 'Bloqueados', suspensos: 'Suspensos', semMovimentacao: 'Sem movimentação recente' };
const COLS = [
  ['frente', 'Frente'], ['scrum', 'Scrum Master (etapas)'], ['dono', 'Dono'], ['equipe', 'Equipe (etapas)'], ['status', 'Status'], ['confidencialidade', 'Confidencialidade'],
  ['execucao', 'Execução'], ['prazo', 'Prazo'], ['ultima', 'Última movimentação'],
] as const;
const DEFAULT_COLS = ['frente', 'scrum', 'status', 'execucao', 'prazo', 'ultima'];
const FILTROS = ['busca', 'frenteId', 'statusId', 'scrumMasterId', 'donoId', 'responsavelId', 'confidencialidadeId', 'situacaoPrazo', 'card', 'prazoDe', 'prazoAte', 'movDe', 'movAte', 'semMovimentacaoDias', 'meus', 'ativo'];

export default function Projects() {
  const [sp, setSp] = useSearchParams(); const nav = useNavigate(); const { can } = useAuth();
  const [novo, setNovo] = useState(false); const [criado, setCriado] = useState<{ id: number; codigo: string } | null>(null);
  const [mais, setMais] = useState(false); const [colsMenu, setColsMenu] = useState(false);
  const [cols, setCols] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('bsc.cols.v2') ?? '') || DEFAULT_COLS; } catch { return DEFAULT_COLS; } });
  useEffect(() => { try { localStorage.setItem('bsc.cols.v2', JSON.stringify(cols)); } catch { /* */ } }, [cols]);
  const [busca, setBusca] = useState(sp.get('busca') ?? '');
  const frentes = useFrentes(), status = useStatus(), colabs = usePessoas(), confs = useConfidencialidades();

  const params = Object.fromEntries(sp.entries());
  const page = Number(sp.get('page') ?? 1); const sort = sp.get('sort') ?? 'codigo'; const dir = sp.get('dir') ?? 'asc';
  const set = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); return n; }, { replace: true });
  useEffect(() => { const t = setTimeout(() => { if ((sp.get('busca') ?? '') !== busca) set('busca', busca); }, 350); return () => clearTimeout(t); }, [busca]);
  const onSort = (s: string) => setSp((p) => { const n = new URLSearchParams(p); n.set('sort', s); n.set('dir', sort === s && dir === 'asc' ? 'desc' : 'asc'); n.delete('page'); return n; }, { replace: true });
  const filtrosAtivos = FILTROS.filter((k) => sp.get(k)).length;

  const query = qs({ ...params, page, pageSize: 25, sort, dir });
  const { data, isLoading, isFetching } = useQuery({ queryKey: ['projetos', query], queryFn: () => get(`/projects${query}`), placeholderData: (p) => p });
  const show = (c: string) => cols.includes(c);

  const exportar = async () => {
    const linhas: string[][] = [['Código', 'Projeto', 'Frente', 'Scrum Master (etapas)', 'Dono', 'Equipe (etapas)', 'Status', 'Confidencialidade', 'Execução %', 'Início', 'Prazo', 'Situação do prazo', 'Última movimentação']];
    for (let pg = 1; pg <= 100; pg++) {
      const r = await get(`/projects${qs({ ...params, page: pg, pageSize: 200, sort, dir })}`);
      for (const p of r.itens) linhas.push([p.codigo, p.nome, p.frente.nome, (p.scrumNomes ?? []).join(', '), p.dono?.nome ?? '', (p.equipeNomes ?? []).join(', '), p.status.nome, p.confidencialidade.nome, String(p.percentualExecucao), p.dataInicio ?? '', p.dataPrevista ?? '', SITUACAO[p.prazo.situacao].label, p.ultimaMovimentacaoEm ?? '']);
      if (pg * 200 >= r.total) break;
    }
    const csv = '﻿' + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'projetos.csv'; a.click();
  };

  const chips = useMemo(() => {
    const c: [string, string][] = [];
    if (sp.get('card')) c.push(['card', CARD_LABEL[sp.get('card')!] ?? sp.get('card')!]);
    if (sp.get('meus')) c.push(['meus', 'Meus projetos']);
    if (sp.get('prazoDe') || sp.get('prazoAte')) c.push(['prazoDe', `Prazo: ${fmtData(sp.get('prazoDe'))} → ${sp.get('prazoAte') ? fmtData(sp.get('prazoAte')) : '…'}`]);
    if (sp.get('responsavelId')) c.push(['responsavelId', `Responsável: ${colabs.data?.find((x: any) => String(x.id) === sp.get('responsavelId'))?.nome ?? ''}`]);
    if (sp.get('semMovimentacaoDias')) c.push(['semMovimentacaoDias', `Sem movimentação > ${sp.get('semMovimentacaoDias')} dias`]);
    if (sp.get('movDe') || sp.get('movAte')) c.push(['movDe', `Últ. movimentação: ${fmtData(sp.get('movDe'))} → ${fmtData(sp.get('movAte'))}`]);
    return c;
  }, [sp, colabs.data]);
  const limpar = () => { setBusca(''); setSp(new URLSearchParams(), { replace: true }); };
  const quick = (k: string, label: string, items?: { id: number; nome: string }[]) => (
    <Select aria-label={label} className="!w-44" value={sp.get(k) ?? ''} onChange={(e) => set(k, e.target.value)}><Opts items={items} empty={label} /></Select>
  );

  return (
    <>
      <PageHeader title="Projetos" subtitle={data ? `${data.total} projeto${data.total === 1 ? '' : 's'} encontrado${data.total === 1 ? '' : 's'}` : undefined}
        actions={<>
          <Button onClick={exportar}><Download className="h-4 w-4" />Exportar CSV</Button>
          <div className="relative">
            <Button onClick={() => setColsMenu((v) => !v)}><Columns3 className="h-4 w-4" />Colunas</Button>
            {colsMenu && (
              <div className="absolute right-0 top-10 z-30 w-52 rounded-lg border border-slate-200 bg-white p-2 shadow-xl" onMouseLeave={() => setColsMenu(false)}>
                {COLS.map(([k, l]) => <label key={k} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"><input type="checkbox" checked={cols.includes(k)} onChange={() => setCols((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]))} />{l}</label>)}
              </div>
            )}
          </div>
          {can('projects.create') && <Button variant="primary" onClick={() => setNovo(true)}><Plus className="h-4 w-4" />Novo projeto</Button>}
        </>} />

      <Card>
        <div className="space-y-3 border-b border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input className="!w-72" placeholder="Buscar código, nome, etapa, atividade…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            {quick('frenteId', 'Todas as frentes', frentes.data)}
            {quick('statusId', 'Todos os status', status.data)}
            {quick('scrumMasterId', 'Scrum Master', colabs.data)}
            <Select aria-label="Situação do prazo" className="!w-44" value={sp.get('situacaoPrazo') ?? ''} onChange={(e) => set('situacaoPrazo', e.target.value)}>
              <option value="">Situação do prazo</option>{Object.entries(SITUACAO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <Button variant="ghost" onClick={() => setMais((v) => !v)}><Filter className="h-4 w-4" />Mais filtros{filtrosAtivos > 0 && <Badge color="#1f5aa6">{filtrosAtivos}</Badge>}</Button>
            {(filtrosAtivos > 0 || busca) && <Button variant="ghost" onClick={limpar}><X className="h-4 w-4" />Limpar filtros</Button>}
          </div>
          {mais && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              {quick('donoId', 'Dono', colabs.data)}{quick('responsavelId', 'Participante (etapas)', colabs.data)}{quick('confidencialidadeId', 'Confidencialidade', confs.data)}
              <Select className="!w-48" value={sp.get('card') ?? ''} onChange={(e) => set('card', e.target.value)}><option value="">Indicador</option>{Object.entries(CARD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">Prazo de<Input type="date" className="!w-36" value={sp.get('prazoDe') ?? ''} onChange={(e) => set('prazoDe', e.target.value)} />até<Input type="date" className="!w-36" value={sp.get('prazoAte') ?? ''} onChange={(e) => set('prazoAte', e.target.value)} /></label>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">Últ. movimentação de<Input type="date" className="!w-36" value={sp.get('movDe') ?? ''} onChange={(e) => set('movDe', e.target.value)} />até<Input type="date" className="!w-36" value={sp.get('movAte') ?? ''} onChange={(e) => set('movAte', e.target.value)} /></label>
              <Select className="!w-40" value={sp.get('ativo') ?? 'true'} onChange={(e) => set('ativo', e.target.value === 'true' ? '' : e.target.value)}><option value="true">Somente ativos</option><option value="false">Somente inativos</option><option value="todos">Ativos e inativos</option></Select>
            </div>
          )}
          {chips.length > 0 && <div className="flex flex-wrap gap-1.5">{chips.map(([k, l]) => <span key={k} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800">{l}<button onClick={() => { set(k, ''); if (k === 'prazoDe') set('prazoAte', ''); if (k === 'movDe') set('movAte', ''); }} aria-label="Remover filtro"><X className="h-3 w-3" /></button></span>)}</div>}
        </div>

        {isLoading ? <Loading /> : !data?.itens.length ? <Empty>Nenhum projeto encontrado com os filtros atuais.</Empty> : (
          <div className={cx(isFetching && 'opacity-70 transition-opacity')}>
            <Table>
              <thead><tr>
                <Th sort="codigo" cur={sort} dir={dir} onSort={onSort}>Código</Th><Th sort="nome" cur={sort} dir={dir} onSort={onSort}>Projeto</Th>
                {show('frente') && <Th sort="frente" cur={sort} dir={dir} onSort={onSort}>Frente</Th>}{show('scrum') && <Th>Scrum Master (etapas)</Th>}{show('dono') && <Th>Dono</Th>}{show('equipe') && <Th>Equipe (etapas)</Th>}
                {show('status') && <Th sort="status" cur={sort} dir={dir} onSort={onSort}>Status</Th>}{show('confidencialidade') && <Th>Confidencialidade</Th>}
                {show('execucao') && <Th sort="execucao" cur={sort} dir={dir} onSort={onSort}>Execução</Th>}{show('prazo') && <Th sort="prazo" cur={sort} dir={dir} onSort={onSort}>Prazo</Th>}
                {show('ultima') && <Th sort="ultimaMovimentacao" cur={sort} dir={dir} onSort={onSort}>Última movimentação</Th>}
              </tr></thead>
              <tbody>
                {data.itens.map((p: any) => (
                  <tr key={p.id} onClick={() => nav(`/projetos/${p.id}`)} className={cx('cursor-pointer hover:bg-slate-50', !p.ativo && 'opacity-50')}>
                    <Td><span className="font-mono text-[13px] font-semibold text-brand-800">{p.codigo}</span></Td>
                    <Td className="max-w-[260px]"><div className="truncate font-medium text-slate-800" title={p.nome}>{p.nome}</div>{!p.ativo && <span className="text-xs text-slate-400">Inativo</span>}</Td>
                    {show('frente') && <Td className="text-slate-600">{p.frente.nome}</Td>}{show('scrum') && <Td>{(p.scrumNomes ?? []).join(', ') || '—'}</Td>}{show('dono') && <Td>{p.dono?.nome ?? '—'}</Td>}{show('equipe') && <Td className="max-w-[12rem] truncate" title={(p.equipeNomes ?? []).join(', ')}>{p.equipeNomes?.length ? p.equipeNomes.join(', ') : '—'}</Td>}
                    {show('status') && <Td><StatusBadge status={p.status} /></Td>}{show('confidencialidade') && <Td>{p.confidencialidade.nome}</Td>}
                    {show('execucao') && <Td><Progress value={p.percentualExecucao} /></Td>}
                    {show('prazo') && <Td><div className="text-slate-700">{fmtData(p.dataPrevista)}</div><PrazoBadge prazo={p.prazo} /></Td>}
                    {show('ultima') && <Td className="text-slate-600"><div>{p.ultimaMovimentacaoEm ? fmtData(p.ultimaMovimentacaoEm) : '—'}</div>{p.semMovimentacao.alerta && <span className="text-xs font-medium text-amber-600">há {p.semMovimentacao.dias} dias</span>}</Td>}
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(n) => set('page', String(n))} />
          </div>
        )}
      </Card>

      <ProjectFormModal open={novo} onClose={() => setNovo(false)} onCreated={setCriado} />
      <Modal open={!!criado} onClose={() => setCriado(null)} size="sm" title="Projeto criado"
        footer={<><Button onClick={() => setCriado(null)}>Fechar</Button><Button variant="secondary" onClick={() => nav(`/projetos/${criado!.id}`)}>Abrir projeto</Button><Button variant="primary" onClick={() => nav(`/projetos/${criado!.id}?aba=etapas&novaEtapa=1`)}><PlusIcon className="h-4 w-4" />Adicionar primeira etapa</Button></>}>
        <p className="text-sm text-slate-600">O projeto foi cadastrado com o código</p>
        <p className="my-2 font-mono text-3xl font-bold text-brand-800">{criado?.codigo}</p>
        <p className="text-sm text-slate-500">A primeira etapa será sugerida como <b className="font-mono">{criado?.codigo} A</b>.</p>
      </Modal>
    </>
  );
}
void Link; void fmtDataHora;
