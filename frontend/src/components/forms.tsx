import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePessoas, useStatus, useTiposMov } from '../lib/queries';
import { Button, ErrorBox, Field, Input, Modal, Opts, Select, Textarea, useToast } from './ui';
import { hojeISO } from '../lib/format';

const nz = (v: any) => (v === '' ? null : v);

// ───────────── Etapa ─────────────
export function StageFormModal({ open, onClose, projetoId, etapa }: { open: boolean; onClose: () => void; projetoId: number; etapa?: any }) {
  const edit = !!etapa; const qc = useQueryClient(); const toast = useToast(); const { can } = useAuth();
  const colabs = usePessoas(), status = useStatus();
  const [f, setF] = useState<any>({});
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  // mantém visíveis pessoas já vinculadas à etapa mesmo que não sejam mais elegíveis
  const extras = edit ? [etapa.responsavel, etapa.scrumMaster, ...(etapa.membros ?? [])].filter(Boolean) : [];
  const pessoas: any[] = [...(colabs.data ?? []), ...extras.filter((x: any, i: number, a: any[]) => !(colabs.data ?? []).some((c: any) => c.id === x.id) && a.findIndex((y) => y.id === x.id) === i)];
  const sug = useQuery({ queryKey: ['next-letter', projetoId, open], queryFn: () => get(`/projects/${projetoId}/stages/next-letter`), enabled: open && !edit, gcTime: 0 });
  useEffect(() => {
    if (!open) return;
    if (edit) setF({ nome: etapa.nome, descricao: etapa.descricao ?? '', responsavelId: etapa.responsavel?.id ?? '', scrumMasterId: etapa.scrumMaster?.id ?? '', membros: (etapa.membros ?? []).map((m: any) => m.id), tags: (etapa.tags ?? []).join(', '), statusId: etapa.status.id, dataInicio: etapa.dataInicio ?? '', dataPrevista: etapa.dataPrevista ?? '', peso: etapa.peso, pastaCaminho: etapa.pastaCaminho ?? '' });
    else setF({ letra: '', nome: '', descricao: '', responsavelId: '', scrumMasterId: '', membros: [], tags: '', statusId: '', dataInicio: '', dataPrevista: '', peso: 1, pastaCaminho: '' });
  }, [open]);
  useEffect(() => { if (!edit && sug.data && !f.letra) set('letra', sug.data.letra); }, [sug.data]);
  const letraTxt = String(f.letra ?? '').trim();
  const disp = useQuery({ queryKey: ['letter-available', projetoId, letraTxt], queryFn: () => get(`/projects/${projetoId}/stages/letter-available?letra=${encodeURIComponent(letraTxt)}`), enabled: open && !edit && !!letraTxt, staleTime: 0, gcTime: 0 });
  const letraInvalida = !edit && (!letraTxt || (!!disp.data && !disp.data.disponivel));
  const m = useMutation({
    mutationFn: () => {
      const body = { ...f, responsavelId: nz(f.responsavelId), scrumMasterId: nz(f.scrumMasterId), tags: String(f.tags ?? '').split(',').map((t: string) => t.trim()).filter(Boolean), statusId: nz(f.statusId), dataInicio: nz(f.dataInicio), dataPrevista: nz(f.dataPrevista), pastaCaminho: nz(f.pastaCaminho), descricao: nz(f.descricao), peso: Number(f.peso) || 1 };
      return edit ? patch(`/stages/${etapa.id}`, body) : post(`/projects/${projetoId}/stages`, body);
    },
    onSuccess: () => { qc.invalidateQueries(); toast(edit ? 'Etapa atualizada.' : 'Etapa criada.'); onClose(); },
  });
  return (
    <Modal open={open} onClose={onClose} size="lg" title={edit ? `Editar etapa ${etapa.codigo}` : `Nova etapa${sug.data ? ` — ${sug.data.codigo}` : ''}`}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={m.isPending} disabled={!f.nome || letraInvalida} onClick={() => m.mutate()}>{edit ? 'Salvar' : 'Criar etapa'}</Button></>}>
      <div className="space-y-4">
        <ErrorBox error={m.error} />
        <div className="grid gap-4 sm:grid-cols-4">
          {!edit && <Field label="Letra" hint={sug.data?.podeAlterar ? 'Sugerida; você pode alterar' : 'Sequência automática'}><Input value={f.letra ?? ''} readOnly={!sug.data?.podeAlterar} onChange={(e) => set('letra', e.target.value.toUpperCase())} className={'font-mono font-semibold uppercase ' + (disp.data && !disp.data.disponivel ? '!border-red-400 text-red-700' : '')} maxLength={3} />{disp.data && !disp.data.disponivel && <div className="mt-1 text-xs font-medium text-red-600">{disp.data.motivo}</div>}</Field>}
          <Field label="Nome da etapa" required className={edit ? 'sm:col-span-4' : 'sm:col-span-3'}><Input value={f.nome ?? ''} onChange={(e) => set('nome', e.target.value)} autoFocus /></Field>
        </div>
        <Field label="Descrição"><Textarea value={f.descricao ?? ''} onChange={(e) => set('descricao', e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Responsável"><Select value={f.responsavelId ?? ''} onChange={(e) => set('responsavelId', e.target.value)}><Opts items={pessoas} /></Select></Field>
          <Field label="Scrum Master"><Select value={f.scrumMasterId ?? ''} onChange={(e) => set('scrumMasterId', e.target.value)}><Opts items={pessoas} /></Select></Field>
          <Field label="Status"><Select value={f.statusId ?? ''} onChange={(e) => set('statusId', e.target.value)}><Opts items={status.data} empty="Padrão (Aguardando)" /></Select></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Início"><Input type="date" value={f.dataInicio ?? ''} onChange={(e) => set('dataInicio', e.target.value)} /></Field>
          <Field label="Entrega prevista"><Input type="date" value={f.dataPrevista ?? ''} min={f.dataInicio || undefined} onChange={(e) => set('dataPrevista', e.target.value)} /></Field>
          <Field label="Peso" hint="Peso da etapa no % de execução do projeto"><Input type="number" min={1} max={100} value={f.peso ?? 1} onChange={(e) => set('peso', e.target.value)} disabled={!can('stages.update')} /></Field>
        </div>
        <Field label="Equipe" hint="Usuários cadastrados como “Pertence à APD/UPD”">
          <div className="flex flex-wrap items-center gap-1.5">
            {(f.membros ?? []).map((id: number) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-800">{pessoas.find((c: any) => c.id === id)?.nome ?? id}<button type="button" onClick={() => set('membros', f.membros.filter((x: number) => x !== id))} className="text-brand-500 hover:text-brand-800" aria-label="Remover">×</button></span>)}
            <Select className="!w-56" value="" onChange={(e) => { const n = Number(e.target.value); if (n && !(f.membros ?? []).includes(n)) set('membros', [...(f.membros ?? []), n]); }}><Opts items={pessoas.filter((c: any) => !(f.membros ?? []).includes(c.id))} empty="+ Adicionar pessoa…" /></Select>
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Caminho da pasta"><Input value={f.pastaCaminho ?? ''} onChange={(e) => set('pastaCaminho', e.target.value)} /></Field>
          <Field label="Tags" hint="Separe por vírgula"><Input value={f.tags ?? ''} onChange={(e) => set('tags', e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

// ───────────── Atividade ─────────────
export function ActivityFormModal({ open, onClose, etapa, atividade }: { open: boolean; onClose: () => void; etapa: { id: number; codigo: string }; atividade?: any }) {
  const edit = !!atividade; const qc = useQueryClient(); const toast = useToast();
  const colabs = usePessoas(), status = useStatus();
  const [f, setF] = useState<any>({});
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  useEffect(() => {
    if (!open) return;
    setF(edit ? { nome: atividade.nome, descricao: atividade.descricao ?? '', responsavelId: atividade.responsavel?.id ?? '', statusId: atividade.status.id, dataInicio: atividade.dataInicio ?? '', dataPrevista: atividade.dataPrevista ?? '', peso: atividade.peso }
      : { nome: '', descricao: '', responsavelId: '', statusId: '', dataInicio: '', dataPrevista: '', peso: 1 });
  }, [open]);
  const m = useMutation({
    mutationFn: () => {
      const body = { ...f, responsavelId: nz(f.responsavelId), statusId: nz(f.statusId), dataInicio: nz(f.dataInicio), dataPrevista: nz(f.dataPrevista), descricao: nz(f.descricao), peso: Number(f.peso) || 1 };
      return edit ? patch(`/activities/${atividade.id}`, body) : post(`/stages/${etapa.id}/activities`, body);
    },
    onSuccess: () => { qc.invalidateQueries(); toast(edit ? 'Atividade atualizada.' : 'Atividade criada.'); onClose(); },
  });
  return (
    <Modal open={open} onClose={onClose} title={edit ? 'Editar atividade' : `Nova atividade — etapa ${etapa.codigo}`}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={m.isPending} disabled={!f.nome} onClick={() => m.mutate()}>{edit ? 'Salvar' : 'Criar atividade'}</Button></>}>
      <div className="space-y-4">
        <ErrorBox error={m.error} />
        <Field label="Atividade" required><Input value={f.nome ?? ''} onChange={(e) => set('nome', e.target.value)} autoFocus /></Field>
        <Field label="Descrição"><Textarea value={f.descricao ?? ''} onChange={(e) => set('descricao', e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Responsável"><Select value={f.responsavelId ?? ''} onChange={(e) => set('responsavelId', e.target.value)}><Opts items={colabs.data} /></Select></Field>
          <Field label="Status"><Select value={f.statusId ?? ''} onChange={(e) => set('statusId', e.target.value)}><Opts items={status.data} empty="Padrão (Aguardando)" /></Select></Field>
          <Field label="Início"><Input type="date" value={f.dataInicio ?? ''} onChange={(e) => set('dataInicio', e.target.value)} /></Field>
          <Field label="Entrega prevista"><Input type="date" value={f.dataPrevista ?? ''} min={f.dataInicio || undefined} onChange={(e) => set('dataPrevista', e.target.value)} /></Field>
        </div>
        <Field label="Peso" hint="Peso da atividade no % de execução da etapa" className="max-w-[160px]"><Input type="number" min={1} max={100} value={f.peso ?? 1} onChange={(e) => set('peso', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

// ───────────── Movimentação ─────────────
export function MovementFormModal({ open, onClose, projetoId, projetoCodigo, etapaId, atividadeId }: { open: boolean; onClose: () => void; projetoId: number; projetoCodigo: string; etapaId?: number; atividadeId?: number }) {
  const qc = useQueryClient(); const toast = useToast(); const tipos = useTiposMov();
  const [f, setF] = useState<any>({}); const [retro, setRetro] = useState(false);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const etapas = useQuery({ queryKey: ['etapas-proj', projetoId], queryFn: () => get(`/projects/${projetoId}/stages`), enabled: open });
  const atvs = useQuery({ queryKey: ['atv-etapa', f.etapaId], queryFn: () => get(`/stages/${f.etapaId}/activities`), enabled: open && !!f.etapaId });
  useEffect(() => { if (open) { setRetro(false); setF({ etapaId: etapaId ?? '', atividadeId: atividadeId ?? '', tipoId: '', descricao: '', data: hojeISO(), hora: '' }); } }, [open]);
  useEffect(() => { if (open && tipos.data && !f.tipoId) set('tipoId', tipos.data.find((t: any) => t.nome === 'Atualização')?.id ?? tipos.data[0]?.id ?? ''); }, [open, tipos.data]);
  const m = useMutation({
    mutationFn: () => post('/movements', { projetoId, etapaId: nz(f.etapaId), atividadeId: nz(f.atividadeId), tipoId: f.tipoId, descricao: f.descricao, ...(retro ? { data: f.data, ...(f.hora ? { hora: f.hora } : {}) } : {}) }),
    onSuccess: () => { qc.invalidateQueries(); toast('Movimentação registrada.'); onClose(); },
  });
  return (
    <Modal open={open} onClose={onClose} title={`Nova movimentação — ${projetoCodigo}`}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={m.isPending} disabled={(f.descricao ?? '').trim().length < 3} onClick={() => m.mutate()}>Registrar</Button></>}>
      <div className="space-y-4">
        <ErrorBox error={m.error} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tipo"><Select value={f.tipoId ?? ''} onChange={(e) => set('tipoId', e.target.value)}><Opts items={tipos.data} /></Select></Field>
          <Field label="Etapa"><Select value={f.etapaId ?? ''} onChange={(e) => setF((s: any) => ({ ...s, etapaId: e.target.value, atividadeId: '' }))}><option value="">Projeto como um todo</option>{etapas.data?.map((e: any) => <option key={e.id} value={e.id}>{e.letra} — {e.nome}</option>)}</Select></Field>
          <Field label="Atividade"><Select value={f.atividadeId ?? ''} disabled={!f.etapaId} onChange={(e) => set('atividadeId', e.target.value)}><Opts items={atvs.data} empty="—" /></Select></Field>
        </div>
        <Field label="Descrição" required><Textarea rows={4} autoFocus value={f.descricao ?? ''} onChange={(e) => set('descricao', e.target.value)} placeholder="Ex.: Termo de referência revisado e encaminhado para análise." /></Field>
        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-slate-600"><input type="checkbox" checked={retro} onChange={(e) => setRetro(e.target.checked)} />Registrar com data anterior (retroativa)</label>
          {retro ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Data"><Input type="date" max={hojeISO()} value={f.data ?? ''} onChange={(e) => set('data', e.target.value)} /></Field><Field label="Hora (opcional)"><Input type="time" value={f.hora ?? ''} onChange={(e) => set('hora', e.target.value)} /></Field></div>
            : <p className="mt-1 text-xs text-slate-400">Será registrada agora, em seu nome. Movimentações não podem ser editadas nem excluídas depois.</p>}
        </div>
      </div>
    </Modal>
  );
}
