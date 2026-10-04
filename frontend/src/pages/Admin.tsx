import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, ShieldCheck } from 'lucide-react';
import { del, get, patch, post, put, qs } from '../lib/api';
import { usePessoas } from '../lib/queries';
import { useAuth } from '../lib/auth';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, Opts, PageHeader, Pagination, Select, Table, Tabs, Td, Textarea, Th, useToast, cx } from '../components/ui';
import { AuditTable } from '../components/lists';
import { ACOES, fmtDataHora } from '../lib/format';

// ───────────── Usuários e perfis ─────────────
function UserModal({ open, onClose, user, roles }: { open: boolean; onClose: () => void; user?: any; roles: any[] }) {
  const qc = useQueryClient(); const toast = useToast(); const edit = !!user; const { me } = useAuth();
  const [f, setF] = useState<any>({}); const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  useEffect(() => { if (open) setF(edit ? { nome: user.nome, email: user.email, roleId: user.roleId, ativo: user.ativo, pertenceApd: !!user.pertenceApd, novaSenha: '' } : { nome: '', username: '', email: '', senha: '', roleId: roles.find((r) => r.nome === 'OPERADOR')?.id ?? '', pertenceApd: false }); }, [open]);
  const m = useMutation({
    mutationFn: () => edit ? patch(`/users/${user.id}`, { nome: f.nome, email: f.email, roleId: Number(f.roleId), ativo: f.ativo, pertenceApd: !!f.pertenceApd, ...(f.novaSenha ? { novaSenha: f.novaSenha } : {}) }) : post('/users', { ...f, roleId: Number(f.roleId) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast(edit ? 'Usuário atualizado.' : 'Usuário criado.'); onClose(); },
  });
  const self = edit && me?.id === user.id;
  return (
    <Modal open={open} onClose={onClose} title={edit ? `Editar usuário — ${user.username}` : 'Novo usuário'} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate()} disabled={!f.nome || !f.email || !f.roleId || (!edit && (!f.username || !f.senha))}>Salvar</Button></>}>
      <div className="space-y-4"><ErrorBox error={m.error} />
        <Field label="Nome completo" required><Input value={f.nome ?? ''} onChange={(e) => set('nome', e.target.value)} /></Field>
        {!edit && <Field label="Usuário (login)" required hint="3–40 caracteres: letras minúsculas, números, . _ -"><Input value={f.username ?? ''} onChange={(e) => set('username', e.target.value.toLowerCase())} /></Field>}
        <Field label="E-mail" required><Input type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Perfil de acesso" required><Select value={f.roleId ?? ''} disabled={self} onChange={(e) => set('roleId', e.target.value)}>{roles.filter((r) => r.ativo).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}</Select></Field>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!f.pertenceApd} onChange={(e) => set('pertenceApd', e.target.checked)} /><span>Pertence à APD/UPD<span className="block text-xs text-slate-500">Habilita o usuário a ser Dono, Scrum Master, membro da equipe ou responsável por etapas/atividades, e a enxergar projetos “Interno APD”.</span></span></label>
        {!edit ? <Field label="Senha inicial" required hint="Mínimo 8 caracteres, com maiúscula, minúscula e número. O usuário será obrigado a trocá-la no primeiro acesso."><Input type="password" value={f.senha ?? ''} onChange={(e) => set('senha', e.target.value)} autoComplete="new-password" /></Field> : (
          <>
            <Field label="Redefinir senha (opcional)" hint="Se preenchida, o usuário precisará trocá-la no próximo acesso e as sessões atuais serão encerradas."><Input type="password" value={f.novaSenha ?? ''} onChange={(e) => set('novaSenha', e.target.value)} autoComplete="new-password" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.ativo ?? true} disabled={self} onChange={(e) => set('ativo', e.target.checked)} />Usuário ativo</label>
          </>)}
      </div>
    </Modal>
  );
}

