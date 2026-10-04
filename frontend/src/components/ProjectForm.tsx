import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch, post } from '../lib/api';
import { usePessoas, useConfidencialidades, useFrentes, useStatus } from '../lib/queries';
import { Button, ErrorBox, Field, Input, Modal, Opts, Select, Textarea, useToast } from './ui';
import { fmtDataHora } from '../lib/format';
import { useAuth } from '../lib/auth';

/** Só oferece os níveis de confidencialidade que o próprio usuário pode enxergar. */
const visiveis = (items: any[] | undefined, me: any) => (items ?? []).filter((c) => c.ativo !== false && (!me?.acessoIds || me.acessoIds.includes(c.id)));

const empty = { frenteId: '', nome: '', descricao: '', donoId: '', sequencia: '' as number | '', seqEditado: false, statusId: '', confidencialidadeId: '', pastaCaminho: '', observacoes: '' };

export function ProjectFormModal({ open, onClose, projeto, onCreated, onVerHistorico }: { open: boolean; onClose: () => void; projeto?: any; onCreated?: (p: { id: number; codigo: string }) => void; onVerHistorico?: () => void }) {
  const edit = !!projeto;
  const qc = useQueryClient(); const toast = useToast(); const { me } = useAuth();
  const [f, setF] = useState<any>(empty);
  const frentes = useFrentes(), colabs = usePessoas(), status = useStatus(), confs = useConfidencialidades();
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const trocarFrente = (v: string) => setF((s: any) => ({ ...s, frenteId: v, sequencia: '', seqEditado: false }));
  const next = useQuery({ queryKey: ['next-code', f.frenteId], queryFn: () => get(`/projects/next-code?frenteId=${f.frenteId}`), enabled: open && !edit && !!f.frenteId, staleTime: 0, gcTime: 0 });
  const frenteSel = frentes.data?.find((x: any) => String(x.id) === String(f.frenteId));
  // sugestão automática do próximo número (enquanto o usuário não digitar o seu)
  useEffect(() => { if (next.data && !f.seqEditado) setF((s: any) => ({ ...s, sequencia: next.data.sequencia })); }, [next.data]);
  const seqOk = !edit && f.frenteId && Number.isInteger(Number(f.sequencia)) && Number(f.sequencia) >= 1;
  const disp = useQuery({ queryKey: ['code-available', f.frenteId, f.sequencia], queryFn: () => get(`/projects/code-available?frenteId=${f.frenteId}&sequencia=${f.sequencia}`), enabled: open && !!seqOk, staleTime: 0, gcTime: 0 });
  const codigoInvalido = !edit && (!seqOk || (disp.data && !disp.data.disponivel));
  const det = useQuery({ queryKey: ['projeto', projeto?.id], queryFn: () => get(`/projects/${projeto.id}`), enabled: open && edit });

  useEffect(() => {
    if (!open) return;
    if (!edit) { setF(empty); return; }
    const p = det.data ?? projeto;
    setF({ frenteId: p.frente.id, nome: p.nome, descricao: p.descricao ?? '', donoId: p.dono?.id ?? '', statusId: p.status.id, confidencialidadeId: p.confidencialidade.id, pastaCaminho: p.pastaCaminho ?? '', observacoes: p.observacoes ?? '' });
  }, [open, edit, det.data]);
  useEffect(() => {
    if (open && !edit && confs.data && !f.confidencialidadeId) {
      setF((s: any) => ({ ...s, confidencialidadeId: (visiveis(confs.data!, me).find((c: any) => c.regraAcesso === 'USUARIOS') ?? visiveis(confs.data!, me)[0])?.id ?? '' }));
    }
  }, [open, confs.data]);

  const m = useMutation({
    mutationFn: () => {
      const body: any = { ...f }; delete body.seqEditado;
      if (!edit) { delete body.statusId; return post('/projects', body); }
      delete body.frenteId; delete body.sequencia; return patch(`/projects/${projeto.id}`, body);
    },
    onSuccess: (r: any) => { qc.invalidateQueries(); toast(edit ? 'Projeto atualizado.' : `Projeto criado — código ${r.codigo}`); onClose(); if (!edit) onCreated?.(r); },
  });
  // pessoas = usuários da APD/UPD; mantém visíveis os já selecionados mesmo que tenham deixado de ser elegíveis
  const extras = edit ? [det.data?.dono ?? projeto?.dono].filter(Boolean) : [];
  const ativos = [...(colabs.data ?? []), ...extras.filter((x: any) => !(colabs.data ?? []).some((c: any) => c.id === x.id))];

  return (
    <Modal open={open} onClose={onClose} size="lg" title={edit ? `Editar projeto ${projeto.codigo}` : 'Novo projeto'}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={m.isPending} disabled={!f.nome || (!edit && (!f.frenteId || codigoInvalido))} onClick={() => m.mutate()}>{edit ? 'Salvar alterações' : 'Criar projeto'}</Button></>}>
      <div className="space-y-4">
        <ErrorBox error={m.error} />
        {edit && det.data?.ultimaAlteracao && (
          <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span>Última alteração: <b className="text-slate-700">{det.data.ultimaAlteracao.usuario}</b> · {fmtDataHora(det.data.ultimaAlteracao.dataHora)}</span>
            {onVerHistorico && <button className="text-brand-700 hover:underline" onClick={() => { onClose(); onVerHistorico(); }}>Ver histórico de alterações</button>}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Frente" required className="sm:col-span-1"><Select value={f.frenteId} disabled={edit} onChange={(e) => trocarFrente(e.target.value)}><Opts items={frentes.data} empty="Selecione a frente…" /></Select></Field>
          {edit ? <Field label="Código" hint="Não pode ser alterado"><Input readOnly value={projeto.codigo} className="bg-slate-50 font-mono font-semibold text-brand-800" /></Field> : (
            <Field label="Código" required hint={!f.frenteId ? 'Selecione a frente' : disp.data ? (disp.data.disponivel ? 'Disponível — você pode alterar o número' : ' ') : 'Sugerido automaticamente; você pode alterar o número'}>
              <div className="flex">
                <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-l-md border border-r-0 border-slate-300 bg-slate-50 px-2.5 font-mono text-sm font-semibold text-brand-800">{frenteSel?.codigo ?? '?'}_</span>
                <Input type="number" min={1} disabled={!f.frenteId} value={f.sequencia} onChange={(e) => setF((s: any) => ({ ...s, sequencia: e.target.value === '' ? '' : Number(e.target.value), seqEditado: true }))}
                  className={'!rounded-l-none font-mono font-semibold ' + (disp.data && !disp.data.disponivel ? '!border-red-400 text-red-700' : 'text-brand-800')} />
              </div>
              {disp.data && !disp.data.disponivel && <div className="mt-1 text-xs text-red-600">{disp.data.motivo}</div>}
            </Field>)}
        </div>
        <Field label="Nome do projeto" required><Input value={f.nome} onChange={(e) => set('nome', e.target.value)} maxLength={250} /></Field>
        <Field label="Descrição"><Textarea rows={2} value={f.descricao} onChange={(e) => set('descricao', e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dono do projeto" hint="Usuários cadastrados como “Pertence à APD/UPD”"><Select value={f.donoId} onChange={(e) => set('donoId', e.target.value)}><Opts items={ativos} /></Select></Field>
        </div>
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">Scrum Master, equipe, tags e datas são informados em cada <b>etapa</b>. As datas do projeto são calculadas a partir das etapas.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {edit && <Field label="Status"><Select value={f.statusId} onChange={(e) => set('statusId', e.target.value)}>{status.data?.map((s: any) => <option key={s.id} value={s.id}>{s.nome}</option>)}</Select></Field>}
          <Field label="Confidencialidade"><Select value={f.confidencialidadeId} onChange={(e) => set('confidencialidadeId', e.target.value)}><Opts items={visiveis(confs.data, me)} /></Select></Field>
        </div>
        <Field label="Caminho da pasta de arquivos" hint="Referência à pasta de rede (ex.: R:\APD\APD_UPD\...). Fica registrada como texto; o navegador não abre caminhos de rede automaticamente."><Input value={f.pastaCaminho} onChange={(e) => set('pastaCaminho', e.target.value)} /></Field>
        <Field label="Observações"><Input value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
