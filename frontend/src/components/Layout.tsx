import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, CalendarClock, CheckSquare, ClipboardList, FileText, FolderKanban, Home, KeyRound, LogOut, Menu, RefreshCw, ScrollText, Search, Settings, ShieldAlert, Users, UserCog, AlertTriangle, BarChart3, FileUp } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { get } from '../lib/api';
import { Logo, cx } from './ui';
import { NotificationBell } from './NotificationBell';

const MENU: { to: string; label: string; icon: any; perm?: string; end?: boolean }[] = [
  { to: '/', label: 'Dashboard', icon: Home, perm: 'dashboard.view', end: true },
  { to: '/projetos', label: 'Projetos', icon: FolderKanban, perm: 'projects.view' },
  { to: '/etapas', label: 'Etapas', icon: ClipboardList, perm: 'stages.view' },
  { to: '/atividades', label: 'Atividades', icon: CheckSquare, perm: 'activities.view' },
  { to: '/movimentacoes', label: 'Movimentações', icon: RefreshCw, perm: 'movements.view' },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3, perm: 'reports.view' },
  { to: '/usuarios', label: 'Usuários e perfis', icon: UserCog, perm: 'users.view' },
  { to: '/importar', label: 'Importar dados', icon: FileUp, perm: 'import.manage' },
  { to: '/auditoria', label: 'Auditoria', icon: ScrollText, perm: 'audit.view' },
  { to: '/configuracoes', label: 'Configurações', icon: Settings, perm: 'settings.manage' },
];

function GlobalSearch() {
  const [q, setQ] = useState(''); const [dq, setDq] = useState(''); const [open, setOpen] = useState(false);
  const nav = useNavigate(); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => { const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);
  const { data } = useQuery({ queryKey: ['search', dq], queryFn: () => get(`/search?q=${encodeURIComponent(dq)}`), enabled: dq.length > 0 });
  const go = (to: string) => { setOpen(false); setQ(''); nav(to); };
  const vazio = data && !data.projetos.length && !data.etapas.length && !data.atividades.length;
  return (
    <div ref={ref} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Buscar por código, nome, etapa, atividade, responsável…"
        className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
      {open && dq && data && (
        <div className="absolute left-0 right-0 top-11 z-40 max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
          {vazio && <div className="px-4 py-6 text-center text-sm text-slate-400">Nada encontrado para “{dq}”.</div>}
          {data.projetos.length > 0 && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Projetos</div>}
          {data.projetos.map((p: any) => <button key={p.id} onClick={() => go(`/projetos/${p.id}`)} className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-slate-50"><span className="w-12 shrink-0 font-mono text-xs font-semibold text-brand-700">{p.codigo}</span><span className="truncate">{p.nome}</span><span className="ml-auto shrink-0 text-xs text-slate-400">{p.status}</span></button>)}
          {data.etapas.length > 0 && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Etapas</div>}
          {data.etapas.map((e: any) => <button key={e.id} onClick={() => go(`/projetos/${e.projetoId}?aba=etapas`)} className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-slate-50"><span className="w-14 shrink-0 font-mono text-xs font-semibold text-brand-700">{e.codigo}</span><span className="truncate">{e.nome}</span></button>)}
          {data.atividades.length > 0 && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Atividades</div>}
          {data.atividades.map((a: any) => <button key={a.id} onClick={() => go(`/projetos/${a.projetoId}?aba=atividades`)} className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-slate-50"><span className="w-14 shrink-0 font-mono text-xs font-semibold text-brand-700">{a.codigo}</span><span className="truncate">{a.nome}</span></button>)}
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { me, can, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false); const [menu, setMenu] = useState(false);
  const items = MENU.filter((m) => !m.perm || can(m.perm));
  return (
    <div className="flex h-full">
      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cx('fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-brand-900 text-slate-200 transition-transform lg:static lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
          <Logo light />
          <div className="leading-tight"><div className="text-[13px] font-semibold text-white">Controle BSC</div><div className="text-[11px] text-brand-200">APD / UPD</div></div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
          {items.map((m) => (
            <NavLink key={m.to} to={m.to} end={m.end} onClick={() => setOpen(false)} className={({ isActive }) => cx('flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors', isActive ? 'bg-white/12 text-white' : 'text-slate-300 hover:bg-white/8 hover:text-white')}>
              <m.icon className="h-4 w-4 shrink-0 opacity-90" />{m.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-4 py-3 text-[11px] text-slate-400">Versão 0.6.0 · Fases 1–6</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:px-6">
          <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu"><Menu className="h-5 w-5" /></button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <div className="relative">
              <button onClick={() => setMenu((v) => !v)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-slate-100">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">{me?.nome.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()}</span>
                <span className="hidden text-left leading-tight sm:block"><span className="block text-[13px] font-medium text-slate-800">{me?.nome}</span><span className="block text-[11px] text-slate-500">{me?.perfil}</span></span>
              </button>
              {menu && (
                <div className="absolute right-0 top-11 z-40 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-xl" onMouseLeave={() => setMenu(false)}>
                  <button onClick={() => { setMenu(false); nav('/trocar-senha'); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"><KeyRound className="h-4 w-4 text-slate-400" />Alterar senha</button>
                  <button onClick={() => logout()} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"><LogOut className="h-4 w-4" />Sair</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8"><div className="mx-auto max-w-[1400px]"><Outlet /></div></main>
      </div>
    </div>
  );
}
void ShieldAlert;
