import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertOctagon, CheckCircle2, Clock, FolderKanban, Hourglass, PauseCircle, PlayCircle, ShieldAlert } from 'lucide-react';
import { get } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Card, Loading, PageHeader, Tabs, cx } from '../components/ui';
import { EquipePanel, InatividadeCard, IndicadoresPanel, PrazosPanel, ScrumPanel } from './DashboardPanels';
import { fmtDataHora, hojeISO, somaDias } from '../lib/format';

const CARDS: { key: string; label: string; icon: any; tone: string }[] = [
  { key: 'total', label: 'Total de projetos', icon: FolderKanban, tone: 'text-slate-600 bg-slate-100' },
  { key: 'vigentes', label: 'Projetos vigentes', icon: PlayCircle, tone: 'text-brand-700 bg-brand-50' },
  { key: 'andamento', label: 'Em andamento', icon: Hourglass, tone: 'text-blue-700 bg-blue-50' },
  { key: 'finalizados', label: 'Finalizados', icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-50' },
  { key: 'atrasados', label: 'Atrasados', icon: AlertOctagon, tone: 'text-red-700 bg-red-50' },
  { key: 'bloqueados', label: 'Bloqueados', icon: ShieldAlert, tone: 'text-purple-700 bg-purple-50' },
  { key: 'suspensos', label: 'Suspensos', icon: PauseCircle, tone: 'text-stone-600 bg-stone-100' },
  { key: 'semMovimentacao', label: 'Sem movimentação recente', icon: Clock, tone: 'text-amber-700 bg-amber-50' },
];

function MeusProjetos() {
  const q = (extra: string) => useQuery({ queryKey: ['meus', extra], queryFn: () => get(`/projects?meus=1&pageSize=1${extra}`) });
  const total = q('&card=vigentes'), and = q('&card=andamento'), atr = q('&card=atrasados'), sem = q('&card=semMovimentacao');
  const item = (label: string, v: any, qs: string) => (
    <Link to={`/projetos?meus=1${qs}`} className="rounded-md px-3 py-2 hover:bg-slate-50"><div className="text-2xl font-semibold tabular-nums text-slate-800">{v.data?.total ?? '–'}</div><div className="text-xs text-slate-500">{label}</div></Link>
  );
  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-semibold text-slate-800">Meus projetos</div>
      <div className="grid grid-cols-2 gap-1">{item('Vigentes', total, '&card=vigentes')}{item('Em andamento', and, '&card=andamento')}{item('Atrasados', atr, '&card=atrasados')}{item('Sem movimentação', sem, '&card=semMovimentacao')}</div>
      <p className="mt-2 px-3 text-[11px] text-slate-400">Considera os projetos em que você participa (dono, Scrum Master, equipe ou responsável por etapa).</p>
    </Card>
  );
}

