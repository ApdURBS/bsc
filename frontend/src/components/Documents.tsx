import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, Eye, FileText, FolderOpen, History, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { API_URL, del, get, patch, qs, upload } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtData, fmtDataHora, fmtTamanho } from '../lib/format';
import { usePessoas, useTiposDoc } from '../lib/queries';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, Opts, Pagination, Select, Table, Td, Textarea, Th, useToast } from './ui';

export const CATEGORIAS = ['Relatórios', 'Documentos', 'Evidências', 'Outros'];
const url = (id: number, extra = '') => `${API_URL}/documents/${id}/download${extra}`;

function useInvalidate() {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: ['docs'] }); qc.invalidateQueries({ queryKey: ['ocorrencias'] }); qc.invalidateQueries({ queryKey: ['timeline'] }); qc.invalidateQueries({ queryKey: ['projeto'] }); };
}

// ───────────── Envio de documento ─────────────
export function UploadModal({ open, onClose, projetoId, ocorrenciaId }: { open: boolean; onClose: () => void; projetoId: number; ocorrenciaId?: number }) {
  const toast = useToast(); const inv = useInvalidate(); const tipos = useTiposDoc(); const pessoas = usePessoas();
  const [f, setF] = useState<any>({ nome: '', categoria: ocorrenciaId ? 'Evidências' : 'Documentos', tipoId: '', etapaId: '', atividadeId: '', responsavelId: '', caminhoRede: '', observacao: '' });
  const [arq, setArq] = useState<File | null>(null);
  const set = (k: string, v: string) => setF((s: any) => ({ ...s, [k]: v, ...(k === 'etapaId' ? { atividadeId: '' } : {}) }));
  const etapas = useQuery({ queryKey: ['etapas-proj', projetoId], queryFn: () => get(`/projects/${projetoId}/stages`), enabled: open });
  const atvs = useQuery({ queryKey: ['atv-etapa', Number(f.etapaId)], queryFn: () => get(`/stages/${f.etapaId}/activities`), enabled: open && !!f.etapaId });
  const m = useMutation({
    mutationFn: () => {
      const fd = new FormData(); fd.append('projetoId', String(projetoId)); if (ocorrenciaId) fd.append('ocorrenciaId', String(ocorrenciaId));
      for (const [k, v] of Object.entries(f)) if (v) fd.append(k, String(v));
      if (arq) fd.append('arquivo', arq);
      return upload('/documents', fd);
    },
    onSuccess: () => { inv(); toast('Documento registrado.'); setArq(null); onClose(); },
  });
  const pronto = !!arq || !!f.caminhoRede.trim();
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Novo documento" footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!pronto} loading={m.isPending} onClick={() => m.mutate()}><Upload className="h-4 w-4" />Salvar</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Arquivo" className="sm:col-span-2" hint={arq ? `${arq.name} · ${fmtTamanho(arq.size)}` : 'Opcional se for apenas uma referência de pasta de rede.'}>
          <input type="file" onChange={(e) => setArq(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm hover:file:bg-slate-50" />
        </Field>
        <Field label="Nome do documento" hint="Se vazio, usa o nome do arquivo."><Input value={f.nome} onChange={(e) => set('nome', e.target.value)} /></Field>
        <Field label="Categoria"><Select value={f.categoria} onChange={(e) => set('categoria', e.target.value)}>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Tipo"><Select value={f.tipoId} onChange={(e) => set('tipoId', e.target.value)}><Opts items={tipos.data} /></Select></Field>
        <Field label="Responsável"><Select value={f.responsavelId} onChange={(e) => set('responsavelId', e.target.value)}><Opts items={pessoas.data} /></Select></Field>
        <Field label="Etapa"><Select value={f.etapaId} onChange={(e) => set('etapaId', e.target.value)}><option value="">Projeto inteiro</option>{etapas.data?.map((e: any) => <option key={e.id} value={e.id}>{e.letra} — {e.nome}</option>)}</Select></Field>
        <Field label="Atividade"><Select value={f.atividadeId} disabled={!f.etapaId} onChange={(e) => set('atividadeId', e.target.value)}><Opts items={atvs.data} /></Select></Field>
        <Field label="Caminho da pasta de rede" className="sm:col-span-2" hint="Apenas referência — o navegador não abre caminhos de rede automaticamente."><Input placeholder="R:\APD\APD_UPD\..." value={f.caminhoRede} onChange={(e) => set('caminhoRede', e.target.value)} /></Field>
        <Field label="Observação" className="sm:col-span-2"><Textarea value={f.observacao} onChange={(e) => set('observacao', e.target.value)} /></Field>
      </div>
      <div className="mt-3"><ErrorBox error={m.error} /></div>
    </Modal>
  );
}

function VersionModal({ doc, onClose }: { doc: any; onClose: () => void }) {
  const toast = useToast(); const inv = useInvalidate(); const [arq, setArq] = useState<File | null>(null); const [obs, setObs] = useState('');
  const m = useMutation({ mutationFn: () => { const fd = new FormData(); fd.append('arquivo', arq!); if (obs) fd.append('observacao', obs); return upload(`/documents/${doc.id}/versions`, fd); }, onSuccess: () => { inv(); toast('Nova versão registrada.'); onClose(); } });
  return (
    <Modal open onClose={onClose} size="sm" title={`Nova versão — ${doc.nome}`} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!arq} loading={m.isPending} onClick={() => m.mutate()}>Enviar versão</Button></>}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">A versão atual (v{doc.versao ?? 0}) é preservada no histórico.</p>
        <Field label="Arquivo"><input type="file" onChange={(e) => setArq(e.target.files?.[0] ?? null)} className="block w-full text-sm" /></Field>
        <Field label="O que mudou?"><Textarea value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
        <ErrorBox error={m.error} />
      </div>
    </Modal>
  );
}