function RoleModal({ open, onClose, role, perms }: { open: boolean; onClose: () => void; role?: any; perms: any[] }) {
  const qc = useQueryClient(); const toast = useToast(); const edit = !!role; const [f, setF] = useState<any>({ nome: '', descricao: '', permissoes: [] as string[] });
  const travado = role?.nome === 'ADMINISTRADOR';
  useEffect(() => { if (open) setF(edit ? { nome: role.nome, descricao: role.descricao ?? '', permissoes: role.permissoes, convidado: !!role.convidado, ativo: role.ativo } : { nome: '', descricao: '', convidado: false, permissoes: [] }); }, [open]);
  const m = useMutation({ mutationFn: () => (edit ? put(`/roles/${role.id}`, f) : post('/roles', f)), onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); toast('Perfil salvo.'); onClose(); } });
  const modulos = [...new Set(perms.map((p) => p.modulo))];
  const toggle = (c: string) => setF((s: any) => ({ ...s, permissoes: s.permissoes.includes(c) ? s.permissoes.filter((x: string) => x !== c) : [...s.permissoes, c] }));
  return (
    <Modal open={open} onClose={onClose} size="lg" title={edit ? `Perfil ${role.nome}` : 'Novo perfil'} footer={<><Button onClick={onClose}>Cancelar</Button>{!travado && <Button variant="primary" loading={m.isPending} disabled={!f.nome} onClick={() => m.mutate()}>Salvar</Button>}</>}>
      <div className="space-y-4"><ErrorBox error={m.error} />
        {travado && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">O perfil ADMINISTRADOR sempre possui todas as permissões e não pode ser alterado.</p>}
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Nome do perfil" required><Input value={f.nome} disabled={role?.sistema} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Field><Field label="Descrição"><Input value={f.descricao} disabled={travado} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Field></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" disabled={travado} checked={!!f.convidado} onChange={(e) => setF({ ...f, convidado: e.target.checked })} /><span>Perfil de convidado<span className="block text-xs text-slate-500">Enxerga apenas projetos com confidencialidade “Livre”.</span></span></label>
        <div className="grid gap-4 sm:grid-cols-2">
          {modulos.map((mod) => (
            <div key={mod} className="rounded-md border border-slate-200 p-3"><div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{mod}</div>
              {perms.filter((p) => p.modulo === mod).map((p) => <label key={p.codigo} className="flex cursor-pointer items-start gap-2 py-0.5 text-sm"><input type="checkbox" className="mt-1" disabled={travado} checked={travado || f.permissoes.includes(p.codigo)} onChange={() => toggle(p.codigo)} /><span>{p.descricao}</span></label>)}
            </div>))}
        </div>
      </div>
    </Modal>
  );
}

