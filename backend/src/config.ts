import 'dotenv/config';

const env = process.env;
export const config = {
  env: env.NODE_ENV ?? 'development',
  isProd: env.NODE_ENV === 'production',
  port: Number(env.PORT ?? 3000),
  databaseUrl: env.DATABASE_URL ?? '',
  jwtSecret: env.JWT_SECRET ?? '',
  sessionHours: Number(env.SESSION_HOURS ?? 8),
  appUrl: env.APP_URL ?? 'http://localhost:5173',
  uploadDir: env.UPLOAD_DIR ?? `${process.cwd()}/storage`,
  maxUploadMb: Number(env.MAX_UPLOAD_MB ?? 25),
  tz: env.TZ ?? 'America/Sao_Paulo',
  admin: {
    username: env.ADMIN_USERNAME ?? 'admin',
    email: env.ADMIN_EMAIL ?? 'admin@urbs.local',
    password: env.ADMIN_INITIAL_PASSWORD ?? 'Trocar@123',
  },
  smtp: { host: env.SMTP_HOST, port: Number(env.SMTP_PORT ?? 587), user: env.SMTP_USER, pass: env.SMTP_PASS, from: env.SMTP_FROM ?? 'Controle BSC <noreply@urbs.local>' },
  // API HTTP da Brevo (porta 443, nunca bloqueada por egress de PaaS) — alternativa ao SMTP puro,
  // que vários hosts (ex. Render) bloqueiam/restringem na saída. Se definida, tem prioridade sobre o SMTP acima.
  brevoApiKey: env.BREVO_API_KEY ?? '',
  // Origens aceitas no CORS (frontend separado, ex. Vercel). Lista separada por vírgula; padrão = APP_URL.
  corsOrigins: (env.CORS_ORIGIN ?? env.APP_URL ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  // Supabase Storage para documentos (opcional): sem isso, uploads usam disco local (UPLOAD_DIR) — adequado para dev/testes, não para Render em produção.
  supabase: {
    url: env.SUPABASE_URL ?? '',
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    bucket: env.SUPABASE_STORAGE_BUCKET ?? 'documentos',
  },
  dbPoolMax: Number(env.DB_POOL_MAX ?? (env.NODE_ENV === 'production' ? 5 : 10)),
};

if (config.isProd && (config.jwtSecret.length < 32 || config.jwtSecret.startsWith('troque'))) {
  throw new Error('JWT_SECRET inseguro: defina um segredo forte (>= 32 caracteres) em produção.');
}
if (!config.jwtSecret) config.jwtSecret = 'dev-only-secret-change-me-dev-only-secret-change-me';
if (config.isProd && !(config.supabase.url && config.supabase.serviceRoleKey)) {
  console.warn('[AVISO] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados em produção: uploads de documentos usarão disco local, que é apagado a cada reinício/deploy no Render. Configure o Supabase Storage antes de usar em produção.');
}