function HistoryModal({ doc, onClose }: { doc: any; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['docs', 'det', doc.id], queryFn: () => get(`/documents/${doc.id}`) });
  return (
    <Modal open onClose={onClose} size="lg" title={`Histórico de versões — ${doc.nome}`}>
      {isLoading ? <Loading /> : !data?.versoes.length ? <Empty>Este documento é apenas uma referência de pasta de rede (sem arquivo).</Empty> : (
        <Table>
          <thead><tr><Th>Versão</Th><Th>Arquivo</Th><Th>Enviado por</Th><Th>Data</Th><Th>Tamanho</Th><Th>Observação</Th><Th /></tr></thead>
          <tbody>{data.versoes.map((v: any, i: number) => (
            <tr key={v.id}><Td className="font-semibold">v{v.versao}{i === 0 && <Badge color="#059669" className="ml-2">atual</Badge>}</Td><Td className="max-w-[220px] truncate" title={v.sha256 ? `SHA-256 ${v.sha256}` : ''}>{v.arquivoNome}</Td><Td>{v.usuarioNome ?? '—'}</Td>
              <Td>{fmtDataHora(v.createdAt)}</Td><Td>{fmtTamanho(v.tamanho)}</Td><Td className="max-w-[200px] truncate">{v.observacao ?? ''}</Td>
              <Td><a className="text-brand-700 hover:underline" href={url(doc.id, `?versao=${v.versao}`)}>Baixar</a></Td></tr>))}</tbody>
        </Table>
      )}
    </Modal>
  );
}

function EditModal({ doc, onClose }: { doc: any; onClose: () => void }) {
  const toast = useToast(); const inv = useInvalidate(); const tipos = useTiposDoc();
  const [f, setF] = useState({ nome: doc.nome, categoria: doc.categoria ?? 'Documentos', tipoId: doc.tipo?.id ?? '', caminhoRede: doc.caminhoRede ?? '', observacao: doc.observacao ?? '' });
  const m = useMutation({ mutationFn: () => patch(`/documents/${doc.id}`, f), onSuccess: () => { inv(); toast('Documento atualizado.'); onClose(); } });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Modal open onClose={onClose} title="Editar documento" footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>Salvar</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" className="sm:col-span-2"><Input value={f.nome} onChange={(e) => set('nome', e.target.value)} /></Field>
        <Field label="Categoria"><Select value={f.categoria} onChange={(e) => set('categoria', e.target.value)}>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Tipo"><Select value={f.tipoId} onChange={(e) => set('tipoId', e.target.value)}><Opts items={tipos.data} /></Select></Field>
        <Field label="Caminho da pasta de rede" className="sm:col-span-2"><Input value={f.caminhoRede} onChange={(e) => set('caminhoRede', e.target.value)} /></Field>
        <Field label="Observação" className="sm:col-span-2"><Textarea value={f.observacao} onChange={(e) => set('observacao', e.target.value)} /></Field>
      </div>
      <div className="mt-3"><ErrorBox error={m.error} /></div>
    </Modal>
  );
}