export function UsersPage() {
  const { can } = useAuth(); const [tab, setTab] = useState('usuarios'); const [page, setPage] = useState(1); const [busca, setBusca] = useState('');
  const [uModal, setUModal] = useState<{ user?: any } | null>(null); const [rModal, setRModal] = useState<{ role?: any } | null>(null);
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => get('/roles') }); const perms = useQuery({ queryKey: ['perms'], queryFn: () => get('/roles/permissions') });
  const users = useQuery({ queryKey: ['users', page, busca], queryFn: () => get(`/users${qs({ page, pageSize: 25, busca })}`), placeholderData: (p) => p });
  return (
    <>
      <PageHeader title="Usuários e perfis" subtitle="Controle de acesso do sistema" actions={tab === 'usuarios' ? (can('users.create') && <Button variant="primary" onClick={() => setUModal({})}><Plus className="h-4 w-4" />Novo usuário</Button>) : (can('roles.manage') && <Button variant="primary" onClick={() => setRModal({})}><Plus className="h-4 w-4" />Novo perfil</Button>)} />
      <Tabs tabs={[{ id: 'usuarios', label: 'Usuários' }, { id: 'perfis', label: 'Perfis e permissões' }]} active={tab} onChange={setTab} />
      <Card className="mt-4">
        {tab === 'usuarios' ? (<>
          <div className="border-b border-slate-200 p-3"><Input className="!w-72" placeholder="Buscar por nome, usuário ou e-mail…" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} /></div>
          {users.isLoading ? <Loading /> : (<>
            <Table><thead><tr><Th>Nome</Th><Th>Usuário</Th><Th>E-mail</Th><Th>Perfil</Th><Th>APD/UPD</Th><Th>Situação</Th><Th>Último acesso</Th><Th /></tr></thead>
              <tbody>{users.data?.itens.map((u: any) => (
                <tr key={u.id} className={cx(!u.ativo && 'opacity-60')}><Td className="font-medium">{u.nome}</Td><Td className="font-mono text-xs">{u.username}</Td><Td>{u.email}</Td><Td><Badge color="#1f5aa6">{u.perfil}</Badge></Td><Td>{u.pertenceApd ? <Badge color="#0d9488">Sim</Badge> : <span className="text-slate-400">—</span>}</Td>
                  <Td>{u.ativo ? <Badge color="#16a34a">Ativo</Badge> : <Badge color="#64748b">Desativado</Badge>}</Td><Td className="text-slate-500">{u.lastLoginAt ? fmtDataHora(u.lastLoginAt) : 'Nunca'}</Td>
                  <Td className="text-right">{can('users.update') && <Button size="sm" variant="ghost" onClick={() => setUModal({ user: u })}><Pencil className="h-3.5 w-3.5" />Editar</Button>}</Td></tr>))}</tbody></Table>
            {users.data && <Pagination page={users.data.page} pageSize={users.data.pageSize} total={users.data.total} onPage={setPage} />}</>)}
        </>) : (
          roles.isLoading ? <Loading /> : <Table><thead><tr><Th>Perfil</Th><Th>Descrição</Th><Th>Permissões</Th><Th>Usuários</Th><Th /></tr></thead>
            <tbody>{roles.data?.map((r: any) => (
              <tr key={r.id}><Td className="font-semibold"><span className="flex items-center gap-1.5">{r.sistema && <ShieldCheck className="h-4 w-4 text-brand-600" />}{r.nome}</span></Td><Td className="text-slate-500">{r.descricao ?? '—'}</Td><Td>{r.nome === 'ADMINISTRADOR' ? 'Todas' : r.permissoes.length}</Td><Td>{r.usuarios}</Td>
                <Td className="text-right">{can('roles.manage') && <Button size="sm" variant="ghost" onClick={() => setRModal({ role: r })}>{r.nome === 'ADMINISTRADOR' ? 'Ver' : <><Pencil className="h-3.5 w-3.5" />Editar</>}</Button>}</Td></tr>))}</tbody></Table>
        )}
      </Card>
      {uModal && roles.data && <UserModal open onClose={() => setUModal(null)} user={uModal.user} roles={roles.data} />}
      {rModal && perms.data && <RoleModal open onClose={() => setRModal(null)} role={rModal.role} perms={perms.data} />}
    </>
  );
}

// ───────────── Configurações ─────────────
type Campo = { k: string; label: string; type?: 'text' | 'number' | 'select' | 'color'; options?: [string, string][] };
const LOOKUPS: { id: string; label: string; url: string; campos: Campo[]; extra?: (r: any) => React.ReactNode; cols?: [string, (r: any) => React.ReactNode][] }[] = [
  { id: 'frentes', label: 'Frentes', url: '/frentes', campos: [{ k: 'nome', label: 'Nome' }, { k: 'codigo', label: 'Código (opcional — gerado automaticamente)' }, { k: 'ordem', label: 'Ordem', type: 'number' }], cols: [['Código', (r) => <span className="font-mono font-semibold text-brand-800">{r.codigo}</span>], ['Nome', (r) => r.nome], ['Ordem', (r) => r.ordem]] },
  { id: 'status', label: 'Status', url: '/status', campos: [{ k: 'nome', label: 'Nome' }, { k: 'classificacao', label: 'Classificação (usada para identificar situações críticas)', type: 'select', options: [['INICIAL', 'Inicial (aguardando)'], ['EM_ANDAMENTO', 'Em andamento'], ['ATENCAO', 'Atenção'], ['ATRASO', 'Atraso'], ['BLOQUEIO', 'Bloqueio'], ['PAUSADO', 'Pausado (suspenso)'], ['CONCLUIDO', 'Concluído'], ['CANCELADO', 'Cancelado']] }, { k: 'cor', label: 'Cor', type: 'color' }, { k: 'ordem', label: 'Ordem', type: 'number' }], cols: [['Status', (r) => <Badge color={r.cor}>{r.nome}</Badge>], ['Classificação', (r) => r.classificacao], ['Ordem', (r) => r.ordem]] },
  { id: 'confidencialidades', label: 'Confidencialidade', url: '/confidencialidades', campos: [{ k: 'nome', label: 'Nome' }, { k: 'nivel', label: 'Nível (maior = mais restrito)', type: 'number' }, { k: 'regraAcesso', label: 'Quem pode ver', type: 'select', options: [['TODOS', 'Livre — qualquer usuário, inclusive convidado'], ['USUARIOS', 'Interno URBS — todos os usuários, exceto convidado'], ['EQUIPE_APD', 'Interno APD — apenas usuários da APD/UPD']] }], cols: [['Nome', (r) => r.nome], ['Nível', (r) => r.nivel], ['Quem pode ver', (r) => ({ TODOS: 'Qualquer usuário', USUARIOS: 'Todos, exceto convidado', EQUIPE_APD: 'Somente APD/UPD' } as any)[r.regraAcesso]]] },
  { id: 'tipos-movimentacao', label: 'Tipos de movimentação', url: '/tipos-movimentacao', campos: [{ k: 'nome', label: 'Nome' }], cols: [['Nome', (r) => r.nome]] },
  { id: 'tipos-documento', label: 'Tipos de documento', url: '/tipos-documento', campos: [{ k: 'nome', label: 'Nome' }], cols: [['Nome', (r) => r.nome]] },
  { id: 'tipos-ocorrencia', label: 'Tipos de ocorrência', url: '/tipos-ocorrencia', campos: [{ k: 'nome', label: 'Nome' }], cols: [['Nome', (r) => r.nome]] },
];

