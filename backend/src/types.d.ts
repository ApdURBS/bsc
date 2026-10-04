export interface AuthUser {
  id: number; nome: string; username: string; email: string; roleId: number; roleNome: string;
  permissions: Set<string>; sessionId: string; mustChangePassword: boolean;
  /** ids de confidencialidades que o usuário pode enxergar */ acessoIds: number[]; convidado: boolean; pertenceApd: boolean;
}
declare global {
  namespace Express { interface Request { user?: AuthUser } }
}
