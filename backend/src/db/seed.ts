import { pathToFileURL } from 'node:url';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  db, pool, permissions, roles, rolePermissions, frentes, statusTbl, confidencialidades, tiposMovimentacao,
  tiposDocumento, tiposOcorrencia, configuracoes, users, alertas,
} from './index.js';
import { ALERTAS_PADRAO, CONFIG_PADRAO, FRENTES, PERMISSIONS, ROLES, STATUS_PADRAO } from './catalog.js';
import { hashPassword } from '../lib/auth.js';
import { config } from '../config.js';

/** Idempotente: pode ser executado várias vezes (não sobrescreve ajustes feitos pela administração). */
export async function runSeed() {
  await db.insert(permissions).values(PERMISSIONS).onConflictDoNothing();
  const perms = await db.select().from(permissions);

  for (const r of ROLES) {
    const [ex] = await db.select().from(roles).where(eq(roles.nome, r.nome));
    let roleId = ex?.id;
    if (!ex) [{ id: roleId }] = await db.insert(roles).values({ nome: r.nome, descricao: r.descricao, sistema: true, convidado: r.nome === 'CONVIDADO' }).returning({ id: roles.id });
    // ADMINISTRADOR sempre tem todas as permissões; demais perfis só recebem o padrão na criação
    if (!ex || r.nome === 'ADMINISTRADOR') {
      const ids = perms.filter((p) => r.permissoes.includes(p.codigo)).map((p) => p.id);
      await db.insert(rolePermissions).values(ids.map((permissionId) => ({ roleId: roleId!, permissionId }))).onConflictDoNothing();
    }
  }

  await db.insert(frentes).values(FRENTES.map(([codigo, nome], i) => ({ codigo, nome, ordem: i + 1 }))).onConflictDoNothing();
  await db.insert(statusTbl).values(STATUS_PADRAO.map((s, i) => ({ ...s, ordem: i + 1 }))).onConflictDoNothing();
  await db.insert(confidencialidades).values([{ nome: 'Livre', nivel: 0, regraAcesso: 'TODOS' as const }, { nome: 'Interno URBS', nivel: 1, regraAcesso: 'USUARIOS' as const }, { nome: 'Interno APD', nivel: 2, regraAcesso: 'EQUIPE_APD' as const }]).onConflictDoNothing();
  await db.insert(tiposMovimentacao).values(['Atualização', 'Reunião', 'Entrega', 'Decisão', 'Bloqueio', 'Contato externo', 'Observação'].map((nome) => ({ nome }))).onConflictDoNothing();
  await db.insert(tiposDocumento).values(['Relatório', 'Documento', 'Evidência', 'Termo de referência', 'Apresentação', 'Outro'].map((nome) => ({ nome }))).onConflictDoNothing();
  await db.insert(tiposOcorrencia).values(['Risco', 'Impedimento', 'Atraso', 'Mudança de escopo', 'Outro'].map((nome) => ({ nome }))).onConflictDoNothing();
  await db.insert(configuracoes).values(Object.entries(CONFIG_PADRAO).map(([chave, v]) => ({ chave, valor: v.valor as any, descricao: v.descricao }))).onConflictDoNothing();

  const [qa] = await db.select({ n: sql<number>`count(*)` }).from(alertas);
  if (Number(qa.n) === 0) await db.insert(alertas).values(ALERTAS_PADRAO.map((a) => ({ ...a, destinatarios: a.destinatarios as any })));

  const [admin] = await db.select().from(users).where(eq(users.username, config.admin.username));
  if (!admin) {
    const [role] = await db.select().from(roles).where(eq(roles.nome, 'ADMINISTRADOR'));
    await db.insert(users).values({
      username: config.admin.username, email: config.admin.email, nome: 'Administrador', roleId: role.id,
      passwordHash: await hashPassword(config.admin.password), mustChangePassword: true, pertenceApd: true,
    });
    return { adminCriado: true };
  }
  return { adminCriado: false };
}
void inArray; void sql;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await runSeed();
  console.log('Seed concluído.', r.adminCriado ? `Usuário inicial: ${config.admin.username} / ${config.admin.password} (troca obrigatória no 1º acesso)` : 'Administrador já existia.');
  await pool.end();
}
