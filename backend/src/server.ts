import { gerarNotificacoes } from './lib/alertas.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createApp } from './app.js';
import { config } from './config.js';
import { db, pool } from './db/index.js';
import { runSeed } from './db/seed.js';

/** Garante banco acessível, tabelas criadas e cadastros básicos antes de aceitar requisições. */
async function preparar() {
  try {
    await pool.query('select 1');
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.error('\n[ERRO] Não foi possível conectar ao PostgreSQL.');
    console.error(`       DATABASE_URL = ${config.databaseUrl.replace(/:[^:@/]*@/, ':***@')}`);
    console.error(`       Motivo: ${err.code ?? ''} ${err.message ?? e}`);
    console.error('       → Se usa Docker: execute "docker compose up -d db" e aguarde ~10 segundos.');
    console.error('       → Confira usuário/senha/porta em backend/.env.\n');
    process.exit(1);
  }
  await migrate(db, { migrationsFolder: './drizzle' });
  await runSeed();
}

await preparar();
createApp().listen(config.port, () => console.log(`Controle BSC — API em http://localhost:${config.port}/api (${config.env})`));

// Gera as notificações dos alertas ao iniciar e a cada hora (a chave de deduplicação evita repetição).
const rodarAlertas = () => gerarNotificacoes().then((r) => r.criadas && console.log(`Alertas: ${r.criadas} notificação(ões) criada(s).`)).catch((e) => console.error('Falha ao gerar alertas:', e.message));
setTimeout(rodarAlertas, 5_000);
setInterval(rodarAlertas, 60 * 60 * 1000).unref();
