import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, qs } from '../lib/api';
import { usePessoas, useFrentes, useStatus, useTiposMov } from '../lib/queries';
import { Button, Card, Empty, Input, Loading, Opts, PageHeader, Pagination, PrazoBadge, Progress, Select, StatusBadge, Table, Td, Th } from '../components/ui';
import { MovementTimeline } from '../components/lists';
import { SITUACAO, fmtData } from '../lib/format';

function useFiltros(init: Record<string, string>) {
  const [f, setF] = useState<Record<string, string>>(init); const [page, setPage] = useState(1);
  return { f, page, setPage, set: (k: string, v: string) => { setF((s) => ({ ...s, [k]: v })); setPage(1); }, clear: () => { setF(init); setPage(1); } };
}

// ───────────── Etapas ─────────────
export function EtapasPage() {
  const nav = useNavigate(); const { f, page, setPage, set, clear } = useFiltros({ busca: '', frenteId: '', statusId: '', responsavelId: '', situacaoPrazo: '' });
  const frentes = useFrentes(), status = useStatus(), colabs = usePessoas();
  const q = qs({ ...f, page, pageSize: 25 });
  const { data, isLoading } = useQuery({ queryKey: ['etapas', q], queryFn: () => get(`/stages${q}`), placeholderData: (p) => p });
  return (
    <>
      <PageHeader title="Etapas" subtitle="Todas as etapas dos projetos ativos" />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <Input className="!w-60" placeholder="Buscar etapa, atividade, código…" value={f.busca} onChange={(e) => set('busca', e.target.value)} />
          <Select className="!w-40" value={f.frenteId} onChange={(e) => set('frenteId', e.target.value)}><Opts items={frentes.data} empty="Todas as frentes" /></Select>
          <Select className="!w-40" value={f.statusId} onChange={(e) => set('statusId', e.target.value)}><Opts items={status.data} empty="Todos os status" /></Select>
          <Select className="!w-40" value={f.responsavelId} onChange={(e) => set('responsavelId', e.target.value)}><Opts items={colabs.data} empty="Participante" /></Select>
          <Select className="!w-40" value={f.situacaoPrazo} onChange={(e) => set('situacaoPrazo', e.target.value)}><option value="">Situação do prazo</option>{Object.entries(SITUACAO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
          <Button variant="ghost" onClick={clear}>Limpar</Button>
        </div>
        {isLoading ? <Loading /> : !data?.itens.length ? <Empty>Nenhuma etapa encontrada.</Empty> : (<>
          <Table><thead><tr><Th>Código</Th><Th>Etapa</Th><Th>Projeto</Th><Th>Atividades</Th><Th>Responsável</Th><Th>Scrum Master</Th><Th>Início</Th><Th>Entrega</Th><Th>Status</Th><Th>Execução</Th></tr></thead>
            <tbody>{data.itens.map((e: any) => (
              <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/projetos/${e.projetoId}?aba=etapas`)}>
                <Td className="font-mono text-[13px] font-semibold text-brand-800">{e.codigo}</Td><Td className="max-w-[280px] truncate font-medium" title={e.nome}>{e.nome}</Td>
                <Td className="max-w-[240px] truncate text-slate-500" title={e.projetoNome}>{e.projetoNome}</Td><Td className="text-slate-600">{e.atividadesConcluidas}/{e.totalAtividades}</Td>
                <Td>{e.responsavel?.nome ?? '—'}</Td><Td>{e.scrumMaster?.nome ?? '—'}</Td><Td>{fmtData(e.dataInicio)}</Td><Td><div>{fmtData(e.dataPrevista)}</div><PrazoBadge prazo={e.prazo} /></Td>
                <Td><StatusBadge status={e.status} /></Td><Td><Progress value={e.percentualExecucao} /></Td></tr>))}</tbody></Table>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></>)}
      </Card>
    </>
  );
}

// ───────────── Atividades ─────────────
export function AtividadesPage() {
  const nav = useNavigate(); const { f, page, setPage, set, clear } = useFiltros({ busca: '', statusId: '', responsavelId: '', situacaoPrazo: '' });
  const status = useStatus(), colabs = usePessoas();
  const q = qs({ ...f, page, pageSize: 25 });
  const { data, isLoading } = useQuery({ queryKey: ['atividades', q], queryFn: () => get(`/activities${q}`), placeholderData: (p) => p });
  return (
    <>
      <PageHeader title="Atividades" subtitle="Todas as atividades dos projetos ativos" />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <Input className="!w-60" placeholder="Buscar atividade, etapa, projeto…" value={f.busca} onChange={(e) => set('busca', e.target.value)} />
          <Select className="!w-40" value={f.statusId} onChange={(e) => set('statusId', e.target.value)}><Opts items={status.data} empty="Todos os status" /></Select>
          <Select className="!w-40" value={f.responsavelId} onChange={(e) => set('responsavelId', e.target.value)}><Opts items={colabs.data} empty="Responsável" /></Select>
          <Select className="!w-40" value={f.situacaoPrazo} onChange={(e) => set('situacaoPrazo', e.target.value)}><option value="">Situação do prazo</option>{Object.entries(SITUACAO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
          <Button variant="ghost" onClick={clear}>Limpar</Button>
        </div>
        {isLoading ? <Loading /> : !data?.itens.length ? <Empty>Nenhuma atividade encontrada.</Empty> : (<>
          <Table><thead><tr><Th>Etapa</Th><Th>Atividade</Th><Th>Projeto</Th><Th>Responsável</Th><Th>Entrega</Th><Th>Status</Th></tr></thead>
            <tbody>{data.itens.map((a: any) => (
              <tr key={a.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/projetos/${a.projeto.id}?aba=etapas`)}>
                <Td className="font-mono text-[13px] font-semibold text-brand-800">{a.etapa.codigo}</Td><Td className="max-w-[320px] truncate font-medium" title={a.nome}>{a.nome}</Td>
                <Td className="max-w-[240px] truncate text-slate-500">{a.projeto.nome}</Td><Td>{a.responsavel?.nome ?? '—'}</Td>
                <Td><div>{fmtData(a.dataPrevista)}</div><PrazoBadge prazo={a.prazo} /></Td><Td><StatusBadge status={a.status} /></Td></tr>))}</tbody></Table>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></>)}
      </Card>
    </>
  );
}

