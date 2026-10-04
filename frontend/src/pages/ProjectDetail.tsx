import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Copy, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { del, get, patch, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useStatus, useTiposMov } from '../lib/queries';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, Opts, PageHeader, Pagination, PrazoBadge, Progress, Select, StatusBadge, Table, Tabs, Td, Th, useToast, cx } from '../components/ui';
import { ProjectFormModal } from '../components/ProjectForm';
import { ActivityFormModal, MovementFormModal, StageFormModal } from '../components/forms';
import { DocumentosPanel } from '../components/Documents';
import { OcorrenciasPanel } from '../components/Occurrences';
import { AuditTable, MovementTimeline } from '../components/lists';
import { SITUACAO, fmtData, fmtDataHora, hojeISO } from '../lib/format';

function StatusSelect({ value, onChange, disabled }: { value: number; onChange: (id: number) => void; disabled?: boolean }) {
  const status = useStatus();
  return <Select className="!h-7 !w-36 !py-0 text-xs" disabled={disabled} value={value} onChange={(e) => onChange(Number(e.target.value))}>{status.data?.map((s: any) => <option key={s.id} value={s.id}>{s.nome}</option>)}</Select>;
}

// ───────────── Aba Etapas ─────────────
function EtapasTab({ projeto }: { projeto: any }) {
  const { can } = useAuth(); const qc = useQueryClient(); const toast = useToast(); const [sp, setSp] = useSearchParams();
  const { data: etapas, isLoading } = useQuery({ queryKey: ['etapas-proj', projeto.id], queryFn: () => get(`/projects/${projeto.id}/stages`) });
  const [aberta, setAberta] = useState<number | null>(null);
  const [stageModal, setStageModal] = useState<{ etapa?: any } | null>(sp.get('novaEtapa') ? {} : null);
  const [actModal, setActModal] = useState<{ etapa: any; atividade?: any } | null>(null);
  const [movModal, setMovModal] = useState<{ etapaId: number; atividadeId?: number } | null>(null);
  useEffect(() => { if (sp.get('novaEtapa')) setSp((p) => { p.delete('novaEtapa'); return p; }, { replace: true }); }, []);
  const upd = useMutation({ mutationFn: (v: { url: string; body: any }) => patch(v.url, v.body), onSuccess: () => { qc.invalidateQueries(); toast('Status atualizado.'); }, onError: (e: any) => toast(e.message, 'err') });
  if (isLoading) return <Loading />;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><p className="text-sm text-slate-500">{etapas?.length ?? 0} etapa(s). Clique em uma linha para ver e gerenciar as atividades.</p>
        {can('stages.create') && <Button variant="primary" onClick={() => setStageModal({})}><Plus className="h-4 w-4" />Nova etapa</Button>}</div>
      {!etapas?.length ? <Empty>Este projeto ainda não possui etapas.</Empty> : (
        <Card>
          <Table>
            <thead><tr><Th className="w-6" /><Th>Código</Th><Th>Etapa</Th><Th>Responsável</Th><Th>Scrum Master</Th><Th>Equipe</Th><Th>Início</Th><Th>Entrega</Th><Th>Status</Th><Th>Execução</Th></tr></thead>
            <tbody>
              {etapas.map((e: any) => (
                <Fragment key={e.id}>
                  <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setAberta(aberta === e.id ? null : e.id)}>
                    <Td>{aberta === e.id ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}</Td>
                    <Td><span className="font-mono text-[13px] font-semibold text-brand-800">{e.codigo}</span></Td>
                    <Td className="max-w-[320px]"><div className="truncate font-medium">{e.nome}</div><div className="text-xs text-slate-400">{e.atividadesConcluidas}/{e.totalAtividades} atividades</div></Td>
                    <Td>{e.responsavel?.nome ?? '—'}</Td><Td>{e.scrumMaster?.nome ?? '—'}</Td><Td className="max-w-[10rem] truncate" title={(e.membros ?? []).map((m: any) => m.nome).join(', ')}>{(e.membros ?? []).map((m: any) => m.nome).join(', ') || '—'}</Td><Td>{fmtData(e.dataInicio)}</Td>
                    <Td><div>{fmtData(e.dataPrevista)}</div><PrazoBadge prazo={e.prazo} /></Td>
                    <Td onClick={(ev) => ev.stopPropagation()}>{can('stages.update') ? <StatusSelect value={e.status.id} onChange={(id) => upd.mutate({ url: `/stages/${e.id}`, body: { statusId: id } })} /> : <StatusBadge status={e.status} />}</Td>
                    <Td><Progress value={e.percentualExecucao} /></Td>
                  </tr>
                  {aberta === e.id && (
                    <tr><td colSpan={10} className="border-b border-slate-100 bg-slate-50/70 px-4 py-4">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Atividades da etapa {e.codigo}</div>
                        <div className="flex gap-2">
                          {can('movements.create') && <Button size="sm" onClick={() => setMovModal({ etapaId: e.id })}>Movimentação</Button>}
                          {can('stages.update') && <Button size="sm" onClick={() => setStageModal({ etapa: e })}><Pencil className="h-3.5 w-3.5" />Editar etapa</Button>}
                          {can('activities.create') && <Button size="sm" variant="primary" onClick={() => setActModal({ etapa: e })}><Plus className="h-3.5 w-3.5" />Nova atividade</Button>}
                        </div>
                      </div>
                      <Atividades etapa={e} onEdit={(a) => setActModal({ etapa: e, atividade: a })} onMov={(a) => setMovModal({ etapaId: e.id, atividadeId: a.id })} upd={upd} />
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <StageFormModal open={!!stageModal} onClose={() => setStageModal(null)} projetoId={projeto.id} etapa={stageModal?.etapa} />
      {actModal && <ActivityFormModal open onClose={() => setActModal(null)} etapa={actModal.etapa} atividade={actModal.atividade} />}
      {movModal && <MovementFormModal open onClose={() => setMovModal(null)} projetoId={projeto.id} projetoCodigo={projeto.codigo} etapaId={movModal.etapaId} atividadeId={movModal.atividadeId} />}
    </div>
  );
}

function Atividades({ etapa, onEdit, onMov, upd }: { etapa: any; onEdit: (a: any) => void; onMov: (a: any) => void; upd: any }) {
  const { can } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['atv-etapa', etapa.id], queryFn: () => get(`/stages/${etapa.id}/activities`) });
  if (isLoading) return <Loading />;
  if (!data?.length) return <p className="py-3 text-sm text-slate-400">Nenhuma atividade cadastrada nesta etapa.</p>;
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <Table>
        <thead><tr><Th>Atividade</Th><Th>Responsável</Th><Th>Entrega</Th><Th>Status</Th><Th /></tr></thead>
        <tbody>{data.map((a: any) => (
          <tr key={a.id}>
            <Td className="max-w-[360px]"><div className="truncate font-medium">{a.nome}</div></Td><Td>{a.responsavel?.nome ?? '—'}</Td>
            <Td><div>{fmtData(a.dataPrevista)}</div><PrazoBadge prazo={a.prazo} /></Td>
            <Td>{can('activities.update') ? <StatusSelect value={a.status.id} onChange={(id) => upd.mutate({ url: `/activities/${a.id}`, body: { statusId: id } })} /> : <StatusBadge status={a.status} />}</Td>
            <Td className="whitespace-nowrap text-right">
              {can('movements.create') && <Button size="sm" variant="ghost" onClick={() => onMov(a)}>Movimentar</Button>}
              {can('activities.update') && <Button size="sm" variant="ghost" onClick={() => onEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>}
            </Td>
          </tr>))}</tbody>
      </Table>
    </div>
  );
}

// ───────────── Aba Atividades (todas do projeto) ─────────────
function AtividadesTab({ projeto }: { projeto: any }) {
  const { data, isLoading } = useQuery({ queryKey: ['atv-proj', projeto.id], queryFn: () => get(`/activities?projetoId=${projeto.id}&pageSize=200`) });
  if (isLoading) return <Loading />;
  if (!data?.itens.length) return <Empty>Nenhuma atividade cadastrada neste projeto.</Empty>;
  return (
    <Card><Table>
      <thead><tr><Th>Etapa</Th><Th>Atividade</Th><Th>Responsável</Th><Th>Início</Th><Th>Entrega</Th><Th>Status</Th></tr></thead>
      <tbody>{data.itens.map((a: any) => (
        <tr key={a.id}><Td className="font-mono text-[13px] font-semibold text-brand-800">{a.etapa.codigo}</Td><Td className="font-medium">{a.nome}</Td><Td>{a.responsavel?.nome ?? '—'}</Td><Td>{fmtData(a.dataInicio)}</Td>
          <Td><div>{fmtData(a.dataPrevista)}</div><PrazoBadge prazo={a.prazo} /></Td><Td><StatusBadge status={a.status} /></Td></tr>))}</tbody>
    </Table></Card>
  );
}

// ───────────── Aba Movimentações ─────────────
function MovimentacoesTab({ projeto }: { projeto: any }) {
  const { can } = useAuth(); const tipos = useTiposMov();
  const [f, setF] = useState<any>({ de: '', ate: '', usuarioId: '', etapaId: '', tipoId: '' }); const [page, setPage] = useState(1); const [eventos, setEventos] = useState(false); const [novo, setNovo] = useState(false);
  const set = (k: string, v: string) => { setF((s: any) => ({ ...s, [k]: v })); setPage(1); };
  const etapas = useQuery({ queryKey: ['etapas-proj', projeto.id], queryFn: () => get(`/projects/${projeto.id}/stages`) });
  const usuarios = useQuery({ queryKey: ['mov-usuarios'], queryFn: () => get('/movements/usuarios') });
  const q = qs({ projetoId: projeto.id, ...f, page, pageSize: 20 });
  const movs = useQuery({ queryKey: ['movs', q], queryFn: () => get(`/movements${q}`), enabled: !eventos, placeholderData: (p) => p });
  const tl = useQuery({ queryKey: ['timeline', projeto.id], queryFn: () => get(`/projects/${projeto.id}/timeline`), enabled: eventos });
  const itensTl = useMemo(() => {
    if (!tl.data) return [];
    const et = etapas.data?.find((e: any) => String(e.id) === f.etapaId)?.letra;
    return tl.data.itens.filter((i: any) => {
      const dia = new Date(i.dataHora).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      if (f.de && dia < f.de) return false; if (f.ate && dia > f.ate) return false;
      if (i.origem === 'EVENTO') return !f.usuarioId && !f.etapaId && !f.tipoId;
      if (f.usuarioId && i.usuario !== usuarios.data?.find((u: any) => String(u.id) === f.usuarioId)?.nome) return false;
      if (f.etapaId && i.etapa !== et) return false;
      if (f.tipoId && i.tipo !== tipos.data?.find((t: any) => String(t.id) === f.tipoId)?.nome) return false;
      return true;
    });
  }, [tl.data, f, etapas.data, usuarios.data, tipos.data]);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="De"><Input type="date" className="!w-36" value={f.de} onChange={(e) => set('de', e.target.value)} /></Field>
        <Field label="Até"><Input type="date" className="!w-36" value={f.ate} onChange={(e) => set('ate', e.target.value)} /></Field>
        <Field label="Usuário"><Select className="!w-40" value={f.usuarioId} onChange={(e) => set('usuarioId', e.target.value)}><Opts items={usuarios.data} empty="Todos" /></Select></Field>
        <Field label="Etapa"><Select className="!w-44" value={f.etapaId} onChange={(e) => set('etapaId', e.target.value)}><option value="">Todas</option>{etapas.data?.map((e: any) => <option key={e.id} value={e.id}>{e.letra} — {e.nome}</option>)}</Select></Field>
        <Field label="Tipo"><Select className="!w-40" value={f.tipoId} onChange={(e) => set('tipoId', e.target.value)}><Opts items={tipos.data} empty="Todos" /></Select></Field>
        <Button variant="ghost" onClick={() => { setF({ de: '', ate: '', usuarioId: '', etapaId: '', tipoId: '' }); setPage(1); }}>Limpar</Button>
        <label className="ml-2 flex items-center gap-1.5 pb-2 text-xs text-slate-500"><input type="checkbox" checked={eventos} onChange={(e) => setEventos(e.target.checked)} />Incluir eventos do sistema</label>
        {can('movements.create') && <Button variant="primary" className="ml-auto" onClick={() => setNovo(true)}><Plus className="h-4 w-4" />Nova movimentação</Button>}
      </div>
      <Card className="p-5">
        {eventos ? (tl.isLoading ? <Loading /> : <MovementTimeline itens={itensTl} />) : (movs.isLoading ? <Loading /> : (<><MovementTimeline itens={movs.data?.itens ?? []} />{movs.data && movs.data.total > movs.data.pageSize && <div className="-mx-5 -mb-5 mt-5"><Pagination page={movs.data.page} pageSize={movs.data.pageSize} total={movs.data.total} onPage={setPage} /></div>}</>))}
      </Card>
      <MovementFormModal open={novo} onClose={() => setNovo(false)} projetoId={projeto.id} projetoCodigo={projeto.codigo} />
    </div>
  );
}

// ───────────── Aba Prazos (cronograma) ─────────────
function PrazosTab({ projeto }: { projeto: any }) {
  const { data: etapas } = useQuery({ queryKey: ['etapas-proj', projeto.id], queryFn: () => get(`/projects/${projeto.id}/stages`) });
  const datas = [projeto.dataInicio, projeto.dataPrevista, ...(etapas ?? []).flatMap((e: any) => [e.dataInicio, e.dataPrevista])].filter(Boolean).sort();
  const min = datas[0], max = datas[datas.length - 1];
  const span = min && max && min !== max ? (Date.parse(max) - Date.parse(min)) / 86400000 : 1;
  const pos = (d: string) => Math.max(0, Math.min(100, ((Date.parse(d) - Date.parse(min)) / 86400000 / span) * 100));
  const hoje = hojeISO(); const p = projeto.prazo;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[['Situação do prazo', <PrazoBadge key="s" prazo={p} />], ['Dias restantes', p.diasRestantes ?? '—'], ['Dias em atraso', p.diasAtraso ?? '—'], ['Prazo consumido', p.percentualPrazoConsumido != null ? `${p.percentualPrazoConsumido}%` : '—']].map(([l, v]: any) => (
          <Card key={l} className="p-4"><div className="text-xs text-slate-500">{l}</div><div className="mt-1 text-xl font-semibold text-slate-800">{v}</div></Card>))}
      </div>
      <Card className="p-5">
        <div className="mb-1 flex justify-between text-xs text-slate-400"><span>{fmtData(min)}</span><span>Cronograma das etapas</span><span>{fmtData(max)}</span></div>
        {!min ? <Empty>Defina datas de início e entrega para visualizar o cronograma.</Empty> : (
          <div className="relative space-y-2 pt-2">
            {hoje >= min && hoje <= max && <div className="absolute bottom-0 top-0 z-10 border-l border-dashed border-red-400" style={{ left: `calc(11rem + (100% - 11rem) * ${pos(hoje) / 100})` }} title="Hoje"><span className="absolute -top-1 -translate-x-1/2 rounded bg-red-500 px-1 text-[10px] text-white">hoje</span></div>}
            {[{ id: 0, codigo: projeto.codigo, nome: 'Projeto', dataInicio: projeto.dataInicio, dataPrevista: projeto.dataPrevista, status: projeto.status, percentualExecucao: projeto.percentualExecucao, prazo: projeto.prazo }, ...(etapas ?? [])].map((e: any) => (
              <div key={e.id} className="flex items-center gap-3">
                <div className="w-40 shrink-0 truncate text-xs" title={e.nome}><span className="font-mono font-semibold text-brand-800">{e.codigo}</span> <span className="text-slate-500">{e.id ? e.nome : ''}</span></div>
                <div className="relative h-5 flex-1 rounded bg-slate-100">
                  {e.dataInicio && e.dataPrevista ? (
                    <div className={cx('absolute top-0 h-5 overflow-hidden rounded', e.prazo.situacao === 'VENCIDO' ? 'bg-red-200' : 'bg-brand-200')} style={{ left: `${pos(e.dataInicio)}%`, width: `${Math.max(1.5, pos(e.dataPrevista) - pos(e.dataInicio))}%` }} title={`${fmtData(e.dataInicio)} → ${fmtData(e.dataPrevista)} · ${e.percentualExecucao}%`}>
                      <div className={cx('h-full', e.prazo.situacao === 'VENCIDO' ? 'bg-red-500' : 'bg-brand-500')} style={{ width: `${e.percentualExecucao}%` }} />
                    </div>
                  ) : <span className="absolute inset-0 flex items-center pl-2 text-[11px] text-slate-400">sem datas definidas</span>}
                </div>
              </div>))}
          </div>)}
      </Card>
    </div>
  );
}

