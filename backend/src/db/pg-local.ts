/**
 * Banco PostgreSQL local para quem não tem Docker nem PostgreSQL instalado.
 * Baixa/usa binários oficiais do PostgreSQL via npm, guarda os dados em ../.dados-pg e fica em execução
 * até a janela ser fechada (Ctrl+C). Usuário/senha/banco: bsc / bsc / bsc  (porta 5432).
 */
import fs from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const dir = path.resolve(process.cwd(), '..', '.dados-pg');
const port = Number(process.env.PG_LOCAL_PORT ?? 5432);
const primeiraVez = !fs.existsSync(path.join(dir, 'PG_VERSION'));

const pg = new EmbeddedPostgres({
  databaseDir: dir, user: 'bsc', password: 'bsc', port, persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: (e) => console.error(String(e)),
});

async function parar() { try { await pg.stop(); } catch { /* ignorar */ } process.exit(0); }
process.on('SIGINT', parar); process.on('SIGTERM', parar);

if (primeiraVez) { console.log('Criando o banco de dados local (primeira vez, pode levar alguns segundos)...'); await pg.initialise(); }
await pg.start();
if (primeiraVez) await pg.createDatabase('bsc');
else { try { await pg.createDatabase('bsc'); } catch { /* já existe */ } }
console.log(`\nBanco PostgreSQL pronto em localhost:${port} (dados em ${dir}).\nDeixe esta janela aberta enquanto usa o sistema.`);
setInterval(() => {}, 1 << 30);
