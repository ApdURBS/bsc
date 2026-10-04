export const fmtData = (d?: string | Date | null) => {
  if (!d) return '—';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; }
  return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};
export const fmtHora = (d?: string | Date | null) => (d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '');
export const fmtDataHora = (d?: string | Date | null) => (d ? `${fmtData(d)} às ${fmtHora(d)}` : '—');

export const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
export const somaDias = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

export const SITUACAO: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  NORMAL: { label: 'Normal', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  ATENCAO: { label: 'Atenção', dot: 'bg-yellow-400', text: 'text-yellow-700', bg: 'bg-yellow-50' },
  CRITICO: { label: 'Prazo crítico', dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50' },
  VENCIDO: { label: 'Vencido', dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' },
  SEM_PRAZO: { label: 'Sem prazo', dot: 'bg-slate-300', text: 'text-slate-500', bg: 'bg-slate-50' },
  ENCERRADO: { label: 'Encerrado', dot: 'bg-slate-400', text: 'text-slate-500', bg: 'bg-slate-50' },
};
export const ACOES: Record<string, string> = {
  LOGIN: 'Login', LOGIN_FAILED: 'Login recusado', LOGOUT: 'Logout', CREATE: 'Criação', UPDATE: 'Alteração', DELETE: 'Exclusão',
  STATUS_CHANGE: 'Mudança de status', DOCUMENT_UPLOAD: 'Documento enviado', DOCUMENT_DELETE: 'Documento excluído',
  USER_CREATE: 'Usuário criado', USER_UPDATE: 'Usuário alterado', PERMISSION_CHANGE: 'Permissão alterada', PASSWORD_RESET: 'Senha redefinida',
};
export const fmtTamanho = (n?: number | null) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