function VisaoGeral() {
  const nav = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => get('/dashboard/summary') });
  if (isLoading || !data) return <Loading />;
  const h = hojeISO();
  const buckets: { k: string; label: string; to: string; tone: string }[] = [
    { k: 'vencidos', label: 'Vencidos', to: '?situacaoPrazo=VENCIDO', tone: 'bg-red-500' },
    { k: 'ate7', label: 'Até 7 dias', to: `?card=vigentes&prazoDe=${h}&prazoAte=${somaDias(h, 7)}`, tone: 'bg-orange-500' },
    { k: 'ate15', label: 'Até 15 dias', to: `?card=vigentes&prazoDe=${somaDias(h, 8)}&prazoAte=${somaDias(h, 15)}`, tone: 'bg-yellow-400' },
    { k: 'ate30', label: 'Até 30 dias', to: `?card=vigentes&prazoDe=${somaDias(h, 16)}&prazoAte=${somaDias(h, 30)}`, tone: 'bg-yellow-300' },
    { k: 'ate60', label: 'Até 60 dias', to: `?card=vigentes&prazoDe=${somaDias(h, 31)}&prazoAte=${somaDias(h, 60)}`, tone: 'bg-emerald-400' },
    { k: 'ate90', label: 'Até 90 dias', to: `?card=vigentes&prazoDe=${somaDias(h, 61)}&prazoAte=${somaDias(h, 90)}`, tone: 'bg-emerald-500' },
    { k: 'mais90', label: 'Mais de 90 dias', to: `?card=vigentes&prazoDe=${somaDias(h, 91)}`, tone: 'bg-emerald-600' },
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {CARDS.map((c) => (
          <button key={c.key} onClick={() => nav(`/projetos?card=${c.key}`)} className="group rounded-lg border border-slate-200 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-brand-500 hover:shadow-md">
            <div className="flex items-center justify-between"><span className={cx('rounded-md p-1.5', c.tone)}><c.icon className="h-4 w-4" /></span></div>
            <div className="mt-3 text-3xl font-semibold tabular-nums text-slate-900">{data.cards[c.key]}</div>
            <div className="text-xs text-slate-500 group-hover:text-brand-700">{c.label}{c.key === 'semMovimentacao' && ` (> ${data.diasInatividade} dias)`}</div>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 text-sm font-semibold text-slate-800">Projetos por frente</div>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={data.porFrente} layout="vertical" margin={{ left: 10, right: 24 }}>
                <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(v) => [String(v), 'Projetos']} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Bar dataKey="total" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: any) => nav(`/projetos?frenteId=${d.id}`)}>
                  {data.porFrente.map((f: any) => <Cell key={f.id} fill="#2f6fbf" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Clique em uma barra para abrir os projetos da frente.</p>
        </Card>
        <div className="space-y-4">
          <MeusProjetos />
          <Card className="p-4">
            <div className="mb-2 text-sm font-semibold text-slate-800">Projetos vigentes por prazo</div>
            <div className="space-y-1">
              {buckets.map((b) => (
                <Link key={b.k} to={`/projetos${b.to}`} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                  <span className={cx('h-2.5 w-2.5 rounded-full', b.tone)} /><span className="flex-1 text-slate-600">{b.label}</span><span className="font-semibold tabular-nums text-slate-800">{data.prazos[b.k]}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <InatividadeCard />

      <Card className="mt-4 p-4">
        <div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold text-slate-800">Atividades recentes</div><Link to="/movimentacoes" className="text-xs text-brand-700 hover:underline">Ver todas</Link></div>
        {data.atividadesRecentes.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Nenhuma movimentação registrada ainda.</p>}
        <ol className="relative space-y-4 border-l border-slate-200 pl-5">
          {data.atividadesRecentes.map((m: any) => (
            <li key={m.id} className="relative">
              <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-brand-500 ring-4 ring-white" />
              <div className="text-xs text-slate-400">{fmtDataHora(m.dataHora)} · {m.usuario}</div>
              <div className="text-sm text-slate-700"><Link to={`/projetos/${m.projetoId}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">{m.projetoCodigo}</Link> <span className="text-slate-400">·</span> {m.descricao}</div>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}

const ABAS = [{ id: 'geral', label: 'Visão geral' }, { id: 'prazos', label: 'Prazos' }, { id: 'scrum', label: 'Scrum Master' }, { id: 'equipe', label: 'Equipe' }, { id: 'indicadores', label: 'Indicadores' }];

export default function Dashboard() {
  const { me } = useAuth(); const [sp, setSp] = useSearchParams();
  const aba = ABAS.some((a) => a.id === sp.get('aba')) ? sp.get('aba')! : 'geral';
  return (
    <>
      <PageHeader title={`Olá, ${me?.nome.split(' ')[0]}`} subtitle="Controle BSC — APD/UPD · visão executiva dos projetos" />
      <Tabs tabs={ABAS} active={aba} onChange={(id) => setSp(id === 'geral' ? {} : { aba: id }, { replace: true })} />
      <div className="mt-4">
        {aba === 'geral' && <VisaoGeral />}{aba === 'prazos' && <PrazosPanel />}{aba === 'scrum' && <ScrumPanel />}{aba === 'equipe' && <EquipePanel />}{aba === 'indicadores' && <IndicadoresPanel />}
      </div>
    </>
  );
}
