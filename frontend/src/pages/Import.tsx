import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CopyX, Download, FileSpreadsheet, XCircle } from 'lucide-react';
import { get, post, qs, upload } from '../lib/api';
import { fmtDataHora } from '../lib/format';
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Pagination, Select, Table, Td, Th, useToast, cx } from '../components/ui';

const TIPOS: Record<string, string> = {
  CAMPO_OBRIGATORIO: 'Campos obrigatórios ausentes', CODIGO_INVALIDO: 'Códigos inválidos', DATA_INVALIDA: 'Datas inválidas', DUPLICADO: 'Duplicados',
  STATUS: 'Status', CONFIDENCIALIDADE: 'Confidencialidade', PESSOA: 'Pessoas', OUTRO: 'Outros',
};
const NIVEL: Record<string, string> = { ERRO: '#dc2626', AVISO: '#d97706', DUPLICADO: '#64748b' };
const ESTADO: Record<string, { label: string; cor: string }> = { VALIDO: { label: 'Válido', cor: '#059669' }, ERRO: { label: 'Com erro', cor: '#dc2626' }, DUPLICADO: { label: 'Duplicado', cor: '#64748b' } };

function Stat({ icon: Icon, label, value, cor, ativo, onClick }: { icon: any; label: string; value: number; cor: string; ativo?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={cx('rounded-lg border bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors', ativo ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-slate-200 hover:border-slate-300')}>
      <div className="flex items-center gap-2 text-xs text-slate-500"><Icon className="h-4 w-4" style={{ color: cor }} />{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
    </button>
  );
}

function Resultado({ r }: { r: any }) {
  return (
    <Card className="mb-5 border-emerald-200 bg-emerald-50/40 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-5 w-5" />Importação concluída</div>
      <p className="mt-2 text-sm text-slate-700">
        {r.projetosCriados} projeto(s) criado(s) · {r.etapasCriadas} etapa(s) · {r.movimentacoes} movimentação(ões)
        {r.projetosAtualizados ? ` · ${r.projetosAtualizados} projeto(s) já existente(s) receberam itens novos` : ''}
        {r.pessoasSemVinculo ? ` · ${r.pessoasSemVinculo} nome(s) de pessoa ficaram sem vínculo` : ''}.
      </p>
      <p className="mt-1 text-xs text-slate-500">Tudo foi marcado com o número da importação e a linha de origem. Itens com erro ou duplicados não foram gravados: corrija a planilha e importe de novo — o que já existe não é duplicado.</p>
      <div className="mt-3"><Link to="/projetos"><Button variant="primary">Ver projetos</Button></Link></div>
    </Card>
  );
}

function Previa({ inicial, onFim }: { inicial: any; onFim: () => void }) {
  const toast = useToast(); const qc = useQueryClient(); const id = inicial.id;
  const { data: det } = useQuery({ queryKey: ['import', id], queryFn: () => get(`/import/${id}`) });
  const [mapa, setMapa] = useState<Record<string, number | null>>(() => Object.fromEntries(inicial.pessoas.map((p: any) => [p.nome, p.sugestaoUserId])));
  const [estado, setEstado] = useState(''); const [tipo, setTipo] = useState(''); const [page, setPage] = useState(1); const [conf, setConf] = useState(false); const [resultado, setResultado] = useState<any>(null);
  const s = inicial.resumo;
  const linhas = useQuery({ queryKey: ['import-linhas', id, estado, page], queryFn: () => get(`/import/${id}/linhas${qs({ estado, page, pageSize: 15 })}`), placeholderData: (p) => p });
  const confirmar = useMutation({
    mutationFn: () => post(`/import/${id}/confirm`, { pessoas: mapa }),
    onSuccess: (r: any) => { setConf(false); setResultado(r.resultado); qc.invalidateQueries({ queryKey: ['import-hist'] }); qc.invalidateQueries({ queryKey: ['projetos'] }); toast('Importação concluída.'); },
  });
  const cancelar = useMutation({ mutationFn: () => post(`/import/${id}/cancel`), onSuccess: () => { toast('Importação cancelada. Nada foi gravado.'); qc.invalidateQueries({ queryKey: ['import-hist'] }); onFim(); } });
  const problemas = (det?.problemas ?? []).filter((p: any) => !tipo || p.tipo === tipo);
  if (resultado) return <><Resultado r={resultado} /><Button onClick={onFim}>Nova importação</Button></>;
  const semVinculo = inicial.pessoas.filter((p: any) => !mapa[p.nome]).length;
  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3"><FileSpreadsheet className="h-6 w-6 text-emerald-600" /><div><div className="text-sm font-semibold text-slate-800">{inicial.arquivo}</div><div className="text-xs text-slate-500">Aba “{inicial.aba}” · cabeçalho na linha {inicial.cabecalhoLinha} · {s.colunasDatas} colunas de datas · prévia nº {id}</div></div></div>
        <div className="flex gap-2">
          <Button loading={cancelar.isPending} onClick={() => cancelar.mutate()}>Cancelar importação</Button>
          <Button variant="primary" disabled={s.validos === 0 && s.duplicados === 0} onClick={() => setConf(true)}>Importar registros válidos</Button>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={CheckCircle2} label="Registros válidos" value={s.validos} cor="#059669" ativo={estado === 'VALIDO'} onClick={() => { setEstado(estado === 'VALIDO' ? '' : 'VALIDO'); setPage(1); }} />
        <Stat icon={CopyX} label="Duplicados (ignorados)" value={s.duplicados} cor="#64748b" ativo={estado === 'DUPLICADO'} onClick={() => { setEstado(estado === 'DUPLICADO' ? '' : 'DUPLICADO'); setPage(1); }} />
        <Stat icon={XCircle} label="Com erro (não importados)" value={s.erros} cor="#dc2626" ativo={estado === 'ERRO'} onClick={() => { setEstado(estado === 'ERRO' ? '' : 'ERRO'); setPage(1); }} />
        <Stat icon={AlertTriangle} label="Avisos" value={s.avisos} cor="#d97706" />
      </div>
      <p className="text-sm text-slate-600">Ao importar serão gravados <b>{s.projetosNovos}</b> projeto(s) novo(s), <b>{s.etapas}</b> etapa(s) e <b>{s.movimentacoes}</b> movimentação(ões) (uma por célula preenchida nas colunas de datas). {s.projetosExistentes > 0 && <>{s.projetosExistentes} projeto(s) já existem no sistema e não serão alterados.</>}</p>

      {inicial.pessoas.length > 0 && (
        <Card>
          <div className="border-b border-slate-200 px-4 py-3"><div className="text-sm font-semibold text-slate-800">Pessoas citadas na planilha</div><p className="text-xs text-slate-500">Vincule cada nome a um usuário da APD/UPD. Nomes sem vínculo ficam em branco (você pode preencher depois). {semVinculo > 0 && <b className="text-amber-700">{semVinculo} sem vínculo.</b>}</p></div>
          <Table>
            <thead><tr><Th>Nome na planilha</Th><Th>Aparece como</Th><Th>Ocorrências</Th><Th>Usuário no sistema</Th></tr></thead>
            <tbody>{inicial.pessoas.map((p: any) => (
              <tr key={p.chave}><Td className="font-medium">{p.nome}</Td><Td className="text-xs text-slate-500">{p.papeis.map((x: string) => ({ dono: 'Dono', scrum: 'Scrum Master', equipe: 'Equipe', autor: 'Autor de movimentação' } as any)[x]).join(', ')}</Td><Td>{p.ocorrencias}</Td>
                <Td><Select className="!w-56" value={mapa[p.nome] ?? ''} onChange={(e) => setMapa((m) => ({ ...m, [p.nome]: e.target.value ? Number(e.target.value) : null }))}>
                  <option value="">— sem vínculo —</option>{(det?.apd ?? inicial.apd).map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</Select></Td></tr>))}</tbody>
          </Table>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
          <div className="mr-auto text-sm font-semibold text-slate-800">Problemas encontrados <span className="font-normal text-slate-400">({problemas.length})</span></div>
          <Select className="!w-56" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos os tipos ({det?.problemas?.length ?? 0})</option>{Object.entries(TIPOS).filter(([k]) => s.porTipo[k] > 0).map(([k, v]) => <option key={k} value={k}>{v} ({s.porTipo[k]})</option>)}</Select>
          <a href={`/api/import/${id}/problemas.csv`}><Button size="sm"><Download className="h-3.5 w-3.5" />CSV</Button></a>
        </div>
        {!det ? <Loading /> : !problemas.length ? <Empty>Nenhum problema neste filtro.</Empty> : (
          <div className="max-h-96 overflow-y-auto"><Table>
            <thead><tr><Th>Linha</Th><Th>Nível</Th><Th>Tipo</Th><Th>Código</Th><Th>Campo</Th><Th>Mensagem</Th></tr></thead>
            <tbody>{problemas.map((p: any, i: number) => (
              <tr key={i}><Td className="tabular-nums">{p.linha || '—'}</Td><Td><Badge color={NIVEL[p.nivel]}>{p.nivel === 'ERRO' ? 'Erro' : p.nivel === 'AVISO' ? 'Aviso' : 'Duplicado'}</Badge></Td><Td className="whitespace-nowrap text-xs">{TIPOS[p.tipo]}</Td><Td className="font-mono text-xs">{p.codigo ?? ''}</Td><Td className="text-xs">{p.campo ?? ''}</Td><Td className="min-w-[320px] whitespace-normal text-sm text-slate-700">{p.mensagem}</Td></tr>))}</tbody>
          </Table></div>
        )}
      </Card>

      <Card>
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">Linhas da planilha {estado && <span className="font-normal text-slate-400">— {ESTADO[estado].label.toLowerCase()}s <button className="ml-1 text-brand-700 hover:underline" onClick={() => setEstado('')}>limpar</button></span>}</div>
        {linhas.isLoading ? <Loading /> : (
          <>
            <Table>
              <thead><tr><Th>Linha</Th><Th>Situação</Th><Th>Código</Th><Th>Etapa</Th><Th>Nome / atividade</Th><Th>Status</Th><Th>Início</Th><Th>Prevista</Th><Th>Movim.</Th></tr></thead>
              <tbody>{linhas.data?.itens.map((l: any) => (
                <tr key={l.linha}><Td className="tabular-nums">{l.linha}</Td><Td><Badge color={ESTADO[l.estado].cor}>{ESTADO[l.estado].label}</Badge></Td><Td className="font-mono text-[13px] font-semibold text-brand-800">{l.codigo ?? '—'}</Td><Td>{l.letra ?? <span className="text-xs text-slate-400">projeto</span>}</Td>
                  <Td className="max-w-[320px] truncate" title={l.atividade ?? l.nome ?? ''}>{l.atividade ?? l.nome}</Td><Td>{l.status ?? '—'}</Td><Td className="whitespace-nowrap text-xs">{l.inicio ?? '—'}</Td><Td className="whitespace-nowrap text-xs">{l.prevista ?? '—'}</Td><Td>{l.movimentos || ''}</Td></tr>))}</tbody>
            </Table>
            {linhas.data && <Pagination page={linhas.data.page} pageSize={linhas.data.pageSize} total={linhas.data.total} onPage={setPage} />}
          </>
        )}
      </Card>

      <details className="rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">Colunas reconhecidas e destino no sistema</summary>
        <Table><thead><tr><Th>Coluna</Th><Th>Título na planilha</Th><Th>Destino</Th></tr></thead>
          <tbody>{inicial.colunas.map((c: any, i: number) => (
            <tr key={i}><Td className="font-mono text-xs">{c.letra}</Td><Td className="text-xs">{c.titulo}</Td><Td className="text-xs">{c.campo === 'movimentacao' ? 'Cada célula preenchida vira uma movimentação (data do cabeçalho)' : c.campo ? ROT[c.campo] : <span className="text-slate-400">não utilizada</span>}</Td></tr>))}</tbody></Table>
      </details>

      <Modal open={conf} onClose={() => setConf(false)} size="sm" title="Confirmar importação?" footer={<><Button onClick={() => setConf(false)}>Voltar</Button><Button variant="primary" loading={confirmar.isPending} onClick={() => confirmar.mutate()}>Importar agora</Button></>}>
        <p className="text-sm text-slate-600">Serão criados <b>{s.projetosNovos}</b> projeto(s), <b>{s.etapas}</b> etapa(s) e <b>{s.movimentacoes}</b> movimentação(ões). As <b>{s.erros}</b> linha(s) com erro e as <b>{s.duplicados}</b> duplicada(s) não serão gravadas. Tudo fica registrado na auditoria e marcado como importado.</p>
        <div className="mt-3"><ErrorBox error={confirmar.error} /></div>
      </Modal>
    </div>
  );
}
const ROT: Record<string, string> = {
  mapa: 'Frente (confere com o código)', direcionador: 'Campos extras do projeto', codigo: 'Código do projeto', acao: 'Campos extras do projeto', etapa: 'Letra da etapa (vazio = linha do projeto)', dono: 'Dono do projeto',
  scrum: 'Scrum Master da etapa', equipe: 'Responsável e equipe da etapa', nome: 'Nome do projeto', conf: 'Confidencialidade do projeto', atividade: 'Nome da etapa', caminho: 'Caminho da pasta de rede',
  status: 'Status', inicio: 'Data de início da etapa', prevista: 'Data prevista da etapa', real: 'Data de conclusão real',
};

export default function ImportPage() {
  const [arq, setArq] = useState<File | null>(null); const [aba, setAba] = useState(''); const [abas, setAbas] = useState<string[]>([]); const [prev, setPrev] = useState<any>(null);
  const [pgH, setPgH] = useState(1);
  const analisar = useMutation({
    mutationFn: () => { const fd = new FormData(); fd.append('arquivo', arq!); if (aba) fd.append('aba', aba); return upload('/import/preview', fd); },
    onSuccess: (r) => { setPrev(r); setAbas(r.abas); setAba(r.aba); },
    onError: (e: any) => { if (e?.details?.abas) setAbas(e.details.abas); },
  });
  useEffect(() => { if (!arq) { setAbas([]); setAba(''); } }, [arq]);
  const hist = useQuery({ queryKey: ['import-hist', pgH], queryFn: () => get(`/import?page=${pgH}&pageSize=8`) });
  const reset = () => { setPrev(null); setArq(null); setAbas([]); setAba(''); };
  return (
    <>
      <PageHeader title="Importar dados" subtitle="Traz a planilha Excel/CSV do BSC para o sistema, com prévia antes de gravar. Cada célula de data preenchida vira uma movimentação." />
      {!prev ? (
        <Card className="mb-6 p-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_220px_auto] sm:items-end">
            <Field label="Arquivo (.xlsx, .xlsm ou .csv — até 25 MB)"><input type="file" accept=".xlsx,.xlsm,.csv" onChange={(e) => { setArq(e.target.files?.[0] ?? null); setAba(''); }} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm hover:file:bg-slate-50" /></Field>
            <Field label="Aba da planilha" hint="Padrão: a aba com o ano (ex.: 2026).">{abas.length ? <Select value={aba} onChange={(e) => setAba(e.target.value)}>{abas.map((a) => <option key={a}>{a}</option>)}</Select> : <Select disabled><option>Automática</option></Select>}</Field>
            <Button variant="primary" disabled={!arq} loading={analisar.isPending} onClick={() => analisar.mutate()}>Analisar planilha</Button>
          </div>
          <div className="mt-3"><ErrorBox error={analisar.error} /></div>
          <p className="mt-3 text-xs text-slate-500">Nada é gravado nesta etapa. Reimportar a mesma planilha é seguro: projetos, etapas e movimentações que já existem são reconhecidos como duplicados e ignorados.</p>
        </Card>
      ) : <div className="mb-6"><Previa key={prev.id} inicial={prev} onFim={reset} /></div>}

      <Card>
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">Histórico de importações</div>
        {hist.isLoading ? <Loading /> : !hist.data?.itens.length ? <Empty>Nenhuma importação realizada.</Empty> : (
          <>
            <Table><thead><tr><Th>Nº</Th><Th>Arquivo</Th><Th>Data</Th><Th>Usuário</Th><Th>Situação</Th><Th>Resultado</Th></tr></thead>
              <tbody>{hist.data.itens.map((i: any) => (
                <tr key={i.id}><Td className="tabular-nums">{i.id}</Td><Td className="max-w-[260px] truncate">{i.arquivoNome} <span className="text-xs text-slate-400">· {i.aba}</span></Td><Td className="whitespace-nowrap text-xs">{fmtDataHora(i.concluidaEm ?? i.createdAt)}</Td><Td>{i.usuario}</Td>
                  <Td><Badge color={{ CONCLUIDA: '#059669', CANCELADA: '#94a3b8', PREVIA: '#d97706', FALHOU: '#dc2626' }[i.status as string]}>{{ CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada', PREVIA: 'Prévia (não confirmada)', FALHOU: 'Falhou' }[i.status as string]}</Badge></Td>
                  <Td className="text-xs text-slate-600">{i.resultado ? `${i.resultado.projetosCriados} projeto(s) · ${i.resultado.etapasCriadas} etapa(s) · ${i.resultado.movimentacoes} movimentação(ões)` : ''}</Td></tr>))}</tbody></Table>
            {hist.data.total > hist.data.pageSize && <Pagination page={hist.data.page} pageSize={hist.data.pageSize} total={hist.data.total} onPage={setPgH} />}
          </>
        )}
      </Card>
    </>
  );
}
