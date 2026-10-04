import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';
import { Button, Card, Empty, Loading, PageHeader, Pagination, cx } from '../components/ui';
import { TIPO_NOTIF, destinoNotif, useNotifMutations } from '../components/NotificationBell';
import { fmtDataHora } from '../lib/format';

export default function NotificationsPage() {
  const [naoLidas, setNaoLidas] = useState(false); const [page, setPage] = useState(1); const nav = useNavigate();
  const { data } = useQuery({ queryKey: ['notif', 'lista', naoLidas, page], queryFn: () => get(`/notifications?page=${page}&pageSize=20${naoLidas ? '&naoLidas=1' : ''}`) });
  const { ler, lerTodas } = useNotifMutations();
  return (
    <>
      <PageHeader title="Central de notificações" subtitle="Alertas de prazo, atraso e projetos sem movimentação, gerados automaticamente conforme as regras definidas pelo administrador"
        actions={<><Button onClick={() => { setNaoLidas((v) => !v); setPage(1); }}>{naoLidas ? 'Mostrar todas' : 'Somente não lidas'}</Button><Button variant="primary" disabled={!data?.naoLidas} onClick={() => lerTodas.mutate()}>Marcar todas como lidas</Button></>} />
      <Card>
        {!data ? <Loading /> : data.itens.length === 0 ? <Empty>{naoLidas ? 'Nenhuma notificação não lida.' : 'Nenhuma notificação por enquanto.'}</Empty> : (<>
          <ul className="divide-y divide-slate-100">{data.itens.map((x: any) => {
            const t = TIPO_NOTIF[x.tipo] ?? TIPO_NOTIF.ATRASO;
            return (
              <li key={x.id} className={cx('flex items-center gap-3 px-4 py-3', !x.lidaEm && 'bg-brand-50/40')}>
                <span className={cx('rounded-md p-2', t.tom)}><t.icon className="h-4 w-4" /></span>
                <button className="min-w-0 flex-1 text-left" onClick={() => { if (!x.lidaEm) ler.mutate(x.id); nav(destinoNotif(x)); }}>
                  <span className={cx('block text-sm', x.lidaEm ? 'text-slate-500' : 'font-medium text-slate-800')}>{x.mensagem}</span>
                  <span className="text-xs text-slate-400">{t.nome} · {fmtDataHora(x.createdAt)}</span>
                </button>
                {!x.lidaEm ? <Button size="sm" variant="ghost" onClick={() => ler.mutate(x.id)}>Marcar como lida</Button> : <span className="text-xs text-slate-400">lida</span>}
              </li>);
          })}</ul>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></>)}
      </Card>
    </>
  );
}
