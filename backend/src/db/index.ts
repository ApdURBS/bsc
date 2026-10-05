import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { config } from '../config.js';

// Supabase (e a maioria dos Postgres gerenciados) exige SSL. Detecta pela própria DATABASE_URL
// (não só por NODE_ENV=production), pois local/dev também pode apontar para um banco Supabase
// real (ex. para rodar migrations antes do primeiro deploy). A cadeia de certificado do Supabase
// não precisa de validação estrita para a connection string padrão do pooler.
// O parâmetro sslmode na própria URL tem prioridade sobre a opção `ssl` do driver (e provoca
// validação estrita da cadeia de certificado) — removemos para que o `ssl` abaixo sempre valha.
const precisaSsl = /sslmode=require|supabase\.(co|com)/i.test(config.databaseUrl);
const connectionString = config.databaseUrl.replace(/([?&])sslmode=[^&]*&?/i, '$1').replace(/[?&]$/, '');
export const pool = new pg.Pool({
  connectionString,
  max: config.dbPoolMax,
  ssl: precisaSsl ? { rejectUnauthorized: false } : undefined,
});
// DATE como string 'YYYY-MM-DD' (sem deslocamento de fuso)
pg.types.setTypeParser(1082, (v: string) => v);
export const db = drizzle(pool, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = DB | Tx;
export * from './schema.js';
