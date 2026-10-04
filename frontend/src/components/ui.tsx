import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronLeft, ChevronRight, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { SITUACAO } from '../lib/format';
import { ApiError } from '../lib/api';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

// ───────── Botões ─────────
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; loading?: boolean };
export function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...p }: BtnProps) {
  const v = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800 border-transparent shadow-sm',
    secondary: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent',
    danger: 'bg-white text-red-700 hover:bg-red-50 border-red-200',
  }[variant];
  return (
    <button {...p} disabled={disabled || loading} className={cx('inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60', size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm', v, className)}>
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{children}
    </button>
  );
}

// ───────── Campos ─────────
const inputCls = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100 disabled:text-slate-500';
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, 'h-9', p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cx(inputCls, p.className)} />;
export function Select({ children, className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(inputCls, 'h-9 pr-8', className)}>{children}</select>;
}
export function Field({ label, hint, error, children, className, required }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
export const Opts = ({ items, empty = '—' }: { items?: { id: number; nome: string }[]; empty?: string }) => (
  <><option value="">{empty}</option>{items?.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}</>
);

// ───────── Estrutura ─────────
export const Card = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cx('rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)}>{children}</div>;
export function PageHeader({ title, subtitle, actions, crumbs }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; crumbs?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {crumbs && <div className="mb-1 text-xs text-slate-500">{crumbs}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string; count?: number }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} className={cx('-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors', active === t.id ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800')}>
          {t.label}{t.count != null && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ───────── Badges e indicadores ─────────
export function Badge({ children, color = '#64748b', className }: { children: ReactNode; color?: string; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', className)} style={{ color, backgroundColor: `${color}1a` }}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />{children}</span>;
}
export const StatusBadge = ({ status }: { status?: { nome: string; cor: string } | null }) => (status ? <Badge color={status.cor}>{status.nome}</Badge> : <span className="text-slate-400">—</span>);

export function PrazoBadge({ prazo }: { prazo?: { situacao: string; diasRestantes: number | null; diasAtraso: number | null } | null }) {
  if (!prazo) return null;
  const s = SITUACAO[prazo.situacao];
  const txt = prazo.situacao === 'VENCIDO' ? `${prazo.diasAtraso} ${prazo.diasAtraso === 1 ? 'dia' : 'dias'} em atraso` : prazo.diasRestantes != null ? `${prazo.diasRestantes} ${prazo.diasRestantes === 1 ? 'dia' : 'dias'}` : s.label;
  return <span title={s.label} className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium', s.text, s.bg)}><span className={cx('h-2 w-2 rounded-full', s.dot)} />{txt}</span>;
}
export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200"><div className={cx('h-full rounded-full', value >= 100 ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: `${value}%` }} /></div>
      <span className="w-9 text-right text-xs tabular-nums text-slate-600">{value}%</span>
    </div>
  );
}

// ───────── Feedback ─────────
export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx('h-5 w-5 animate-spin text-slate-400', className)} />;
export const Loading = () => <div className="flex justify-center py-16"><Spinner /></div>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="py-14 text-center text-sm text-slate-400">{children}</div>;
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as ApiError;
  return (
    <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{e.message ?? 'Erro inesperado.'}{e.details?.length ? <ul className="mt-1 list-disc pl-4 text-xs">{e.details.map((d, i) => <li key={i}>{d.campo ? `${d.campo}: ` : ''}{d.mensagem}</li>)}</ul> : null}</div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[6vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal className={cx('w-full rounded-xl bg-white shadow-xl', w)}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 rounded-b-xl border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1; const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500">
      <span>{from}–{to} de {total}</span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Anterior"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="px-1">Página {page} de {pages}</span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Próxima"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

// ───────── Tabelas ─────────
export const Table = ({ children }: { children: ReactNode }) => <div className="overflow-x-auto"><table className="w-full min-w-max text-left text-sm">{children}</table></div>;
export const Th = ({ children, sort, cur, dir, onSort, className }: { children?: ReactNode; sort?: string; cur?: string; dir?: string; onSort?: (s: string) => void; className?: string }) => (
  <th className={cx('whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500', sort && 'cursor-pointer select-none hover:text-slate-800', className)} onClick={() => sort && onSort?.(sort)}>
    {children}{sort && cur === sort && <span className="ml-1 text-brand-700">{dir === 'desc' ? '↓' : '↑'}</span>}
  </th>
);
export const Td = ({ children, className, ...p }: { children?: ReactNode; className?: string } & React.TdHTMLAttributes<HTMLTableCellElement>) => <td {...p} className={cx('border-b border-slate-100 px-3 py-2.5 align-middle', className)}>{children}</td>;

// ───────── Toasts ─────────
type Toast = { id: number; msg: string; kind: 'ok' | 'err' };
const ToastCtx = createContext<(msg: string, kind?: 'ok' | 'err') => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, msg, kind }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={cx('flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm shadow-lg', t.kind === 'ok' ? 'border-emerald-200 bg-white text-slate-700' : 'border-red-200 bg-white text-red-700')}>
            {t.kind === 'ok' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertCircle className="h-4 w-4" />}{t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ───────── Marca ─────────
/** Logo da URBS: coloque o arquivo oficial em frontend/public/logoUrbs.svg. Enquanto não existir, exibe uma marca textual neutra. */
export function Logo({ light = false, size = 'md' }: { light?: boolean; size?: 'md' | 'lg' }) {
  const [ok, setOk] = useState(true);
  const h = size === 'lg' ? 'h-14' : 'h-8';
  if (ok) return <img src="/logoUrbs.svg" alt="URBS" className={cx(h, 'w-auto', light && 'brightness-0 invert')} onError={() => setOk(false)} />;
  return <span className={cx('font-bold tracking-[0.18em]', size === 'lg' ? 'text-3xl' : 'text-lg', light ? 'text-white' : 'text-brand-800')}>URBS</span>;
}
