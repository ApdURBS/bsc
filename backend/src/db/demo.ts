// Dados de demonstração (opcional). Uso: npm run db:demo  — NÃO use em produção.
import { eq, sql } from 'drizzle-orm';
import { db, pool, frentes, roles, projetos, etapas, atividades, statusTbl, confidencialidades, movimentacoes, tiposMovimentacao, users, etapaMembros } from './index.js';
import { runSeed } from './seed.js';
import { hashPassword, randomToken } from '../lib/auth.js';
import { recalcEtapa, recalcProjeto } from '../lib/execucao.js';
import { hoje, somaDias } from '../lib/prazo.js';

await runSeed();
const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(projetos);
if (Number(n) > 0) { console.log('Já existem projetos; demonstração não aplicada.'); await pool.end(); process.exit(0); }

const nomes = ['Marcos', 'Thiago', 'Mariana', 'Igor', 'Eduardo', 'Monique'];
// pessoas de demonstração = usuários da APD/UPD (senha aleatória; o administrador pode redefini-la)
const [opRole] = await db.select().from(roles).where(eq(roles.nome, 'OPERADOR'));
for (const nome of nomes) {
  const slug = nome.toLowerCase();
  await db.insert(users).values({ nome, username: `demo.${slug}`, email: `${slug}@demo.urbs.local`, roleId: opRole.id, pertenceApd: true, mustChangePassword: true, passwordHash: await hashPassword(`Demo@${randomToken(8)}1a`) }).onConflictDoNothing();
}
const C = Object.fromEntries((await db.select().from(users)).map((c) => [c.nome, c.id]));
const F = Object.fromEntries((await db.select().from(frentes)).map((f) => [f.codigo, f.id]));
const S = Object.fromEntries((await db.select().from(statusTbl)).map((s) => [s.nome, s.id]));
const [conf] = await db.select().from(confidencialidades).where(eq(confidencialidades.nome, 'Interno URBS'));
const [admin] = await db.select().from(users).orderBy(users.id).limit(1);
const [tipo] = await db.select().from(tiposMovimentacao).where(eq(tiposMovimentacao.nome, 'Atualização'));
const h = hoje(); const d = (n: number) => somaDias(h, n);

const seq: Record<string, number> = {};
async function projeto(frente: string, nome: string, status: string, ini: number, fim: number, scrum: string, dono: string, prio = 'Média', ets: [string, string, [string, string][]][] = []) {
  seq[frente] = (seq[frente] ?? 0) + 1;
  const [p] = await db.insert(projetos).values({
    frenteId: F[frente], sequencia: seq[frente], codigo: `${frente}_${seq[frente]}`, nome, statusId: S[status], confidencialidadeId: conf.id,
    donoId: C[dono],
    pastaCaminho: `R:\\APD\\APD_UPD\\Novo2025\\${frente}\\${frente}_${seq[frente]}`, origemImportacao: 'demo',
  }).returning();
  // Scrum Master, equipe, tags e datas ficam nas etapas; o projeto sem etapas ganha uma etapa única.
  if (!ets.length) ets = [['Execução', status === 'Finalizado' ? 'Finalizado' : status, []]];
  const passo = Math.max(1, Math.round((fim - ini) / ets.length));
  let ord = 0;
  for (const [nomeE, statusE, atvs] of ets) {
    ord++;
    const letra = String.fromCharCode(64 + ord);
    const [e] = await db.insert(etapas).values({ projetoId: p.id, letra, ordem: ord, nome: nomeE, statusId: S[statusE], responsavelId: C[scrum], scrumMasterId: C[scrum], tags: ['demo'], dataInicio: d(ini + (ord - 1) * passo), dataPrevista: d(ord === ets.length ? fim : ini + ord * passo) }).returning();
    await db.insert(etapaMembros).values([...new Set([C[scrum], C[dono]])].map((userId) => ({ etapaId: e.id, userId })));
    for (const [nomeA, statusA] of atvs) await db.insert(atividades).values({ etapaId: e.id, nome: nomeA, statusId: S[statusA], responsavelId: C[scrum] });
    await recalcEtapa(db, e.id);
  }
  await recalcProjeto(db, p.id);
  return p;
}
async function mov(p: { id: number }, dias: number, txt: string) {
  const dt = new Date(Date.now() - dias * 86400000);
  await db.insert(movimentacoes).values({ projetoId: p.id, usuarioId: admin.id, tipoId: tipo.id, descricao: txt, dataHora: dt });
  await db.update(projetos).set({ ultimaMovimentacaoEm: sql`GREATEST(COALESCE(${projetos.ultimaMovimentacaoEm}, ${dt.toISOString()}::timestamptz), ${dt.toISOString()}::timestamptz)` }).where(eq(projetos.id, p.id));
}

