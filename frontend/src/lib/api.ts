export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: { campo: string; mensagem: string }[]) { super(message); }
}

// Em dev, vazio (usa o proxy do Vite para /api, mesma origem). Em produção, URL do backend no Render.
export const API_URL = import.meta.env.VITE_API_URL ?? '/api';

// Com frontend e API em domínios diferentes, o JS do frontend não consegue ler via document.cookie
// um cookie que pertence ao domínio da API (isolamento por origem) — por isso o token CSRF vem no
// corpo das respostas de /auth/login e /auth/me, e é guardado aqui em memória.
let csrfToken = '';
export const setCsrfToken = (t: string | undefined) => { if (t) csrfToken = t; };
const csrf = () => csrfToken;

export async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${url}`, {
    method, credentials: 'include',
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-CSRF-Token': csrf() } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/login') && !url.startsWith('/auth/me')) window.dispatchEvent(new Event('bsc:unauthorized'));
    const det = data?.detalhes;
    throw new ApiError(res.status, data?.erro ?? 'Erro inesperado.', Array.isArray(det) ? det : undefined);
  }
  return data as T;
}
export const get = <T = any>(url: string) => api<T>('GET', url);
export const post = <T = any>(url: string, body?: unknown) => api<T>('POST', url, body ?? {});
export const patch = <T = any>(url: string, body: unknown) => api<T>('PATCH', url, body);
export const put = <T = any>(url: string, body: unknown) => api<T>('PUT', url, body);
export const del = <T = any>(url: string) => api<T>('DELETE', url);

/** Monta querystring ignorando vazios. */
export function qs(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Envio multipart (upload de arquivos). O navegador define o boundary; só o CSRF é enviado como cabeçalho. */
export async function upload<T = any>(url: string, form: FormData, method = 'POST'): Promise<T> {
  const res = await fetch(`${API_URL}${url}`, { method, credentials: 'include', headers: { 'X-CSRF-Token': csrf() }, body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('bsc:unauthorized'));
    const det = data?.detalhes;
    throw new ApiError(res.status, data?.erro ?? 'Erro inesperado.', Array.isArray(det) ? det : undefined);
  }
  return data as T;
}
