import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Paperclip, Pencil, Plus } from 'lucide-react';
import { get, patch, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtData, hojeISO } from '../lib/format';
import { usePessoas, useTiposOcorrencia } from '../lib/queries';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, Opts, Pagination, Select, Table, Td, Textarea, Th, useToast } from './ui';
import { DocumentosPanel } from './Documents';

export const SEVERIDADE: Record<string, { label: string; cor: string }> = {
  BAIXA: { label: 'Baixa', cor: '#64748b' }, MEDIA: { label: 'Média', cor: '#d97706' }, ALTA: { label: 'Alta', cor: '#ea580c' }, CRITICA: { label: 'Crítica', cor: '#dc2626' },
};
export const STATUS_OC: Record<string, { label: string; cor: string }> = {
  ABERTA: { label: 'Aberta', cor: '#dc2626' }, EM_TRATAMENTO: { label: 'Em tratamento', cor: '#2563eb' }, RESOLVIDA: { label: 'Resolvida', cor: '#059669' }, CANCELADA: { label: 'Cancelada', cor: '#94a3b8' },
};
export const SevBadge = ({ s }: { s: string }) => <Badge color={SEVERIDADE[s]?.cor}>{SEVERIDADE[s]?.label ?? s}</Badge>;
export const StatusOcBadge = ({ s }: { s: string }) => <Badge color={STATUS_OC[s]?.cor}>{STATUS_OC[s]?.label ?? s}</Badge>;

function useInv() { const qc = useQueryClient(); return () => { qc.invalidateQueries({ queryKey: ['ocorrencias'] }); qc.invalidateQueries({ queryKey: ['timeline'] }); }; }

