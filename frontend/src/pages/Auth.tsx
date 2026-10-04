import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, ErrorBox, Field, Input, Logo } from '../components/ui';

function Shell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-900 p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-700/40" />
        <div className="absolute -bottom-32 -left-20 h-[28rem] w-[28rem] rounded-full bg-brand-800/70" />
        <div className="relative self-start"><Logo size="lg" light /></div>
        <div className="relative max-w-md">
          <div className="text-sm font-medium uppercase tracking-[0.2em] text-brand-200">URBS — Urbanização de Curitiba</div>
          <h1 className="mt-4 text-4xl font-semibold leading-tight">Gestão de projetos com rastreabilidade de ponta a ponta.</h1>
          <p className="mt-4 text-brand-100/80">Frentes, projetos, etapas, atividades e movimentações do BSC em um só lugar — com prazos, alertas e auditoria.</p>
        </div>
        <div className="relative text-xs text-brand-200/70">Área de Planejamento e Desenvolvimento · Unidade de Planejamento e Desenvolvimento</div>
      </div>
      <div className="flex items-center justify-center bg-white p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="mb-5 lg:hidden"><Logo size="lg" /></div>
            <div className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-600">Área de Planejamento e Desenvolvimento</div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">CONTROLE BSC — APD/UPD</h2>
            <p className="mt-1 text-sm text-slate-500">Unidade de Planejamento e Desenvolvimento<br />URBS — Urbanização de Curitiba</p>
          </div>
          {title && <h3 className="mb-4 text-base font-semibold text-slate-800">{title}</h3>}
          {children}
          <div className="mt-10 text-center text-xs text-slate-400">Versão 0.6.0</div>
        </div>
      </div>
    </div>
  );
}

export function Login() {
  const { reload } = useAuth(); const nav = useNavigate();
  const [usuario, setU] = useState(''); const [senha, setS] = useState(''); const [err, setErr] = useState<unknown>(); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(undefined);
    try { await post('/auth/login', { usuario, senha }); await reload(); nav('/'); } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  return (
    <Shell>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={err} />
        <Field label="Usuário"><Input autoFocus autoComplete="username" value={usuario} onChange={(e) => setU(e.target.value)} placeholder="usuário ou e-mail" /></Field>
        <Field label="Senha"><Input type="password" autoComplete="current-password" value={senha} onChange={(e) => setS(e.target.value)} /></Field>
        <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!usuario || !senha}>Entrar</Button>
        <div className="text-center"><Link to="/esqueci-senha" className="text-sm text-brand-700 hover:underline">Esqueci minha senha</Link></div>
      </form>
    </Shell>
  );
}

export function ForgotPassword() {
  const [usuario, setU] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState<unknown>(); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setErr(undefined); try { const r = await post('/auth/forgot-password', { usuario }); setMsg(r.mensagem); } catch (x) { setErr(x); } finally { setBusy(false); } };
  return (
    <Shell title="Recuperar senha">
      {msg ? <div className="space-y-4"><p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</p><Link to="/login" className="text-sm text-brand-700 hover:underline">Voltar ao login</Link></div> : (
        <form onSubmit={submit} className="space-y-4">
          <ErrorBox error={err} />
          <Field label="Usuário ou e-mail"><Input autoFocus value={usuario} onChange={(e) => setU(e.target.value)} /></Field>
          <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!usuario}>Enviar instruções</Button>
          <div className="text-center"><Link to="/login" className="text-sm text-brand-700 hover:underline">Voltar ao login</Link></div>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const [sp] = useSearchParams(); const nav = useNavigate();
  const [senha, setS] = useState(''); const [conf, setC] = useState(''); const [err, setErr] = useState<unknown>(); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setErr(undefined); try { await post('/auth/reset-password', { token: sp.get('token'), novaSenha: senha }); nav('/login'); } catch (x) { setErr(x); } finally { setBusy(false); } };
  return (
    <Shell title="Definir nova senha">
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={err} />
        <Field label="Nova senha" hint="Mínimo 8 caracteres, com maiúscula, minúscula e número."><Input type="password" autoFocus value={senha} onChange={(e) => setS(e.target.value)} /></Field>
        <Field label="Confirmar nova senha" error={conf && conf !== senha ? 'As senhas não conferem.' : undefined}><Input type="password" value={conf} onChange={(e) => setC(e.target.value)} /></Field>
        <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!senha || senha !== conf}>Redefinir senha</Button>
      </form>
    </Shell>
  );
}

export function ChangePassword() {
  const { me, logout, reload } = useAuth(); const nav = useNavigate();
  const [atual, setA] = useState(''); const [nova, setN] = useState(''); const [conf, setC] = useState(''); const [err, setErr] = useState<unknown>(); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(undefined);
    try { await post('/auth/change-password', { senhaAtual: atual, novaSenha: nova }); await reload(); nav('/login'); } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  return (
    <Shell title={me?.mustChangePassword ? 'Defina uma nova senha para continuar' : 'Alterar senha'}>
      <form onSubmit={submit} className="space-y-4">
        {me?.mustChangePassword && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Por segurança, a senha inicial precisa ser trocada no primeiro acesso.</p>}
        <ErrorBox error={err} />
        <Field label="Senha atual"><Input type="password" autoFocus value={atual} onChange={(e) => setA(e.target.value)} /></Field>
        <Field label="Nova senha" hint="Mínimo 8 caracteres, com maiúscula, minúscula e número."><Input type="password" value={nova} onChange={(e) => setN(e.target.value)} /></Field>
        <Field label="Confirmar nova senha" error={conf && conf !== nova ? 'As senhas não conferem.' : undefined}><Input type="password" value={conf} onChange={(e) => setC(e.target.value)} /></Field>
        <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!atual || !nova || nova !== conf}>Alterar senha</Button>
        <div className="text-center">{me?.mustChangePassword ? <button type="button" onClick={() => logout().then(() => nav('/login'))} className="text-sm text-slate-500 hover:underline">Sair</button> : <Link to="/" className="text-sm text-brand-700 hover:underline">Cancelar</Link>}</div>
        <p className="text-center text-xs text-slate-400">Após a alteração você precisará entrar novamente.</p>
      </form>
    </Shell>
  );
}
