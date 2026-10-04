import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import { get, qs } from '../lib/api';
import { ACOES, fmtDataHora } from '../lib/format';
import { Badge, Empty, Loading, Pagination, Table, Td, Th, cx } from './ui';

/** Linha do tempo de movimentações (mais recente primeiro). */
export function MovementTimeline({ itens, mostrarProjeto }: { itens: any[]; mostrarProjeto?: boolean }) {
  if (!itens.length) return <Empty>Nenhuma movimentação encontrada.</Empty>;
  // agrupa por dia
  const dias = new Map<string, any[]>();
  for (const i of itens) { const k = new Date(i.dataHora).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); dias.set(k, [...(dias.get(k) ?? []), i]); }
  return (
    <div className="space-y-5">
      {[...dias.entries()].map(([dia, its]) => (
        <div key={dia}>
          <div className="mb-2 text-sm font-semibold text-slate-700">{dia}</div>
          <ol className="relative space-y-3 border-l border-slate-200 pl-5">
            {its.map((m) => m.origem === 'EVENTO' ? (
              <li key={`e${m.id}`} className="relative">
                <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-slate-300 ring-4 ring-white" />
                <div className="text-xs text-slate-400">{new Date(m.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })} · {m.usuario ?? 'Sistema'} · evento do sistema</div>
                <div className="text-sm text-slate-500">{descreverEvento(m)}</div>
              </li>
            ) : (
              <li key={m.id} className="relative">
                <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-brand-500 ring-4 ring-white" />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                  <span>{new Date(m.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</span>
                  <span className="font-medium text-slate-600">{m.usuario?.nome ?? m.usuario}</span>
                  <Badge color="#2f6fbf">{m.tipo?.nome ?? m.tipo}</Badge>
                  {mostrarProjeto && m.projeto && <Link to={`/projetos/${m.projeto.id}`} className="font-mono font-semibold text-brand-700 hover:underline">{m.projeto.codigo}</Link>}
                  {(m.etapa?.codigo || m.etapa) && <span className="font-mono">{m.etapa?.codigo ?? `Etapa ${m.etapa}`}</span>}
                  {(m.atividade?.nome || (typeof m.atividade === 'string' && m.atividade)) && <span>· {m.atividade?.nome ?? m.atividade}</span>}
                  {m.importada && <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">importada</span>}
                </div>
                <div className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">{m.descricao}</div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function descreverEvento(e: any) {
  if (e.acao === 'STATUS_CHANGE') return <>Status de {e.modulo === 'Projetos' ? 'projeto' : e.modulo === 'Etapas' ? 'etapa' : 'atividade'} <b>{e.rotulo}</b> alterado: {e.anterior ?? '—'} <ArrowRight className="inline h-3 w-3" /> <b>{e.novo}</b></>;
  if (e.acao === 'CREATE') return <>{e.modulo === 'Projetos' ? 'Projeto criado' : e.modulo === 'Etapas' ? 'Etapa criada' : 'Atividade criada'}: <b>{e.rotulo}</b></>;
  if (e.acao === 'DOCUMENT_UPLOAD') return <>Documento anexado: {e.novo}</>;
  return <>{e.campo} de <b>{e.rotulo}</b> alterado: {e.anterior ?? '—'} <ArrowRight className="inline h-3 w-3" /> <b>{e.novo ?? '—'}</b></>;
}

/** Tabela de auditoria (usada no histórico do projeto e no log completo). */
export function AuditTable({ url, filtros, page, onPage, semProjeto }: { url: string; filtros?: Record<string, unknown>; page: number; onPage: (p: number) => void; semProjeto?: boolean }) {
  const q = qs({ ...filtros, page, pageSize: 25 });
  const { data, isLoading } = useQuery({ queryKey: ['audit', url, q], queryFn: () => get(`${url}${q}`), placeholderData: (p) => p });
  const [open, setOpen] = useState<number | null>(null);
  if (isLoading) return <Loading />;
  if (!data?.itens.length) return <Empty>Nenhum registro de auditoria encontrado.</Empty>;
  return (
    <>
      <Table>
        <thead><tr><Th className="w-6" /><Th>Data / hora</Th><Th>Usuário</Th><Th>Ação</Th><Th>Módulo</Th><Th>Registro</Th><Th>Campo</Th><Th>Anterior</Th><Th>Novo</Th></tr></thead>
        <tbody>
          {data.itens.map((l: any) => (
            <Fragment key={l.id}>
              <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(open === l.id ? null : l.id)}>
                <Td>{open === l.id ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}</Td>
                <Td className="whitespace-nowrap text-slate-600">{fmtDataHora(l.dataHora)}</Td><Td>{l.usuarioNome ?? '—'}</Td>
                <Td><Badge color={l.acao === 'LOGIN_FAILED' || l.acao === 'DELETE' ? '#dc2626' : l.acao === 'STATUS_CHANGE' ? '#d97706' : l.acao === 'PERMISSION_CHANGE' ? '#9333ea' : '#2f6fbf'}>{ACOES[l.acao] ?? l.acao}</Badge></Td>
                <Td>{l.modulo}</Td><Td className="font-mono text-xs">{l.registroRotulo ?? l.registroId ?? '—'}</Td><Td>{l.campo ?? '—'}</Td>
                <Td className="max-w-[220px] truncate text-slate-500" title={l.valorAnterior ?? ''}>{l.valorAnterior ?? '—'}</Td><Td className="max-w-[220px] truncate font-medium" title={l.valorNovo ?? ''}>{l.valorNovo ?? '—'}</Td>
              </tr>
              {open === l.id && (
                <tr><td colSpan={9} className="border-b border-slate-100 bg-slate-50 px-6 py-3 text-xs text-slate-600">
                  <div className={cx('grid gap-x-8 gap-y-1', 'sm:grid-cols-2')}>
                    <div><b>IP:</b> {l.ip ?? 'não disponível'}</div><div><b>ID do registro:</b> {l.registroId ?? '—'}</div>
                    {!semProjeto && l.projetoId && <div><b>Projeto:</b> <Link className="text-brand-700 hover:underline" to={`/projetos/${l.projetoId}`}>abrir</Link></div>}
                    <div className="sm:col-span-2"><b>Valor anterior:</b> <span className="whitespace-pre-wrap">{l.valorAnterior ?? '—'}</span></div>
                    <div className="sm:col-span-2"><b>Novo valor:</b> <span className="whitespace-pre-wrap">{l.valorNovo ?? '—'}</span></div>
                    {l.info && <div className="sm:col-span-2"><b>Informações adicionais:</b> <code className="break-all">{JSON.stringify(l.info)}</code></div>}
                  </div>
                </td></tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </Table>
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={onPage} />
    </>
  );
}