// ───────────── Lista de documentos (aba do projeto, anexos de ocorrência e página global) ─────────────
export function DocumentosPanel({ projeto, ocorrenciaId, global = false }: { projeto?: { id: number; codigo: string; pastaCaminho?: string | null }; ocorrenciaId?: number; global?: boolean }) {
  const { can } = useAuth(); const toast = useToast(); const inv = useInvalidate(); const tipos = useTiposDoc();
  const [f, setF] = useState({ busca: '', etapaId: '', categoria: '', tipoId: '' }); const [page, setPage] = useState(1);
  const [novo, setNovo] = useState(false); const [ver, setVer] = useState<any>(null); const [hist, setHist] = useState<any>(null); const [edit, setEdit] = useState<any>(null); const [excluir, setExcluir] = useState<any>(null);
  const set = (k: string, v: string) => { setF((s) => ({ ...s, [k]: v })); setPage(1); };
  const etapas = useQuery({ queryKey: ['etapas-proj', projeto?.id], queryFn: () => get(`/projects/${projeto!.id}/stages`), enabled: !!projeto && !ocorrenciaId });
  const q = qs({ projetoId: projeto?.id, ocorrenciaId, ...f, page, pageSize: ocorrenciaId ? 50 : 20 });
  const { data, isLoading, error } = useQuery({ queryKey: ['docs', q], queryFn: () => get(`/documents${q}`), placeholderData: (p) => p });
  const rm = useMutation({ mutationFn: (id: number) => del(`/documents/${id}`), onSuccess: () => { inv(); toast('Documento excluído (o histórico foi preservado).'); setExcluir(null); } });
  const copiar = async (t: string) => { try { await navigator.clipboard.writeText(t); toast('Caminho copiado.'); } catch { toast('Não foi possível copiar.', 'err'); } };
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Buscar"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><Input className="!w-56 !pl-8" placeholder="Nome, observação, caminho…" value={f.busca} onChange={(e) => set('busca', e.target.value)} /></div></Field>
        {projeto && !ocorrenciaId && <Field label="Etapa"><Select className="!w-44" value={f.etapaId} onChange={(e) => set('etapaId', e.target.value)}><option value="">Todas</option>{etapas.data?.map((e: any) => <option key={e.id} value={e.id}>{e.letra} — {e.nome}</option>)}</Select></Field>}
        <Field label="Categoria"><Select className="!w-36" value={f.categoria} onChange={(e) => set('categoria', e.target.value)}><option value="">Todas</option>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Tipo"><Select className="!w-40" value={f.tipoId} onChange={(e) => set('tipoId', e.target.value)}><Opts items={tipos.data} empty="Todos" /></Select></Field>
        <Button variant="ghost" onClick={() => { setF({ busca: '', etapaId: '', categoria: '', tipoId: '' }); setPage(1); }}>Limpar</Button>
        {projeto && can('documents.create') && <Button variant="primary" className="ml-auto" onClick={() => setNovo(true)}><Plus className="h-4 w-4" />Novo documento</Button>}
      </div>
      {projeto?.pastaCaminho && !ocorrenciaId && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <FolderOpen className="h-4 w-4 shrink-0 text-slate-400" /><span className="shrink-0 font-medium">Pasta de rede do projeto:</span><code className="min-w-0 flex-1 truncate" title={projeto.pastaCaminho}>{projeto.pastaCaminho}</code>
          <Button size="sm" variant="ghost" onClick={() => copiar(projeto.pastaCaminho!)}><Copy className="h-3.5 w-3.5" />Copiar</Button>
        </div>
      )}
      <ErrorBox error={error} />
      <Card>
        {isLoading ? <Loading /> : !data?.itens.length ? <Empty>Nenhum documento encontrado.</Empty> : (
          <>
            <Table>
              <thead><tr><Th>Documento</Th>{global && <Th>Projeto</Th>}<Th>Categoria</Th><Th>Vínculo</Th><Th>Versão</Th><Th>Atualizado</Th><Th /></tr></thead>
              <tbody>{data.itens.map((d: any) => (
                <tr key={d.id} className="hover:bg-slate-50/60">
                  <Td className="max-w-[320px]">
                    <div className="flex items-start gap-2"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0"><div className="truncate font-medium text-slate-800" title={d.nome}>{d.nome}</div>
                        <div className="truncate text-xs text-slate-400">{d.arquivoNome ? `${d.arquivoNome} · ${fmtTamanho(d.tamanho)}` : 'Referência de pasta de rede'}{d.tipo ? ` · ${d.tipo.nome}` : ''}</div>
                        {d.caminhoRede && <button className="mt-0.5 flex max-w-full items-center gap-1 text-left text-xs text-slate-500 hover:text-brand-700" title="Copiar caminho" onClick={() => copiar(d.caminhoRede)}><Copy className="h-3 w-3 shrink-0" /><code className="truncate">{d.caminhoRede}</code></button>}
                      </div></div>
                  </Td>
                  {global && <Td className="whitespace-nowrap font-mono text-[13px] font-semibold text-brand-800">{d.projeto.codigo}</Td>}
                  <Td>{d.categoria ?? '—'}</Td>
                  <Td className="whitespace-nowrap text-xs text-slate-600">{d.atividade ? <>{d.etapa?.codigo}<div className="max-w-[160px] truncate text-slate-400">{d.atividade.nome}</div></> : d.etapa ? d.etapa.codigo : 'Projeto'}</Td>
                  <Td>{d.versao ? <Badge color="#475569">v{d.versao}</Badge> : '—'}</Td>
                  <Td className="whitespace-nowrap text-xs text-slate-500">{fmtData(d.updatedAt)}<div>{d.criadoPor ?? ''}</div></Td>
                  <Td className="whitespace-nowrap text-right">
                    {d.versao && d.visualizavel && <a className="inline-flex h-8 items-center px-2 text-slate-500 hover:text-brand-700" title="Visualizar" href={url(d.id, '?inline=1')} target="_blank" rel="noreferrer"><Eye className="h-4 w-4" /></a>}
                    {d.versao && <a className="inline-flex h-8 items-center px-2 text-slate-500 hover:text-brand-700" title="Baixar" href={url(d.id)}><Download className="h-4 w-4" /></a>}
                    <Button size="sm" variant="ghost" title="Histórico de versões" onClick={() => setHist(d)}><History className="h-4 w-4" /></Button>
                    {can('documents.create') && <Button size="sm" variant="ghost" title="Nova versão" onClick={() => setVer(d)}><Upload className="h-4 w-4" /></Button>}
                    {can('documents.create') && <Button size="sm" variant="ghost" title="Editar" onClick={() => setEdit(d)}><Pencil className="h-4 w-4" /></Button>}
                    {can('documents.manage') && <Button size="sm" variant="ghost" title="Excluir" onClick={() => setExcluir(d)}><Trash2 className="h-4 w-4 text-red-600" /></Button>}
                  </Td>
                </tr>))}</tbody>
            </Table>
            {data.total > data.pageSize && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
          </>
        )}
      </Card>
      {projeto && <UploadModal key={String(novo)} open={novo} onClose={() => setNovo(false)} projetoId={projeto.id} ocorrenciaId={ocorrenciaId} />}
      {ver && <VersionModal doc={ver} onClose={() => setVer(null)} />}
      {hist && <HistoryModal doc={hist} onClose={() => setHist(null)} />}
      {edit && <EditModal doc={edit} onClose={() => setEdit(null)} />}
      <Modal open={!!excluir} onClose={() => setExcluir(null)} size="sm" title="Excluir documento?" footer={<><Button onClick={() => setExcluir(null)}>Cancelar</Button><Button variant="danger" loading={rm.isPending} onClick={() => rm.mutate(excluir.id)}>Excluir</Button></>}>
        <p className="text-sm text-slate-600">O documento <b>{excluir?.nome}</b> deixará de aparecer nas listas. Os arquivos e versões ficam preservados no servidor e a exclusão é registrada na auditoria.</p>
        <div className="mt-3"><ErrorBox error={rm.error} /></div>
      </Modal>
    </div>
  );
}