// ───────────── Página ─────────────
export default function ProjectDetail() {
  const { id } = useParams(); const { can } = useAuth(); const qc = useQueryClient(); const toast = useToast();
  const [sp, setSp] = useSearchParams(); const aba = sp.get('aba') ?? 'resumo';
  const setAba = (a: string) => setSp((p) => { p.set('aba', a); return p; }, { replace: true });
  const [edit, setEdit] = useState(false); const [inativar, setInativar] = useState(false); const [novaMov, setNovaMov] = useState(false); const [pgAudit, setPgAudit] = useState(1);
  const { data: p, isLoading, error } = useQuery({ queryKey: ['projeto', Number(id)], queryFn: () => get(`/projects/${id}`) });
  const toggle = useMutation({
    mutationFn: () => (p.ativo ? del(`/projects/${id}`) : patch(`/projects/${id}`, { ativo: true })),
    onSuccess: () => { qc.invalidateQueries(); setInativar(false); toast(p.ativo ? 'Projeto inativado.' : 'Projeto reativado.'); },
  });
  if (isLoading) return <Loading />;
  if (error || !p) return <ErrorBox error={error ?? new Error('Projeto não encontrado.')} />;
  const tabs = [{ id: 'resumo', label: 'Resumo' }, { id: 'etapas', label: 'Etapas', count: p.totais.etapas }, { id: 'atividades', label: 'Atividades', count: p.totais.atividades }, { id: 'movimentacoes', label: 'Movimentações' }, { id: 'documentos', label: 'Documentos' }, { id: 'ocorrencias', label: 'Ocorrências' }, { id: 'prazos', label: 'Prazos' },
    ...(can('audit.project_history') || can('audit.view') ? [{ id: 'historico', label: 'Histórico' }] : [])];
  const info = (l: string, v: any) => <div><div className="text-xs text-slate-500">{l}</div><div className="mt-0.5 text-sm font-medium text-slate-800">{v || '—'}</div></div>;
  return (
    <>
      <PageHeader crumbs={<><Link to="/projetos" className="hover:underline">Projetos</Link> / {p.frente.nome} / {p.codigo}</>}
        title={<span className="flex flex-wrap items-center gap-3"><span className="font-mono text-brand-800">{p.codigo}</span><span className="uppercase">{p.nome}</span>{!p.ativo && <Badge color="#64748b">Inativo</Badge>}</span>}
        actions={<>
          {can('movements.create') && p.ativo && <Button onClick={() => setNovaMov(true)}><Plus className="h-4 w-4" />Movimentação</Button>}
          {can('projects.update') && <Button onClick={() => setEdit(true)}><Pencil className="h-4 w-4" />Editar</Button>}
          {can('projects.delete') && <Button variant="danger" onClick={() => (p.ativo ? setInativar(true) : toggle.mutate())}>{p.ativo ? <><Trash2 className="h-4 w-4" />Excluir</> : <><Undo2 className="h-4 w-4" />Reativar</>}</Button>}
        </>} />
      <Card className="mb-5 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div><div className="text-xs text-slate-500">Status</div><div className="mt-1"><StatusBadge status={p.status} /></div></div>
        <div><div className="text-xs text-slate-500">Execução</div><div className="mt-1"><Progress value={p.percentualExecucao} /></div></div>
        {info('Dono', p.dono?.nome)}{info('Scrum Master (etapas)', p.scrumNomes?.length ? p.scrumNomes.join(', ') : null)}{info('Equipe (etapas)', p.equipeNomes?.length ? p.equipeNomes.join(', ') : null)}
      </Card>

      <Tabs tabs={tabs} active={aba} onChange={setAba} />
      <div className="mt-5">
        {aba === 'resumo' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
                {info('Frente', p.frente.nome)}{info('Confidencialidade', p.confidencialidade.nome)}
                {info('Início (1ª etapa)', fmtData(p.dataInicio))}{info('Previsão (última etapa)', fmtData(p.dataPrevista))}
                {info('Data real de conclusão', fmtData(p.dataConclusaoReal))}{info('Última movimentação', p.ultimaMovimentacaoEm ? fmtDataHora(p.ultimaMovimentacaoEm) : 'Nenhuma')}{info('Criado em', fmtData(p.createdAt))}
              </div>
              {p.descricao && <div className="mt-5"><div className="text-xs text-slate-500">Descrição</div><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{p.descricao}</p></div>}
              {p.observacoes && <div className="mt-4"><div className="text-xs text-slate-500">Observações</div><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{p.observacoes}</p></div>}
              {p.equipeNomes?.length > 0 && <div className="mt-4"><div className="text-xs text-slate-500">Equipe (consolidada das etapas)</div><div className="mt-1 flex flex-wrap gap-1.5">{p.equipeNomes.map((n: string) => <Badge key={n} color="#475569">{n}</Badge>)}</div></div>}
              {p.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{p.tags.map((t: string) => <span key={t} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">#{t}</span>)}</div>}
              {p.pastaCaminho && (
                <div className="mt-5 rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Pasta de arquivos (referência de rede)</div>
                  <div className="mt-1 flex items-center gap-2"><code className="flex-1 break-all text-xs text-slate-700">{p.pastaCaminho}</code>
                    <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(p.pastaCaminho); toast('Caminho copiado.'); }}><Copy className="h-3.5 w-3.5" />Copiar</Button></div></div>)}
            </Card>
            <div className="space-y-4">
              <Card className="p-5"><div className="text-xs text-slate-500">Prazo</div><div className="mt-1.5"><PrazoBadge prazo={p.prazo} /></div>
                <div className="mt-3 text-sm text-slate-600">{fmtData(p.dataInicio)} → {fmtData(p.dataPrevista)}</div>
                {p.prazo.percentualPrazoConsumido != null && <div className="mt-2 text-xs text-slate-400">{p.prazo.percentualPrazoConsumido}% do prazo consumido · {p.percentualExecucao}% executado</div>}</Card>
              <Card className="p-5"><div className="text-xs text-slate-500">Estrutura</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center"><div><div className="text-xl font-semibold">{p.totais.etapas}</div><div className="text-[11px] text-slate-500">etapas</div></div><div><div className="text-xl font-semibold">{p.totais.etapasConcluidas}</div><div className="text-[11px] text-slate-500">concluídas</div></div><div><div className="text-xl font-semibold">{p.totais.atividades}</div><div className="text-[11px] text-slate-500">atividades</div></div></div></Card>
              <Card className="p-5"><div className="text-xs text-slate-500">Atividade sem movimentação</div>
                <div className={cx('mt-1.5 text-sm font-medium', p.semMovimentacao.alerta ? 'text-amber-600' : 'text-slate-700')}>{p.ultimaMovimentacaoEm ? `há ${p.semMovimentacao.dias} dia(s)` : 'nenhuma movimentação registrada'}</div>
                {p.ultimaAlteracao && <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">Última alteração: <b className="text-slate-700">{p.ultimaAlteracao.usuario}</b><br />{fmtDataHora(p.ultimaAlteracao.dataHora)}<br />{(can('audit.project_history') || can('audit.view')) && <button className="mt-1 text-brand-700 hover:underline" onClick={() => setAba('historico')}>Ver histórico de alterações</button>}</div>}
              </Card>
            </div>
          </div>
        )}
        {aba === 'etapas' && <EtapasTab projeto={p} />}
        {aba === 'atividades' && <AtividadesTab projeto={p} />}
        {aba === 'movimentacoes' && <MovimentacoesTab projeto={p} />}
        {aba === 'documentos' && <DocumentosPanel projeto={p} />}
        {aba === 'ocorrencias' && <OcorrenciasPanel projeto={p} />}
        {aba === 'prazos' && <PrazosTab projeto={p} />}
        {aba === 'historico' && <Card><AuditTable url={`/projects/${p.id}/audit`} page={pgAudit} onPage={setPgAudit} semProjeto /></Card>}
      </div>

      <ProjectFormModal open={edit} onClose={() => setEdit(false)} projeto={p} onVerHistorico={() => setAba('historico')} />
      <MovementFormModal open={novaMov} onClose={() => setNovaMov(false)} projetoId={p.id} projetoCodigo={p.codigo} />
      <Modal open={inativar} onClose={() => setInativar(false)} size="sm" title="Excluir projeto?" footer={<><Button onClick={() => setInativar(false)}>Cancelar</Button><Button variant="danger" loading={toggle.isPending} onClick={() => toggle.mutate()}>Excluir</Button></>}>
        <p className="text-sm text-slate-600">O projeto <b>{p.codigo}</b> deixará de aparecer nas listas e indicadores, mas todo o histórico (etapas, movimentações e auditoria) é preservado e ele pode ser reativado por um administrador. O código não será reutilizado.</p>
      </Modal>
    </>
  );
}
void SITUACAO;
