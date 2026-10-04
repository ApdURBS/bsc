import { sql } from 'drizzle-orm';
import { db, alertas, notificacoes } from '../db/index.js';
import { diasEntre, hoje, somaDias } from './prazo.js';
import { diasSemMovimentacao } from './projetos.js';

export const TIPOS_ALERTA = ['PRAZO_PROXIMO', 'ATRASO', 'SEM_MOVIMENTACAO', 'ETAPAS_ATRASADAS_USUARIO'] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];
export const FREQUENCIAS = ['DIARIA', 'SEMANAL', 'UNICA'] as const;
type Dest = { participantes?: boolean; userIds?: number[] };

/** Período de deduplicação: DIARIA = um aviso por dia · SEMANAL = um por semana (segunda a domingo) · UNICA = uma vez só. */
export function periodo(freq: string, today = hoje()): string {
  if (freq === 'UNICA') return 'u';
  if (freq === 'SEMANAL') { const dow = new Date(today + 'T12:00:00Z').getUTCDay(); return somaDias(today, -((dow + 6) % 7)); }
  return today;
}

interface Evento { chave: string; tipo: string; mensagem: string; projetoId: number; etapaId?: number; confId: number; participantes: number[] }
interface Pessoa { id: number; nome: string; apd: boolean; convidado: boolean; admin: boolean }

const rowsOf = async <T>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];
const dias = (n: number) => `${n} dia${n === 1 ? '' : 's'}`;
const quando = (d: number) => (d === 0 ? 'vence hoje' : `vence em ${dias(d)}`);

/** Quem enxerga o projeto — mesma política de confidencialidade do restante do sistema. */
function podeVer(u: Pessoa, regra: string) { return u.admin || u.apd || (u.convidado ? regra === 'TODOS' : regra !== 'EQUIPE_APD'); }