const ar = await projeto('2', 'Licitação de Ar-Condicionado', 'Em andamento', -40, 25, 'Marcos', 'Thiago', 'Alta', [
  ['Elaboração do Termo de Referência', 'Finalizado', [['Elaborar Termo de Referência', 'Finalizado'], ['Levantar especificações técnicas', 'Finalizado']]],
  ['Pesquisa de Orçamentos', 'Em andamento', [['Solicitar orçamentos', 'Finalizado'], ['Validar orçamento', 'Em andamento']]],
  ['Elaboração do Estudo Técnico Preliminar', 'Aguardando', [['Redigir ETP', 'Aguardando']]],
  ['Análise Jurídica', 'Aguardando', []],
]);
await mov(ar, 12, 'Termo de referência revisado e encaminhado para análise.'); await mov(ar, 3, 'Recebidos três novos orçamentos.');
const t = await projeto('2', 'Revitalização do Terminal Boa Vista', 'Atrasado', -90, -10, 'Mariana', 'Thiago', 'Crítica', [
  ['Conceito do projeto', 'Finalizado', [['Levantamento inicial', 'Finalizado']]], ['Layout', 'Em andamento', [['Desenho do layout', 'Em andamento'], ['Validação com operação', 'Aguardando']]],
]); await mov(t, 30, 'Layout enviado para validação.');
const v = await projeto('1', 'Estudo VLT — Caderno Técnico', 'Em atenção', -30, 12, 'Marcos', 'Thiago', 'Alta', [['Premissas', 'Finalizado', [['Discussão de premissas', 'Finalizado']]], ['Caderno técnico', 'Em andamento', [['Redigir caderno', 'Em andamento']]]]); await mov(v, 2, 'Reunião de alinhamento com a diretoria.');
const b = await projeto('1', 'Acompanhamento BNDES', 'Suspenso', -120, 60, 'Mariana', 'Thiago', 'Baixa'); await mov(b, 45, 'Suspenso a pedido da diretoria.');
const s1 = await projeto('3', 'Comunicação na RIT — 8 ao 80', 'Em andamento', -20, 90, 'Igor', 'Marcos', 'Média', [['Diagnóstico', 'Em andamento', [['Levantar canais atuais', 'Em andamento']]]]); await mov(s1, 20, 'Início do diagnóstico.');
await projeto('3', 'Painel de indicadores operacionais', 'Bloqueado', -50, 20, 'Eduardo', 'Marcos', 'Alta', [['Modelagem de dados', 'Bloqueado', [['Definir fontes', 'Bloqueado']]]]);
await projeto('4', 'Programa de capacitação em planejamento', 'Aguardando', 10, 150, 'Monique', 'Igor', 'Baixa');
await projeto('4', 'Trilha de aprendizado BSC', 'Finalizado', -100, -20, 'Igor', 'Marcos', 'Média', [['Conteúdo', 'Finalizado', [['Produzir material', 'Finalizado']]]]);
await projeto('5', 'Consultoria Apucarana — estruturação', 'Em andamento', -60, 45, 'Marcos', 'Thiago', 'Alta', [['Levantamento tarifário', 'Finalizado', [['Coletar planilhas', 'Finalizado']]], ['Auditoria do cálculo', 'Em andamento', [['Conferir metodologia GEIPOT', 'Em andamento']]]]);
await projeto('6', 'Modernização do controle de projetos', 'Em andamento', -5, 120, 'Marcos', 'Thiago', 'Crítica', [['Levantamento de requisitos', 'Finalizado', [['Mapear planilha atual', 'Finalizado']]], ['Desenvolvimento', 'Em andamento', [['Construir sistema', 'Em andamento']]]]);
console.log('Dados de demonstração criados.');
await pool.end();
