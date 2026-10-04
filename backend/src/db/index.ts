import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { config } from '../config.js';

// Supabase (e a maioria dos Postgres gerenciados) exige SSL; em produção a cadeia de certificado
// geralmente não precisa de validação estrita para a connection string padrão do pooler.
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
  ssl: config.isProd ? { rejectUnauthorized: false } : undefined,
});
// DATE como string 'YYYY-MM-DD' (sem deslocamento de fuso)
pg.types.setTypeParser(1082, (v: string) => v);
export const db = drizzle(pool, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = DB | Tx;
export * from './schema.js';
