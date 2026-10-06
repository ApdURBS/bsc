import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { get, post, setCsrfToken } from './api';

export interface Me { id: number; nome: string; username: string; email: string; perfil: string; mustChangePassword: boolean; permissoes: string[]; pertenceApd?: boolean; convidado?: boolean; acessoIds?: number[]; csrfToken?: string }
interface Ctx { me: Me | null; loading: boolean; can: (p: string) => boolean; reload: () => Promise<void>; logout: () => Promise<void> }
const AuthCtx = createContext<Ctx>(null as never);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();
  const reload = async () => {
    try { const m = await get<Me>('/auth/me'); setCsrfToken(m.csrfToken); setMe(m); } catch { setMe(null); } finally { setLoading(false); }
  };
  useEffect(() => { reload(); const f = () => { setMe(null); qc.clear(); }; window.addEventListener('bsc:unauthorized', f); return () => window.removeEventListener('bsc:unauthorized', f); }, []);
  const logout = async () => { try { await post('/auth/logout'); } finally { setMe(null); qc.clear(); } };
  const can = (p: string) => !!me?.permissoes.includes(p);
  return <AuthCtx.Provider value={{ me, loading, can, reload, logout }}>{children}</AuthCtx.Provider>;
}