/** Gera as notificações de todas as regras ativas. Seguro para rodar várias vezes: a chave de deduplicação impede repetição. */
export async function gerarNotificacoes(today = hoje()): Promise<{ criadas: number; regras: number }> {
  const regras = await db.select().from(alertas).where(sql`${alertas.ativo}`);
  if (!regras.length) return { criadas: 0, regras: 0 };
  const pessoas = await rowsOf<{ id: number; nome: string; apd: boolean; convidado: boolean; role: string }>(sql`
    SELECT u.id, u.nome, u.pertence_apd AS apd, r.convidado, r.nome AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.ativo AND r.ativo`);
  const P = new Map<number, Pessoa>(pessoas.map((u) => [u.id, { id: u.id, nome: u.nome, apd: u.apd, convidado: u.convidado, admin: u.role === 'ADMINISTRADOR' }]));
  const regraDe = new Map((await rowsOf<{ id: number; regra: string }>(sql`SELECT id, regra_acesso AS regra FROM confidencialidades`)).map((c) => [c.id, c.regra]));

  // participantes por projeto (dono + responsável/Scrum/equipe das etapas) e por etapa
  const partProj = new Map<number, Set<number>>(); const partEtapa = new Map<number, Set<number>>();
  const add = (m: Map<number, Set<number>>, k: number, u: number | null) => { if (u == null) return; (m.get(k) ?? m.set(k, new Set()).get(k)!).add(u); };
  for (const r of await rowsOf<{ id: number; dono: number | null }>(sql`SELECT id, dono_id AS dono FROM projetos WHERE ativo`)) add(partProj, r.id, r.dono);
  for (const r of await rowsOf<{ id: number; projeto: number; resp: number | null; scrum: number | null }>(sql`SELECT id, projeto_id AS projeto, responsavel_id AS resp, scrum_master_id AS scrum FROM etapas WHERE ativo`)) {
    for (const u of [r.resp, r.scrum]) { add(partProj, r.projeto, u); add(partEtapa, r.id, u); }
  }
  for (const r of await rowsOf<{ etapa: number; projeto: number; u: number }>(sql`SELECT em.etapa_id AS etapa, e.projeto_id AS projeto, em.user_id AS u FROM etapa_membros em JOIN etapas e ON e.id = em.etapa_id WHERE e.ativo`)) { add(partProj, r.projeto, r.u); add(partEtapa, r.etapa, r.u); }
  const donoDe = new Map((await rowsOf<{ id: number; dono: number | null }>(sql`SELECT id, dono_id AS dono FROM projetos`)).map((r) => [r.id, r.dono]));

  const candidatos: Evento[] = [];
  const abertoP = sql`s.classificacao NOT IN ('CONCLUIDO','CANCELADO')`;

  type Lin = { id: number; codigo: string; letra?: string; projeto: number; conf: number; prevista: string | null; ultima?: Date | null; criado?: Date; classe?: string };
  const projetos = async () => rowsOf<Lin>(sql`SELECT p.id, p.codigo, p.id AS projeto, p.confidencialidade_id AS conf, p.data_prevista::text AS prevista, p.ultima_movimentacao_em AS ultima, p.created_at AS criado, s.classificacao AS classe
    FROM projetos p JOIN status s ON s.id = p.status_id WHERE p.ativo AND ${abertoP}`);
  const etapasAbertas = async () => rowsOf<Lin>(sql`SELECT e.id, p.codigo, e.letra, p.id AS projeto, p.confidencialidade_id AS conf, e.data_prevista::text AS prevista, s.classificacao AS classe
    FROM etapas e JOIN projetos p ON p.id = e.projeto_id JOIN status s ON s.id = e.status_id WHERE e.ativo AND p.ativo AND ${abertoP}`);

  const regrasPorTipo = (t: TipoAlerta) => regras.filter((r) => r.tipo === t);
  const evento = (r: (typeof regras)[number], tipo: string, item: string, msg: string, lin: Lin, etapaId: number | undefined, base: Set<number> | undefined): Evento => {
    const dest = (r.destinatarios ?? {}) as Dest;
    const set = new Set<number>(dest.userIds ?? []);
    if (dest.participantes !== false) { for (const u of base ?? []) set.add(u); const d = donoDe.get(lin.projeto); if (etapaId && d) set.add(d); }
    return { chave: `${tipo}:${r.id}:${item}:${periodo(r.frequencia, today)}`, tipo, mensagem: msg, projetoId: lin.projeto, etapaId, confId: lin.conf, participantes: [...set] };
  };

  // 1) Prazo próximo
  // Com várias regras de prazo, vale a de menor antecedência que alcança o item (evita aviso duplicado: 7 dias diário vence o de 30 dias semanal).
  const jaAvisado = new Set<string>();
  for (const r of regrasPorTipo('PRAZO_PROXIMO').sort((a, b) => (a.antecedenciaDias ?? 30) - (b.antecedenciaDias ?? 30))) {
    const n = r.antecedenciaDias ?? 30;
    for (const p of await projetos()) if (p.prevista && diasEntre(today, p.prevista) >= 0 && diasEntre(today, p.prevista) <= n && !jaAvisado.has(`P${p.id}`) && jaAvisado.add(`P${p.id}`))
      candidatos.push(evento(r, 'PRAZO_PROXIMO', `P${p.id}`, `Projeto ${p.codigo} ${quando(diasEntre(today, p.prevista))}.`, p, undefined, partProj.get(p.id)));
    for (const e of await etapasAbertas()) if (e.prevista && diasEntre(today, e.prevista) >= 0 && diasEntre(today, e.prevista) <= n && !jaAvisado.has(`E${e.id}`) && jaAvisado.add(`E${e.id}`))
      candidatos.push(evento(r, 'PRAZO_PROXIMO', `E${e.id}`, `A etapa ${e.codigo} ${e.letra} ${quando(diasEntre(today, e.prevista))}.`, e, e.id, partEtapa.get(e.id)));
  }
  // 2) Atraso
  const atrasado = (l: Lin) => l.classe === 'ATRASO' || (!!l.prevista && l.prevista < today);
  for (const r of regrasPorTipo('ATRASO')) {
    for (const p of await projetos()) if (atrasado(p)) candidatos.push(evento(r, 'ATRASO', `P${p.id}`, `O projeto ${p.codigo} está atrasado.`, p, undefined, partProj.get(p.id)));
    for (const e of await etapasAbertas()) if (atrasado(e)) candidatos.push(evento(r, 'ATRASO', `E${e.id}`, `A etapa ${e.codigo} ${e.letra} está atrasada.`, e, e.id, partEtapa.get(e.id)));
  }
  // 3) Sem movimentação
  for (const r of regrasPorTipo('SEM_MOVIMENTACAO')) {
    const n = r.antecedenciaDias ?? 15;
    for (const p of await projetos()) {
      const d = diasSemMovimentacao(p.ultima ? new Date(p.ultima) : null, new Date(p.criado!), today);
      if (d > n) candidatos.push(evento(r, 'SEM_MOVIMENTACAO', `P${p.id}`, `O projeto ${p.codigo} está sem movimentação há ${dias(d)}.`, p, undefined, partProj.get(p.id)));
    }
  }
  // 4) Pessoa com etapas atrasadas: avisa a própria pessoa e os destinatários extras da regra
  const porPessoa = new Map<number, Lin[]>();
  for (const e of (await etapasAbertas()).filter(atrasado)) for (const u of partEtapa.get(e.id) ?? []) (porPessoa.get(u) ?? porPessoa.set(u, []).get(u)!).push(e);
  for (const r of regrasPorTipo('ETAPAS_ATRASADAS_USUARIO')) {
    const minimo = r.antecedenciaDias ?? 1; const dest = (r.destinatarios ?? {}) as Dest;
    for (const [uid, lst] of porPessoa) {
      if (lst.length < minimo) continue;
      const nome = P.get(uid)?.nome ?? 'Usuário'; const base = { projeto: lst[0].projeto, conf: lst[0].conf } as Lin;
      const chave = `ETAPAS_ATRASADAS_USUARIO:${r.id}:U${uid}:${periodo(r.frequencia, today)}`;
      if (dest.participantes !== false) candidatos.push({ chave, tipo: 'ETAPAS_ATRASADAS_USUARIO', mensagem: `Você possui ${lst.length} etapa${lst.length === 1 ? '' : 's'} atrasada${lst.length === 1 ? '' : 's'}.`, projetoId: base.projeto, confId: base.conf, participantes: [uid] });
      for (const outro of dest.userIds ?? []) if (outro !== uid) candidatos.push({ chave: `${chave}:p${outro}`, tipo: 'ETAPAS_ATRASADAS_USUARIO', mensagem: `${nome} possui ${lst.length} etapa${lst.length === 1 ? '' : 's'} atrasada${lst.length === 1 ? '' : 's'}.`, projetoId: base.projeto, confId: base.conf, participantes: [outro] });
    }
  }

  // grava, respeitando a confidencialidade de cada destinatário
  const linhas: (typeof notificacoes.$inferInsert)[] = [];
  for (const c of candidatos) {
    const regra = regraDe.get(c.confId) ?? 'USUARIOS';
    for (const uid of c.participantes) { const u = P.get(uid); if (u && podeVer(u, regra)) linhas.push({ userId: uid, tipo: c.tipo, mensagem: c.mensagem, projetoId: c.projetoId, etapaId: c.etapaId ?? null, chave: c.chave }); }
  }
  let criadas = 0;
  for (let i = 0; i < linhas.length; i += 500) {
    const r = await db.insert(notificacoes).values(linhas.slice(i, i + 500)).onConflictDoNothing().returning({ id: notificacoes.id });
    criadas += r.length;
  }
  return { criadas, regras: regras.length };
}