function LookupAdmin({ def }: { def: (typeof LOOKUPS)[number] }) {
  const qc = useQueryClient(); const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['cfg', def.url], queryFn: () => get(`${def.url}?todos=1`) });
  const [modal, setModal] = useState<{ r?: any } | null>(null); const [f, setF] = useState<any>({});
  useEffect(() => { if (modal) setF(modal.r ? Object.fromEntries(def.campos.map((c) => [c.k, modal.r[c.k] ?? ''])) : Object.fromEntries(def.campos.map((c) => [c.k, c.type === 'color' ? '#64748b' : c.type === 'select' ? c.options![0][0] : '']))); }, [modal]);
  const clean = () => Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== '' || (modal?.r && k !== 'codigo')).map(([k, v]) => [k, def.campos.find((c) => c.k === k)?.type === 'number' && v !== '' ? Number(v) : v]));
  const m = useMutation({ mutationFn: () => (modal?.r ? patch(`${def.url}/${modal.r.id}`, clean()) : post(def.url, clean())), onSuccess: () => { qc.invalidateQueries(); toast('Salvo.'); setModal(null); } });
  const toggle = useMutation({ mutationFn: (r: any) => patch(`${def.url}/${r.id}`, { ativo: !r.ativo }), onSuccess: () => { qc.invalidateQueries(); toast('Atualizado.'); }, onError: (e: any) => toast(e.message, 'err') });
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-200 p-3"><div className="text-sm text-slate-500">Itens nunca são excluídos: use “Desativar” para ocultá-los dos formulários preservando o histórico.</div><Button variant="primary" onClick={() => setModal({})}><Plus className="h-4 w-4" />Novo</Button></div>
      {isLoading ? <Loading /> : (
        <Table><thead><tr>{def.cols!.map(([h]) => <Th key={h}>{h}</Th>)}<Th>Situação</Th><Th /></tr></thead>
          <tbody>{data?.map((r: any) => <tr key={r.id} className={cx(!r.ativo && 'opacity-50')}>{def.cols!.map(([h, fn]) => <Td key={h}>{fn(r)}</Td>)}<Td>{r.ativo ? 'Ativo' : 'Inativo'}</Td>
            <Td className="whitespace-nowrap text-right"><Button size="sm" variant="ghost" onClick={() => setModal({ r })}><Pencil className="h-3.5 w-3.5" />Editar</Button><Button size="sm" variant="ghost" onClick={() => toggle.mutate(r)}>{r.ativo ? 'Desativar' : 'Reativar'}</Button></Td></tr>)}</tbody></Table>)}
      <Modal open={!!modal} onClose={() => setModal(null)} size="sm" title={`${modal?.r ? 'Editar' : 'Novo'} — ${def.label}`} footer={<><Button onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate()} disabled={!f.nome}>Salvar</Button></>}>
        <div className="space-y-4"><ErrorBox error={m.error} />{def.campos.map((c) => (
          <Field key={c.k} label={c.label}>{c.type === 'select' ? <Select value={f[c.k] ?? ''} onChange={(e) => setF({ ...f, [c.k]: e.target.value })}>{c.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
            : <Input type={c.type ?? 'text'} value={f[c.k] ?? ''} disabled={c.k === 'codigo' && !!modal?.r} onChange={(e) => setF({ ...f, [c.k]: e.target.value })} className={c.type === 'color' ? '!p-1' : ''} />}</Field>))}</div>
      </Modal>
    </Card>
  );
}