export function OcorrenciaModal({ open, onClose, projetoId, ocorrencia }: { open: boolean; onClose: () => void; projetoId: number; ocorrencia?: any }) {
  const toast = useToast(); const inv = useInv(); const tipos = useTiposOcorrencia(); const pessoas = usePessoas();
  const ini = () => ({
    titulo: ocorrencia?.titulo ?? '', descricao: ocorrencia?.descricao ?? '', severidade: ocorrencia?.severidade ?? 'MEDIA', status: ocorrencia?.status ?? 'ABERTA',
    etapaId: ocorrencia?.etapa?.id ?? '', atividadeId: ocorrencia?.atividade?.id ?? '', tipoId: ocorrencia?.tipo?.id ?? '', responsavelId: ocorrencia?.responsavel?.id ?? '',
    prazoResolucao: ocorrencia?.prazoResolucao ?? '', dataResolucao: ocorrencia?.dataResolucao ?? '', solucao: ocorrencia?.solucao ?? '',
  });
  const [f, setF] = useState<any>(ini);
  const set = (k: string, v: string) => setF((s: any) => ({ ...s, [k]: v, ...(k === 'etapaId' ? { atividadeId: '' } : {}) }));
  const etapas = useQuery({ queryKey: ['etapas-proj', projetoId], queryFn: () => get(`/projects/${projetoId}/stages`), enabled: open });
  const atvs = useQuery({ queryKey: ['atv-etapa', Number(f.etapaId)], queryFn: () => get(`/stages/${f.etapaId}/activities`), enabled: open && !!f.etapaId });
  const m = useMutation({
    mutationFn: () => (ocorrencia ? patch(`/occurrences/${ocorrencia.id}`, f) : post('/occurrences', { projetoId, ...f, status: undefined, dataResolucao: undefined, solucao: undefined })),
    onSuccess: () => { inv(); toast(ocorrencia ? 'Ocorrência atualizada.' : 'Ocorrência registrada.'); onClose(); },
  });
  const resolvida = f.status === 'RESOLVIDA';
  return (
    <Modal open={open} onClose={onClose} size="lg" title={ocorrencia ? 'Editar ocorrência' : 'Nova ocorrência'} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={m.isPending} disabled={f.titulo.trim().length < 3} onClick={() => m.mutate()}>Salvar</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Título" required className="sm:col-span-2"><Input value={f.titulo} onChange={(e) => set('titulo', e.target.value)} /></Field>
        <Field label="Descrição" className="sm:col-span-2"><Textarea value={f.descricao} onChange={(e) => set('descricao', e.target.value)} /></Field>
        <Field label="Severidade"><Select value={f.severidade} onChange={(e) => set('severidade', e.target.value)}>{Object.entries(SEVERIDADE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        {ocorrencia ? <Field label="Status"><Select value={f.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(STATUS_OC).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field> : <Field label="Tipo"><Select value={f.tipoId} onChange={(e) => set('tipoId', e.target.value)}><Opts items={tipos.data} /></Select></Field>}
        {ocorrencia && <Field label="Tipo"><Select value={f.tipoId} onChange={(e) => set('tipoId', e.target.value)}><Opts items={tipos.data} /></Select></Field>}
        <Field label="Responsável"><Select value={f.responsavelId} onChange={(e) => set('responsavelId', e.target.value)}><Opts items={pessoas.data} /></Select></Field>
        <Field label="Etapa"><Select value={f.etapaId} onChange={(e) => set('etapaId', e.target.value)}><option value="">Projeto inteiro</option>{etapas.data?.map((e: any) => <option key={e.id} value={e.id}>{e.letra} — {e.nome}</option>)}</Select></Field>
        <Field label="Atividade"><Select value={f.atividadeId} disabled={!f.etapaId} onChange={(e) => set('atividadeId', e.target.value)}><Opts items={atvs.data} /></Select></Field>
        <Field label="Prazo para resolução"><Input type="date" value={f.prazoResolucao ?? ''} onChange={(e) => set('prazoResolucao', e.target.value)} /></Field>
        {ocorrencia && resolvida && <Field label="Data de resolução" hint="Se vazia, usa a data de hoje."><Input type="date" max={hojeISO()} value={f.dataResolucao ?? ''} onChange={(e) => set('dataResolucao', e.target.value)} /></Field>}
        {ocorrencia && (resolvida || f.solucao) && <Field label="Solução aplicada" required={resolvida} className="sm:col-span-2"><Textarea value={f.solucao} onChange={(e) => set('solucao', e.target.value)} /></Field>}
      </div>
      <div className="mt-3"><ErrorBox error={m.error} /></div>
    </Modal>
  );
}

function AnexosModal({ oc, projeto, onClose }: { oc: any; projeto: any; onClose: () => void }) {
  return <Modal open onClose={onClose} size="xl" title={`Anexos — ${oc.titulo}`}><DocumentosPanel projeto={projeto} ocorrenciaId={oc.id} /></Modal>;
}

/** Lista de ocorrências — aba do projeto (com `projeto`) ou página global. */
export function OcorrenciasPanel({ projeto }: { projeto?: { id: number; codigo: string; pastaCaminho?: string | null } }) {
  const { can } = useAuth(); const pessoas = usePessoas();
  const [f, setF] = useState({ busca: '', status: '', severidade: '', responsavelId: '', vencida: '' }); const [page, setPage] = useState(1);
  const [novo, setNovo] = useState(false); const [edit, setEdit] = useState<any>(null); const [anexos, setAnexos] = useState<any>(null);
  const set = (k: string, v: string) => { setF((s) => ({ ...s, [k]: v })); setPage(1); };
  const q = qs({ projetoId: projeto?.id, ...f, page, pageSize: 20 });
  const { data, isLoading, error } = useQuery({ queryKey: ['ocorrencias', q], queryFn: () => get(`/occurrences${q}`), placeholderData: (p) => p });
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Buscar"><Input className="!w-52" placeholder="Título ou descrição…" value={f.busca} onChange={(e) => set('busca', e.target.value)} /></Field>
        <Field label="Status"><Select className="!w-40" value={f.status} onChange={(e) => set('status', e.target.value)}><option value="">Todos</option>{Object.entries(STATUS_OC).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Severidade"><Select className="!w-36" value={f.severidade} onChange={(e) => set('severidade', e.target.value)}><option value="">Todas</option>{Object.entries(SEVERIDADE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Responsável"><Select className="!w-40" value={f.responsavelId} onChange={(e) => set('responsavelId', e.target.value)}><Opts items={pessoas.data} empty="Todos" /></Select></Field>
        <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-500"><input type="checkbox" checked={f.vencida === 'true'} onChange={(e) => set('vencida', e.target.checked ? 'true' : '')} />Somente vencidas</label>
        <Button variant="ghost" onClick={() => { setF({ busca: '', status: '', severidade: '', responsavelId: '', vencida: '' }); setPage(1); }}>Limpar</Button>
        {projeto && can('occurrences.manage') && <Button variant="primary" className="ml-auto" onClick={() => setNovo(true)}><Plus className="h-4 w-4" />Nova ocorrência</Button>}
      </div>
      <ErrorBox error={error} />
      <Card>
        {isLoading ? <Loading /> : !data?.itens.length ? <Empty>Nenhuma ocorrência encontrada.</Empty> : (
          <>
            <Table>
              <thead><tr><Th>Ocorrência</Th>{!projeto && <Th>Projeto</Th>}<Th>Severidade</Th><Th>Status</Th><Th>Responsável</Th><Th>Prazo</Th><Th>Resolução</Th><Th /></tr></thead>
              <tbody>{data.itens.map((o: any) => (
                <tr key={o.id} className="hover:bg-slate-50/60">
                  <Td className="max-w-[340px]"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: SEVERIDADE[o.severidade]?.cor }} />
                    <div className="min-w-0"><div className="truncate font-medium text-slate-800" title={o.titulo}>{o.titulo}</div>
                      <div className="truncate text-xs text-slate-400">{o.etapa ? `${o.etapa.codigo}${o.atividade ? ` · ${o.atividade.nome}` : ''}` : 'Projeto inteiro'}{o.tipo ? ` · ${o.tipo.nome}` : ''} · aberta em {fmtData(o.data)}</div></div></div></Td>
                  {!projeto && <Td className="whitespace-nowrap font-mono text-[13px] font-semibold text-brand-800">{o.projeto.codigo}</Td>}
                  <Td><SevBadge s={o.severidade} /></Td><Td><StatusOcBadge s={o.status} /></Td><Td>{o.responsavel?.nome ?? '—'}</Td>
                  <Td className="whitespace-nowrap">{fmtData(o.prazoResolucao)}{o.vencida && <Badge color="#dc2626" className="ml-1.5">vencida</Badge>}</Td>
                  <Td className="whitespace-nowrap">{fmtData(o.dataResolucao)}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" title="Anexos" onClick={() => setAnexos(o)}><Paperclip className="h-4 w-4" />{o.anexos > 0 && <span className="text-xs">{o.anexos}</span>}</Button>
                    {can('occurrences.manage') && <Button size="sm" variant="ghost" title="Editar" onClick={() => setEdit(o)}><Pencil className="h-4 w-4" /></Button>}
                  </Td>
                </tr>))}</tbody>
            </Table>
            {data.total > data.pageSize && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
          </>
        )}
      </Card>
      {projeto && <OcorrenciaModal key={String(novo)} open={novo} onClose={() => setNovo(false)} projetoId={projeto.id} />}
      {edit && <OcorrenciaModal key={edit.id} open onClose={() => setEdit(null)} projetoId={edit.projeto.id} ocorrencia={edit} />}
      {anexos && <AnexosModal oc={anexos} projeto={projeto ?? { id: anexos.projeto.id, codigo: anexos.projeto.codigo }} onClose={() => setAnexos(null)} />}
    </div>
  );
}