// ───────────── Movimentações ─────────────
export function MovimentacoesPage() {
  const { f, page, setPage, set, clear } = useFiltros({ busca: '', de: '', ate: '', usuarioId: '', tipoId: '' });
  const tipos = useTiposMov(); const usuarios = useQuery({ queryKey: ['mov-usuarios'], queryFn: () => get('/movements/usuarios') });
  const q = qs({ ...f, page, pageSize: 30 });
  const { data, isLoading } = useQuery({ queryKey: ['movs-global', q], queryFn: () => get(`/movements${q}`), placeholderData: (p) => p });
  return (
    <>
      <PageHeader title="Movimentações" subtitle="Histórico de acompanhamento de todos os projetos — registros imutáveis" />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <Input className="!w-60" placeholder="Buscar no texto ou projeto…" value={f.busca} onChange={(e) => set('busca', e.target.value)} />
          <Input type="date" className="!w-36" value={f.de} onChange={(e) => set('de', e.target.value)} aria-label="De" /><span className="text-xs text-slate-400">até</span>
          <Input type="date" className="!w-36" value={f.ate} onChange={(e) => set('ate', e.target.value)} aria-label="Até" />
          <Select className="!w-40" value={f.usuarioId} onChange={(e) => set('usuarioId', e.target.value)}><Opts items={usuarios.data} empty="Todos os usuários" /></Select>
          <Select className="!w-40" value={f.tipoId} onChange={(e) => set('tipoId', e.target.value)}><Opts items={tipos.data} empty="Todos os tipos" /></Select>
          <Button variant="ghost" onClick={clear}>Limpar</Button>
        </div>
        <div className="p-5">{isLoading ? <Loading /> : <MovementTimeline itens={data?.itens ?? []} mostrarProjeto />}</div>
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </Card>
    </>
  );
}

export function Placeholder({ title, fase, children }: { title: string; fase: number; children?: React.ReactNode }) {
  return (
    <>
      <PageHeader title={title} />
      <Card className="p-10 text-center"><div className="mx-auto max-w-md"><div className="text-sm font-semibold text-slate-800">Disponível na Fase {fase}</div><p className="mt-1 text-sm text-slate-500">{children}</p><Link to="/projetos" className="mt-4 inline-block text-sm text-brand-700 hover:underline">Ir para Projetos</Link></div></Card>
    </>
  );
}