function PrazosConfig() {
  const qc = useQueryClient(); const toast = useToast(); const { data } = useQuery({ queryKey: ['settings'], queryFn: () => get('/settings') });
  const [v, setV] = useState<Record<string, string>>({}); useEffect(() => { if (data) setV(Object.fromEntries(data.map((d: any) => [d.chave, String(d.valor)]))); }, [data]);
  const m = useMutation({ mutationFn: async (chave: string) => put(`/settings/${chave}`, { valor: Number(v[chave]) }), onSuccess: () => { qc.invalidateQueries(); toast('Configuração salva.'); }, onError: (e: any) => toast(e.message, 'err') });
  if (!data) return <Loading />;
  return (
    <Card className="p-5"><div className="mb-4 text-sm text-slate-500">Estes limites definem os indicadores 🟢 Normal, 🟡 Atenção, 🟠 Prazo crítico e 🔴 Vencido, e o alerta de projetos sem movimentação.</div>
      <div className="grid max-w-2xl gap-4">{data.map((d: any) => (
        <div key={d.chave} className="flex items-end gap-3"><Field label={d.descricao} className="flex-1"><Input type="number" min={1} value={v[d.chave] ?? ''} onChange={(e) => setV({ ...v, [d.chave]: e.target.value })} /></Field>
          <Button onClick={() => m.mutate(d.chave)} disabled={String(d.valor) === v[d.chave]}>Salvar</Button></div>))}</div></Card>
  );
}


// ───────────── Regras de alerta ─────────────
const TIPOS_ALERTA: Record<string, { nome: string; dias?: string; ajuda: string }> = {
  PRAZO_PROXIMO: { nome: 'Prazo próximo', dias: 'Antecedência (dias antes do prazo)', ajuda: 'Avisa quando projeto ou etapa vence em até N dias. Se houver mais de uma regra de prazo, vale a de menor antecedência.' },
  ATRASO: { nome: 'Atraso', ajuda: 'Avisa quando projeto ou etapa está atrasado.' },
  SEM_MOVIMENTACAO: { nome: 'Sem movimentação', dias: 'Dias sem movimentação', ajuda: 'Avisa quando o projeto está parado há mais de N dias.' },
  ETAPAS_ATRASADAS_USUARIO: { nome: 'Pessoa com etapas atrasadas', dias: 'Mínimo de etapas atrasadas', ajuda: 'Avisa a pessoa (e os destinatários extras) quando ela acumula N ou mais etapas atrasadas.' },
};
const FREQ: Record<string, string> = { DIARIA: 'Diária', SEMANAL: 'Semanal', UNICA: 'Uma única vez' };

