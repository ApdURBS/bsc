import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, CalendarClock, Clock, UserX } from 'lucide-react';
import { get, post } from '../lib/api';
import { cx } from './ui';
import { fmtDataHora } from '../lib/format';

export const TIPO_NOTIF: Record<string, { icon: any; tom: string; nome: string }> = {
  PRAZO_PROXIMO: { icon: CalendarClock, tom: 'text-orange-600 bg-orange-50', nome: 'Prazo próximo' },
  ATRASO: { icon: AlertTriangle, tom: 'text-red-600 bg-red-50', nome: 'Atraso' },
  SEM_MOVIMENTACAO: { icon: Clock, tom: 'text-amber-600 bg-amber-50', nome: 'Sem movimentação' },
  ETAPAS_ATRASADAS_USUARIO: { icon: UserX, tom: 'text-purple-600 bg-purple-50', nome: 'Etapas atrasadas' },
};
export const destinoNotif = (n: any) => (n.projetoId ? `/projetos/${n.projetoId}${n.etapaId ? '?aba=etapas' : ''}` : '/notificacoes');

export function useNotifMutations() {
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: ['notif'] }); };
  return {
    ler: useMutation({ mutationFn: (id: number) => post(`/notifications/${id}/read`), onSuccess: refresh }),
    lerTodas: useMutation({ mutationFn: () => post('/notifications/read-all'), onSuccess: refresh }),
  };
}

export function NotificationBell() {
  const [open, setOpen] = useState(false); const nav = useNavigate(); const ref = useRef<HTMLDivElement>(null);
  const cont = useQuery({ queryKey: ['notif', 'count'], queryFn: () => get('/notifications/count'), refetchInterval: 60_000 });
  const lista = useQuery({ queryKey: ['notif', 'recentes'], queryFn: () => get('/notifications?pageSize=8'), enabled: open });
  const { ler, lerTodas } = useNotifMutations();
  useEffect(() => { const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);
  const n = cont.data?.naoLidas ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100" title="Notificações" aria-label={`Notificações${n ? ` (${n} não lidas)` : ''}`}>
        <Bell className="h-5 w-5" />
        {n > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">{n > 99 ? '99+' : n}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-[380px] max-w-[92vw] rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <div className="whitespace-nowrap text-sm font-semibold text-slate-800">Notificações{n > 0 && <span className="font-normal text-slate-400"> ({n})</span>}</div>
            {n > 0 && <button className="whitespace-nowrap text-xs text-brand-700 hover:underline" onClick={() => lerTodas.mutate()}>Marcar todas como lidas</button>}
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {!lista.data ? <div className="py-8 text-center text-sm text-slate-400">Carregando…</div> : lista.data.itens.length === 0 ? <div className="py-10 text-center text-sm text-slate-400">Nenhuma notificação.</div> : lista.data.itens.map((x: any) => {
              const t = TIPO_NOTIF[x.tipo] ?? TIPO_NOTIF.ATRASO;
              return (
                <button key={x.id} onClick={() => { if (!x.lidaEm) ler.mutate(x.id); setOpen(false); nav(destinoNotif(x)); }} className={cx('flex w-full items-start gap-3 border-b border-slate-50 px-4 py-2.5 text-left hover:bg-slate-50', !x.lidaEm && 'bg-brand-50/40')}>
                  <span className={cx('mt-0.5 rounded-md p-1.5', t.tom)}><t.icon className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0 flex-1"><span className={cx('block text-[13px]', x.lidaEm ? 'text-slate-500' : 'font-medium text-slate-800')}>{x.mensagem}</span><span className="text-[11px] text-slate-400">{fmtDataHora(x.createdAt)}</span></span>
                  {!x.lidaEm && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Não lida" />}
                </button>);
            })}
          </div>
          <button className="w-full border-t border-slate-100 py-2.5 text-center text-xs font-medium text-brand-700 hover:bg-slate-50" onClick={() => { setOpen(false); nav('/notificacoes'); }}>Ver todas as notificações</button>
        </div>
      )}
    </div>
  );
}
