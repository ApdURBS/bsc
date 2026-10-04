import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { get } from '../lib/api';
import { Card, Empty, Loading, Opts, Select, Table, Td, Th, cx } from '../components/ui';
import { useFrentes, usePessoas } from '../lib/queries';
import { fmtData, fmtDataHora, hojeISO, somaDias, SITUACAO } from '../lib/format';

const AZUL = '#2f6fbf';
const tip = { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 };
const eixo = { fontSize: 12, fill: '#64748b' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (m: string) => `${MESES[Number(m.slice(5)) - 1]}/${m.slice(2, 4)}`;

function Tile({ label, value, hint, to }: { label: string; value: React.ReactNode; hint?: string; to?: string }) {
  const body = (<><div className="text-2xl font-semibold tabular-nums text-slate-900">{value}</div><div className="mt-0.5 text-xs text-slate-500">{label}</div>{hint && <div className="mt-1 text-[11px] text-slate-400">{hint}</div>}</>);
  const cls = 'rounded-lg border border-slate-200 bg-white p-4';
  return to ? <Link to={to} className={cx(cls, 'block transition hover:border-brand-500 hover:shadow-md')}>{body}</Link> : <div className={cls}>{body}</div>;
}

// ───────────── Projetos sem movimentação recente ─────────────
export function InatividadeCard() {
  const { data } = useQuery({ queryKey: ['inatividade'], queryFn: () => get('/dashboard/inatividade') });
  const nav = useNavigate();
  if (!data) return null;
  return (
    <Card className="mt-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-800">Projetos sem movimentação recente <span className="font-normal text-slate-400">(&gt; {data.dias} dias)</span></div>
        <Link to="/projetos?card=semMovimentacao" className="text-xs text-brand-700 hover:underline">Ver lista completa</Link>
      </div>
      {data.itens.length === 0 ? <Empty>Nenhum projeto parado. Todos tiveram movimentação recente.</Empty> : (
        <Table>
          <thead><tr><Th>Projeto</Th><Th>Última movimentação</Th><Th>Usuário</Th><Th>Dias parado</Th><Th>Scrum Master (etapas)</Th><Th>Dono</Th></tr></thead>
          <tbody>{data.itens.slice(0, 8).map((p: any) => (
            <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/projetos/${p.id}?aba=movimentacoes`)}>
              <Td><span className="font-mono text-[13px] font-semibold text-brand-800">{p.codigo}</span> <span className="text-slate-600">{p.nome}</span></Td>
              <Td>{p.ultimaMovimentacaoEm ? fmtDataHora(p.ultimaMovimentacaoEm) : 'Nenhuma'}</Td><Td>{p.usuario ?? '—'}</Td>
              <Td className="font-semibold tabular-nums text-amber-700">{p.diasSemMovimentacao}</Td><Td>{p.scrumMasters ?? '—'}</Td><Td>{p.dono ?? '—'}</Td>
            </tr>))}</tbody>
        </Table>)}
    </Card>
  );
}

// ───────────── Prazos ─────────────
export function PrazosPanel() {
  const { data } = useQuery({ queryKey: ['dash-prazos'], queryFn: () => get('/dashboard/prazos') });
  const nav = useNavigate(); const h = hojeISO();
  if (!data) return <Loading />;
  const faixas: { k: string; label: string; to?: string }[] = [
    { k: 'vencidos', label: 'Vencidos', to: '?situacaoPrazo=VENCIDO' },
    { k: 'ate7', label: 'Até 7 dias', to: `?card=vigentes&prazoDe=${h}&prazoAte=${somaDias(h, 7)}` },
    { k: 'ate15', label: '8 a 15 dias', to: `?card=vigentes&prazoDe=${somaDias(h, 8)}&prazoAte=${somaDias(h, 15)}` },
    { k: 'ate30', label: '16 a 30 dias', to: `?card=vigentes&prazoDe=${somaDias(h, 16)}&prazoAte=${somaDias(h, 30)}` },
    { k: 'ate60', label: '31 a 60 dias', to: `?card=vigentes&prazoDe=${somaDias(h, 31)}&prazoAte=${somaDias(h, 60)}` },
    { k: 'ate90', label: '61 a 90 dias', to: `?card=vigentes&prazoDe=${somaDias(h, 61)}&prazoAte=${somaDias(h, 90)}` },
    { k: 'mais90', label: 'Mais de 90 dias', to: `?card=vigentes&prazoDe=${somaDias(h, 91)}` },
    { k: 'semPrazo', label: 'Sem prazo definido', to: '?situacaoPrazo=SEM_PRAZO' },
  ];
  const sit: [string, string][] = [['normal', 'NORMAL'], ['atencao', 'ATENCAO'], ['critico', 'CRITICO'], ['vencido', 'VENCIDO']];
  const lista = (titulo: string, itens: any[], atraso: boolean) => (
    <Card className="p-4">
      <div className="mb-2 text-sm font-semibold text-slate-800">{titulo}</div>
      {itens.length === 0 ? <Empty>Nada por aqui.</Empty> : (
        <ul className="divide-y divide-slate-100">{itens.map((e) => (
          <li key={e.id} className="flex cursor-pointer items-center gap-3 py-2 hover:bg-slate-50" onClick={() => nav(`/projetos/${e.projetoId}?aba=etapas`)}>
            <span className="font-mono text-[13px] font-semibold text-brand-800">{e.codigo}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-700" title={e.nome}>{e.nome}<span className="block text-xs text-slate-400">{e.responsavel ?? 'Sem responsável'} · {fmtData(e.prevista)}</span></span>
            <span className={cx('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', atraso ? 'bg-red-50 text-red-700' : e.dias <= data.limites.critico ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-600')}>{atraso ? `${e.dias} dia${e.dias === 1 ? '' : 's'} em atraso` : e.dias === 0 ? 'vence hoje' : `${e.dias} dia${e.dias === 1 ? '' : 's'}`}</span>
          </li>))}</ul>)}
    </Card>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {sit.map(([k, s]) => (
          <Link key={k} to={`/projetos?situacaoPrazo=${s}`} className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-brand-500 hover:shadow-md">
            <div className="flex items-center gap-2"><span className={cx('h-2.5 w-2.5 rounded-full', SITUACAO[s].dot)} /><span className={cx('text-xs font-medium', SITUACAO[s].text)}>{SITUACAO[s].label}</span></div>
            <div className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{data.situacao[k]}</div>
            <div className="text-[11px] text-slate-400">{s === 'ATENCAO' ? `faltam até ${data.limites.atencao} dias` : s === 'CRITICO' ? `faltam até ${data.limites.critico} dias` : s === 'VENCIDO' ? 'prazo ultrapassado' : 'projetos vigentes'}</div>
          </Link>))}
      </div>
      <p className="text-[11px] text-slate-400">Os limites de Atenção e Prazo crítico são configurados pelo administrador em Configurações → Prazos.</p>
      <Card className="p-4">
        <div className="mb-2 text-sm font-semibold text-slate-800">Vencimentos por período</div>
        <Table>
          <thead><tr><Th>Período</Th><Th className="text-right">Projetos vigentes</Th><Th className="text-right">Etapas abertas</Th></tr></thead>
          <tbody>{faixas.map((f) => (
            <tr key={f.k} className="hover:bg-slate-50">
              <Td>{f.label}</Td>
              <Td className="text-right tabular-nums">{f.to ? <Link to={`/projetos${f.to}`} className="font-semibold text-brand-700 hover:underline">{data.projetos[f.k]}</Link> : data.projetos[f.k]}</Td>
              <Td className="text-right tabular-nums">{f.k === 'vencidos' ? <Link to="/etapas?situacaoPrazo=VENCIDO" className="font-semibold text-brand-700 hover:underline">{data.etapas[f.k]}</Link> : data.etapas[f.k]}</Td>
            </tr>))}</tbody>
        </Table>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">{lista('Etapas atrasadas (mais antigas primeiro)', data.atrasadas, true)}{lista('Próximos vencimentos de etapas', data.proximos, false)}</div>
    </div>
  );
}

// ───────────── Scrum Master ─────────────
const SERIES = [
  { k: 'andamento', nome: 'Em andamento', cor: '#2563eb', card: 'andamento' },
  { k: 'atrasados', nome: 'Atrasados', cor: '#dc2626', card: 'atrasados' },
  { k: 'finalizados', nome: 'Finalizados', cor: '#16a34a', card: 'finalizados' },
  { k: 'bloqueados', nome: 'Bloqueados', cor: '#9333ea', card: 'bloqueados' },
];
export function ScrumPanel() {
  const { data } = useQuery({ queryKey: ['por-scrum'], queryFn: () => get('/dashboard/por-scrum') });
  const nav = useNavigate();
  if (!data) return <Loading />;
  if (!data.length) return <Card className="p-4"><Empty>Nenhuma etapa com Scrum Master definido ainda. Informe o Scrum Master ao criar ou editar uma etapa.</Empty></Card>;
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 text-sm font-semibold text-slate-800">Projetos por Scrum Master</div>
        <div style={{ height: Math.max(200, data.length * 56 + 60) }}>
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ left: 10, right: 24 }} barCategoryGap={14}>
              <CartesianGrid horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" allowDecimals={false} tick={eixo} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={tip} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#475569' }} />
              {SERIES.map((s) => <Bar key={s.k} dataKey={s.k} name={s.nome} fill={s.cor} barSize={9} radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: any) => nav(`/projetos?scrumMasterId=${d.id}&card=${s.card}`)} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">Clique em uma barra para abrir os projetos. O Scrum Master é definido em cada etapa; um projeto conta para todos os Scrum Masters das suas etapas.</p>
      </Card>
      <Card className="p-4">
        <Table>
          <thead><tr><Th>Scrum Master</Th><Th className="text-right">Projetos</Th>{SERIES.map((s) => <Th key={s.k} className="text-right">{s.nome}</Th>)}</tr></thead>
          <tbody>{data.map((r: any) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <Td className="font-medium">{r.nome}</Td>
              <Td className="text-right tabular-nums"><Link className="font-semibold text-brand-700 hover:underline" to={`/projetos?scrumMasterId=${r.id}`}>{r.projetos}</Link></Td>
              {SERIES.map((s) => <Td key={s.k} className="text-right tabular-nums"><Link className="text-slate-700 hover:text-brand-700 hover:underline" to={`/projetos?scrumMasterId=${r.id}&card=${s.card}`}>{r[s.k]}</Link></Td>)}
            </tr>))}</tbody>
        </Table>
      </Card>
    </div>
  );
}

// ───────────── Equipe ─────────────
export function EquipePanel() {
  const { data } = useQuery({ queryKey: ['por-equipe'], queryFn: () => get('/dashboard/por-equipe') });
  if (!data) return <Loading />;
  if (!data.length) return <Card className="p-4"><Empty>Nenhuma pessoa vinculada às etapas ainda. Informe responsável, Scrum Master ou equipe nas etapas.</Empty></Card>;
  const col = (k: string, l: string, tom?: string) => ({ k, l, tom });
  const cols = [col('projetos', 'Projetos'), col('etapas', 'Etapas'), col('atividades', 'Atividades'), col('atrasos', 'Atrasos', 'text-red-700'), col('finalizacoes', 'Finalizações', 'text-emerald-700'), col('pendencias', 'Pendências', 'text-amber-700')];
  return (
    <Card className="p-4">
      <Table>
        <thead><tr><Th>Pessoa</Th>{cols.map((c) => <Th key={c.k} className="text-right">{c.l}</Th>)}</tr></thead>
        <tbody>{data.map((r: any) => (
          <tr key={r.id} className="hover:bg-slate-50">
            <Td className="font-medium">{r.nome}</Td>
            {cols.map((c) => <Td key={c.k} className={cx('text-right tabular-nums', r[c.k] > 0 && c.tom)}>
              {c.k === 'projetos' ? <Link className="font-semibold text-brand-700 hover:underline" to={`/projetos?responsavelId=${r.id}`}>{r[c.k]}</Link>
                : c.k === 'etapas' ? <Link className="font-semibold text-brand-700 hover:underline" to={`/etapas?responsavelId=${r.id}`}>{r[c.k]}</Link>
                : c.k === 'atrasos' && r[c.k] > 0 ? <Link className="font-semibold hover:underline" to={`/etapas?responsavelId=${r.id}&situacaoPrazo=VENCIDO`}>{r[c.k]}</Link> : r[c.k]}
            </Td>)}
          </tr>))}</tbody>
      </Table>
      <p className="mt-3 text-[11px] text-slate-400">Considera as etapas em que a pessoa é responsável, Scrum Master ou membro da equipe. Atividades: as sob responsabilidade da pessoa. Atrasos: etapas vencidas ou com status Atrasado. Pendências: etapas ainda abertas.</p>
    </Card>
  );
}

// ───────────── Indicadores gerenciais + movimentações por mês ─────────────
export function IndicadoresPanel() {
  const { data } = useQuery({ queryKey: ['indicadores'], queryFn: () => get('/dashboard/indicadores') });
  const frentes = useFrentes(), pessoas = usePessoas();
  const projetos = useQuery({ queryKey: ['proj-select'], queryFn: () => get('/projects?pageSize=200&sort=codigo'), staleTime: 60_000 });
  const [f, setF] = useState({ projetoId: '', frenteId: '', usuarioId: '', scrumMasterId: '', membroId: '', meses: '12' });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const mov = useQuery({ queryKey: ['mov-mes', qs], queryFn: () => get(`/dashboard/movimentacoes-mes?${qs}`) });
  const nav = useNavigate();
  if (!data) return <Loading />;
  const p = data.percentuais, c = data.contagens;
  const dias = (v: number | null) => (v == null ? '—' : `${v} dias`);
  const sel = (k: keyof typeof f, label: string, items: any[] | undefined) => <Select aria-label={label} className="!w-44" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}><Opts items={items} empty={label} /></Select>;
  const temFiltro = Object.entries(f).some(([k, v]) => k !== 'meses' && v);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 md:grid-cols-3">
        <Tile label="Total de projetos" value={data.totais.projetos} to="/projetos?card=total" />
        <Tile label="Total de etapas" value={data.totais.etapas} to="/etapas" />
        <Tile label="Total de atividades" value={data.totais.atividades} to="/atividades" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile label="% concluído" value={`${p.concluido}%`} hint={`${c.concluido} projetos`} to="/projetos?card=finalizados" />
        <Tile label="% em andamento" value={`${p.andamento}%`} hint={`${c.andamento} projetos`} to="/projetos?card=andamento" />
        <Tile label="% atrasado" value={`${p.atrasado}%`} hint={`${c.atrasado} projetos`} to="/projetos?card=atrasados" />
        <Tile label="% bloqueado" value={`${p.bloqueado}%`} hint={`${c.bloqueado} projetos`} to="/projetos?card=bloqueados" />
        <Tile label="% suspenso" value={`${p.suspenso}%`} hint={`${c.suspenso} projetos`} to="/projetos?card=suspensos" />
        <Tile label="% próximo do vencimento" value={`${p.proximoVencimento}%`} hint={`${c.proximoVencimento} projetos (atenção ou crítico)`} to="/projetos?situacaoPrazo=CRITICO" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Prazo médio dos projetos" value={dias(data.prazoMedioDias)} hint="data de início → prazo previsto" />
        <Tile label="Tempo médio de conclusão" value={dias(data.tempoMedioConclusaoDias)} hint="projetos finalizados" />
        <Tile label="Sem movimentação" value={c.semMovimentacao} hint={`parados há mais de ${data.diasInatividade} dias`} to="/projetos?card=semMovimentacao" />
        <Tile label="Etapas atrasadas" value={c.etapasAtrasadas} to="/etapas?situacaoPrazo=VENCIDO" />
      </div>
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="mr-auto text-sm font-semibold text-slate-800">Movimentações por mês</div>
          {sel('frenteId', 'Frente', frentes.data)}
          {sel('projetoId', 'Projeto', projetos.data?.itens.map((x: any) => ({ id: x.id, nome: `${x.codigo} — ${x.nome}` })))}
          {sel('usuarioId', 'Usuário', pessoas.data)}
          {sel('scrumMasterId', 'Scrum Master', pessoas.data)}
          {sel('membroId', 'Equipe', pessoas.data)}
          <Select aria-label="Período" className="!w-32" value={f.meses} onChange={(e) => setF({ ...f, meses: e.target.value })}>{['6', '12', '24'].map((m) => <option key={m} value={m}>{m} meses</option>)}</Select>
          {temFiltro && <button className="text-xs text-brand-700 hover:underline" onClick={() => setF({ ...f, projetoId: '', frenteId: '', usuarioId: '', scrumMasterId: '', membroId: '' })}>Limpar filtros</button>}
        </div>
        <div className="h-64">
          {mov.data && (
            <ResponsiveContainer>
              <BarChart data={mov.data.map((m: any) => ({ ...m, rotulo: rotuloMes(m.mes) }))} margin={{ top: 16, right: 8 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="rotulo" tick={eixo} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={eixo} axisLine={false} tickLine={false} width={32} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(v) => [String(v), 'Movimentações']} contentStyle={tip} />
                <Bar dataKey="total" fill={AZUL} barSize={18} radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d: any) => nav(`/movimentacoes?de=${d.mes}-01`)} />
              </BarChart>
            </ResponsiveContainer>)}
        </div>
        {mov.data && <p className="mt-1 text-[11px] text-slate-400">{mov.data.reduce((s: number, x: any) => s + x.total, 0)} movimentações no período. Passe o mouse para ver o valor de cada mês.</p>}
      </Card>
    </div>
  );
}