function AlertasConfig() {
  const qc = useQueryClient(); const toast = useToast(); const pessoas = usePessoas();
  const { data, isLoading } = useQuery({ queryKey: ['alerts'], queryFn: () => get('/alerts') });
  const [modal, setModal] = useState<{ r?: any } | null>(null); const [f, setF] = useState<any>({});
  useEffect(() => {
    if (!modal) return;
    const r = modal.r;
    setF(r ? { nome: r.nome, tipo: r.tipo, antecedenciaDias: r.antecedenciaDias ?? '', frequencia: r.frequencia, participantes: r.destinatarios?.participantes !== false, userIds: r.destinatarios?.userIds ?? [], ativo: r.ativo }
      : { nome: '', tipo: 'PRAZO_PROXIMO', antecedenciaDias: 30, frequencia: 'SEMANAL', participantes: true, userIds: [], ativo: true });
  }, [modal]);
  const body = () => ({ nome: f.nome, tipo: f.tipo, antecedenciaDias: TIPOS_ALERTA[f.tipo]?.dias ? Number(f.antecedenciaDias) : null, frequencia: f.frequencia, ativo: f.ativo, destinatarios: { participantes: f.participantes, userIds: f.userIds } });
  const m = useMutation({ mutationFn: () => (modal?.r ? patch(`/alerts/${modal.r.id}`, body()) : post('/alerts', body())), onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); toast('Regra salva.'); setModal(null); } });
  const toggle = useMutation({ mutationFn: (r: any) => patch(`/alerts/${r.id}`, { ativo: !r.ativo }), onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }), onError: (e: any) => toast(e.message, 'err') });
  const excluir = useMutation({ mutationFn: (r: any) => del(`/alerts/${r.id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); toast('Regra excluída.'); }, onError: (e: any) => toast(e.message, 'err') });
  const run = useMutation({ mutationFn: () => post('/alerts/run'), onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: ['notif'] }); toast(r.criadas ? `${r.criadas} notificação(ões) gerada(s).` : 'Nenhuma notificação nova no momento.'); }, onError: (e: any) => toast(e.message, 'err') });
  const nomePessoa = (id: number) => pessoas.data?.find((p: any) => p.id === id)?.nome ?? `#${id}`;
  const dest = (r: any) => [r.destinatarios?.participantes !== false ? 'Participantes' : null, ...(r.destinatarios?.userIds ?? []).map(nomePessoa)].filter(Boolean).join(', ');
  const tipo = TIPOS_ALERTA[f.tipo];
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
        <div className="max-w-2xl text-sm text-slate-500">Os alertas são verificados automaticamente a cada hora. Cada pessoa só recebe avisos de projetos que tem permissão de ver (confidencialidade). “Participantes” = dono do projeto e responsável, Scrum Master e equipe da etapa.</div>
        <div className="flex gap-2"><Button onClick={() => run.mutate()} loading={run.isPending}>Gerar agora</Button><Button variant="primary" onClick={() => setModal({})}><Plus className="h-4 w-4" />Nova regra</Button></div>
      </div>
      {isLoading ? <Loading /> : (
        <Table><thead><tr><Th>Regra</Th><Th>Tipo</Th><Th>Antecedência</Th><Th>Frequência</Th><Th>Destinatários</Th><Th>Situação</Th><Th /></tr></thead>
          <tbody>{data?.map((r: any) => (
            <tr key={r.id} className={cx(!r.ativo && 'opacity-50')}>
              <Td className="font-medium">{r.nome}</Td><Td>{TIPOS_ALERTA[r.tipo]?.nome ?? r.tipo}</Td><Td>{r.antecedenciaDias != null ? `${r.antecedenciaDias}${r.tipo === 'ETAPAS_ATRASADAS_USUARIO' ? ' etapa(s)' : ' dias'}` : '—'}</Td>
              <Td>{FREQ[r.frequencia]}</Td><Td className="max-w-[240px] truncate" title={dest(r)}>{dest(r)}</Td><Td>{r.ativo ? 'Ativa' : 'Inativa'}</Td>
              <Td className="whitespace-nowrap text-right"><Button size="sm" variant="ghost" onClick={() => setModal({ r })}><Pencil className="h-3.5 w-3.5" />Editar</Button><Button size="sm" variant="ghost" onClick={() => toggle.mutate(r)}>{r.ativo ? 'Desativar' : 'Ativar'}</Button><Button size="sm" variant="ghost" onClick={() => { if (confirm(`Excluir a regra “${r.nome}”? As notificações já geradas são mantidas.`)) excluir.mutate(r); }}>Excluir</Button></Td>
            </tr>))}</tbody></Table>)}
      <Modal open={!!modal} onClose={() => setModal(null)} size="md" title={modal?.r ? 'Editar regra de alerta' : 'Nova regra de alerta'} footer={<><Button onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" loading={m.isPending} disabled={!f.nome} onClick={() => m.mutate()}>Salvar</Button></>}>
        <div className="space-y-4"><ErrorBox error={m.error} />
          <Field label="Nome da regra" required><Input value={f.nome ?? ''} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de alerta"><Select value={f.tipo ?? ''} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{Object.entries(TIPOS_ALERTA).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}</Select></Field>
            <Field label="Frequência" hint="Com que frequência o mesmo aviso pode se repetir"><Select value={f.frequencia ?? ''} onChange={(e) => setF({ ...f, frequencia: e.target.value })}>{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          </div>
          {tipo?.dias && <Field label={tipo.dias}><Input type="number" min={f.tipo === 'ETAPAS_ATRASADAS_USUARIO' ? 1 : 0} value={f.antecedenciaDias ?? ''} onChange={(e) => setF({ ...f, antecedenciaDias: e.target.value })} /></Field>}
          <p className="-mt-1 text-xs text-slate-500">{tipo?.ajuda}</p>
          <Field label="Destinatários">
            <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.participantes} onChange={(e) => setF({ ...f, participantes: e.target.checked })} />Participantes (dono, responsável, Scrum Master e equipe)</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {(f.userIds ?? []).map((id: number) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-800">{nomePessoa(id)}<button type="button" onClick={() => setF({ ...f, userIds: f.userIds.filter((x: number) => x !== id) })} className="text-brand-500 hover:text-brand-800" aria-label="Remover">×</button></span>)}
              <Select className="!w-56" value="" onChange={(e) => { const n = Number(e.target.value); if (n && !f.userIds.includes(n)) setF({ ...f, userIds: [...f.userIds, n] }); }}><Opts items={pessoas.data?.filter((p: any) => !(f.userIds ?? []).includes(p.id))} empty="+ Adicionar pessoa…" /></Select>
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />Regra ativa</label>
        </div>
      </Modal>
    </Card>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useState('prazos');
  return (
    <>
      <PageHeader title="Configurações" subtitle="Cadastros e parâmetros do sistema — somente administradores" />
      <Tabs tabs={[{ id: 'prazos', label: 'Prazos' }, { id: 'alertas', label: 'Alertas' }, ...LOOKUPS.map((l) => ({ id: l.id, label: l.label }))]} active={tab} onChange={setTab} />
      <div className="mt-4">{tab === 'prazos' ? <PrazosConfig /> : tab === 'alertas' ? <AlertasConfig /> : <LookupAdmin key={tab} def={LOOKUPS.find((l) => l.id === tab)!} />}</div>
    </>
  );
}

// ───────────── Auditoria ─────────────
export function AuditPage() {
  const [f, setF] = useState<any>({ busca: '', acao: '', modulo: '', de: '', ate: '' }); const [page, setPage] = useState(1);
  const facets = useQuery({ queryKey: ['audit-facets'], queryFn: () => get('/audit/facets') });
  const set = (k: string, v: string) => { setF((s: any) => ({ ...s, [k]: v })); setPage(1); };
  return (
    <>
      <PageHeader title="Auditoria" subtitle="Registro imutável de ações no sistema — não pode ser editado nem apagado" />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <Input className="!w-56" placeholder="Buscar registro, campo, valor, usuário…" value={f.busca} onChange={(e) => set('busca', e.target.value)} />
          <Select className="!w-48" value={f.acao} onChange={(e) => set('acao', e.target.value)}><option value="">Todas as ações</option>{facets.data?.acoes.map((a: string) => <option key={a} value={a}>{ACOES[a] ?? a}</option>)}</Select>
          <Select className="!w-44" value={f.modulo} onChange={(e) => set('modulo', e.target.value)}><option value="">Todos os módulos</option>{facets.data?.modulos.map((a: string) => <option key={a} value={a}>{a}</option>)}</Select>
          <Input type="date" className="!w-36" value={f.de} onChange={(e) => set('de', e.target.value)} /><span className="text-xs text-slate-400">até</span><Input type="date" className="!w-36" value={f.ate} onChange={(e) => set('ate', e.target.value)} />
          <Button variant="ghost" onClick={() => { setF({ busca: '', acao: '', modulo: '', de: '', ate: '' }); setPage(1); }}>Limpar</Button>
        </div>
        <AuditTable url="/audit" filtros={f} page={page} onPage={setPage} />
      </Card>
    </>
  );
}
void Textarea;
