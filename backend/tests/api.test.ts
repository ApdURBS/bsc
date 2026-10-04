import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import pg from 'pg';

let app: any; let pool: pg.Pool;
type Agent = ReturnType<typeof request.agent> & { csrf: string };

async function login(usuario: string, senha: string): Promise<Agent> {
  const ag = request.agent(app) as Agent;
  const r = await ag.post('/api/auth/login').send({ usuario, senha });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  const csrf = (r.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('bsc_csrf='))!.split(';')[0].split('=')[1];
  ag.csrf = csrf;
  return ag;
}
const post = (a: Agent, url: string, body: any = {}) => a.post(url).set('x-csrf-token', a.csrf).send(body);
const patch = (a: Agent, url: string, body: any) => a.patch(url).set('x-csrf-token', a.csrf).send(body);
const put = (a: Agent, url: string, body: any) => a.put(url).set('x-csrf-token', a.csrf).send(body);

let admin: Agent, op: Agent, cons: Agent;
let frente: Record<string, number> = {};
let colab: Record<string, number> = {};
let tipoMov: number, statusIds: Record<string, number> = {};

beforeAll(async () => {
  const setup = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await setup.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
  await setup.end();
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const dbm = await import('../src/db/index.js');
  await migrate(dbm.db, { migrationsFolder: './drizzle' });
  const { runSeed } = await import('../src/db/seed.js');
  await runSeed();
  pool = dbm.pool;
  const { createApp } = await import('../src/app.js');
  app = createApp();
});
afterAll(async () => { await pool.end(); });

describe('Fase 1 — autenticação, usuários, perfis, permissões', () => {
  it('bloqueia o sistema até a troca de senha obrigatória', async () => {
    const ag = await login('admin', 'Admin@12345');
    expect((await ag.get('/api/projects')).status).toBe(403);
    const r = await post(ag, '/api/auth/change-password', { senhaAtual: 'Admin@12345', novaSenha: 'fraca' });
    expect(r.status).toBe(400);
    const ok = await post(ag, '/api/auth/change-password', { senhaAtual: 'Admin@12345', novaSenha: 'Nova@Senha1' });
    expect(ok.status).toBe(200);
    expect((await ag.get('/api/auth/me')).status).toBe(401); // sessões encerradas
    admin = await login('admin', 'Nova@Senha1');
    expect((await admin.get('/api/projects')).status).toBe(200);
  });

  it('rejeita login inválido e exige CSRF nas alterações', async () => {
    const r = await request(app).post('/api/auth/login').send({ usuario: 'admin', senha: 'errada' });
    expect(r.status).toBe(401);
    const semCsrf = await admin.post('/api/frentes').send({ nome: 'Teste' });
    expect(semCsrf.status).toBe(403);
  });

  it('administrador cria usuários e define perfis (critérios 1 e 2)', async () => {
    const roles = (await admin.get('/api/roles')).body;
    const rid = (n: string) => roles.find((r: any) => r.nome === n).id;
    expect(roles.map((r: any) => r.nome).sort()).toEqual(['ADMINISTRADOR', 'CONSULTA', 'CONVIDADO', 'OPERADOR']);
    const a = await post(admin, '/api/users', { nome: 'Operador Teste', username: 'operador', email: 'op@urbs.local', senha: 'Operador@1', roleId: rid('OPERADOR') });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    const b = await post(admin, '/api/users', { nome: 'Consulta Teste', username: 'consulta', email: 'co@urbs.local', senha: 'Consulta@1', roleId: rid('CONSULTA') });
    expect(b.status).toBe(201);
    expect((await post(admin, '/api/users', { nome: 'Dup', username: 'operador', email: 'x@y.com', senha: 'Operador@1', roleId: rid('OPERADOR') })).status).toBe(409);
    for (const [u, s] of [['operador', 'Operador@1'], ['consulta', 'Consulta@1']]) {
      const ag = await login(u, s); await post(ag, '/api/auth/change-password', { senhaAtual: s, novaSenha: s + 'x' });
    }
    op = await login('operador', 'Operador@1x'); cons = await login('consulta', 'Consulta@1x');
  });

  it('respeita permissões por perfil', async () => {
    expect((await op.get('/api/users')).status).toBe(403);
    expect((await op.get('/api/audit')).status).toBe(403);
    expect((await cons.post('/api/projects').set('x-csrf-token', cons.csrf).send({})).status).toBe(403);
    expect((await cons.get('/api/projects')).status).toBe(200);
    expect((await post(op, '/api/frentes', { nome: 'Nova' })).status).toBe(403);
  });

  it('cadastros base: frentes, status, pessoas (usuários da APD/UPD)', async () => {
    const fs = (await admin.get('/api/frentes')).body; expect(fs).toHaveLength(6);
    for (const f of fs) frente[f.codigo] = f.id;
    const st = (await admin.get('/api/status')).body; expect(st.map((s: any) => s.nome)).toContain('Em atenção');
    for (const s of st) statusIds[s.nome] = s.id;
    const opRole = (await admin.get('/api/roles')).body.find((r: any) => r.nome === 'OPERADOR').id;
    for (const n of ['Marcos', 'Thiago', 'Mariana']) {
      const r = await post(admin, '/api/users', { nome: n, username: n.toLowerCase(), email: `${n.toLowerCase()}@urbs.local`, senha: 'Senha@1234', roleId: opRole, pertenceApd: true });
      expect(r.status, JSON.stringify(r.body)).toBe(201); colab[n] = r.body.id;
    }
    // só usuários ativos marcados como APD/UPD aparecem para Dono / Scrum Master / equipe
    const pessoas = (await op.get('/api/users/pessoas')).body.map((x: any) => x.nome);
    expect(pessoas).toEqual(expect.arrayContaining(['Marcos', 'Thiago', 'Mariana']));
    expect(pessoas).not.toContain('Operador Teste'); expect(pessoas).not.toContain('Consulta Teste');
    tipoMov = (await admin.get('/api/tipos-movimentacao')).body.find((t: any) => t.nome === 'Atualização').id;
    const nova = await post(admin, '/api/frentes', { nome: 'Sétima frente' });
    expect(nova.body.codigo).toBe('7');
  });

  it('recuperação de senha por link de uso único', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = await request(app).post('/api/auth/forgot-password').send({ usuario: 'consulta' });
    expect(r.status).toBe(200);
    const txt = spy.mock.calls.map((c) => String(c[0])).join('\n'); spy.mockRestore();
    const token = /token=([a-f0-9]+)/.exec(txt)![1];
    const ok = await request(app).post('/api/auth/reset-password').send({ token, novaSenha: 'Redefinida@1' });
    expect(ok.status).toBe(200);
    expect((await request(app).post('/api/auth/reset-password').send({ token, novaSenha: 'Redefinida@2' })).status).toBe(400);
    cons = await login('consulta', 'Redefinida@1');
  });
});

let p1: number, p2: number;
describe('Fase 2 — projetos, etapas, atividades, prazos', () => {
  it('gera o código automaticamente por frente (critérios 3 e 4)', async () => {
    const mk = (f: string, nome: string, extra: any = {}) => post(op, '/api/projects', { frenteId: frente[f], nome, donoId: colab.Thiago, ...extra });
    const a = await mk('2', 'Licitação de Ar-Condicionado'); expect(a.status, JSON.stringify(a.body)).toBe(201); expect(a.body.codigo).toBe('2_1'); p1 = a.body.id;
    const b = await mk('2', 'Outro projeto'); expect(b.body.codigo).toBe('2_2'); p2 = b.body.id;
    const c = await mk('1', 'Financeiro'); expect(c.body.codigo).toBe('1_1');
    const prev = await op.get(`/api/projects/next-code?frenteId=${frente['2']}`); expect(prev.body.codigo).toBe('2_3');
    // concorrência: 6 criações simultâneas nunca duplicam código
    const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => mk('3', `Paralelo ${i}`)));
    expect(rs.every((r) => r.status === 201)).toBe(true);
    expect(new Set(rs.map((r) => r.body.codigo)).size).toBe(6);
    expect(rs.map((r) => r.body.codigo).sort()).toEqual(['3_1', '3_2', '3_3', '3_4', '3_5', '3_6']);
  });

  it('valida dados do projeto', async () => {
    expect((await post(op, '/api/projects', { frenteId: frente['2'], nome: 'ab' })).status).toBe(422);
    const pj = await post(op, '/api/projects', { frenteId: frente['3'], nome: 'Datas erradas' });
    expect((await post(op, `/api/projects/${pj.body.id}/stages`, { nome: 'Etapa datas erradas', dataInicio: '2026-05-10', dataPrevista: '2026-05-01' })).status).toBe(400);
  });

  it('sugere e cria etapas em sequência A, B, C… (critério 5)', async () => {
    expect((await op.get(`/api/projects/${p1}/stages/next-letter`)).body.letra).toBe('A');
    const a = await post(op, `/api/projects/${p1}/stages`, { nome: 'Elaboração do Termo de Referência' }); expect(a.body.codigo).toBe('2_1 A');
    const b = await post(op, `/api/projects/${p1}/stages`, { nome: 'Pesquisa de Orçamentos' }); expect(b.body.letra).toBe('B');
    // operador não pode mudar a sequência; administrador pode
    expect((await post(op, `/api/projects/${p1}/stages`, { nome: 'Etapa X', letra: 'F' })).status).toBe(400);
    expect((await post(admin, `/api/projects/${p1}/stages`, { nome: 'Salto', letra: 'D' })).body.letra).toBe('D');
    expect((await post(admin, `/api/projects/${p1}/stages`, { nome: 'Repetida', letra: 'B' })).status).toBe(409);
    expect((await op.get(`/api/projects/${p1}/stages/next-letter`)).body.letra).toBe('E');
    const la = (l: string) => op.get(`/api/projects/${p1}/stages/letter-available?letra=${l}`).then((r) => r.body);
    expect(await la('A')).toMatchObject({ disponivel: false, motivo: expect.stringMatching(/já existe/) }); expect(await la('e')).toMatchObject({ disponivel: true }); expect((await la('1')).disponivel).toBe(false);
  });

  it('atividades e execução automática (critérios 6 e 7)', async () => {
    const stages = (await op.get(`/api/projects/${p1}/stages`)).body;
    const A = stages.find((s: any) => s.letra === 'A');
    const a1 = await post(op, `/api/stages/${A.id}/activities`, { nome: 'Elaborar TR', responsavelId: colab.Marcos });
    const a2 = await post(op, `/api/stages/${A.id}/activities`, { nome: 'Levantar especificações' });
    expect(a1.status).toBe(201);
    expect((await patch(op, `/api/activities/${a1.body.id}`, { statusId: statusIds['Finalizado'] })).status).toBe(200);
    let et = (await op.get(`/api/stages/${A.id}`)).body; expect(et.percentualExecucao).toBe(50);
    await patch(op, `/api/activities/${a2.body.id}`, { statusId: statusIds['Finalizado'] });
    et = (await op.get(`/api/stages/${A.id}`)).body; expect(et.percentualExecucao).toBe(100);
    // etapa concluída → projeto: 1 de 3 etapas (A concluída; B, D abertas)
    await patch(op, `/api/stages/${A.id}`, { statusId: statusIds['Finalizado'] });
    const proj = (await op.get(`/api/projects/${p1}`)).body;
    expect(proj.percentualExecucao).toBe(33);
    expect(proj.totais).toMatchObject({ etapas: 3, etapasConcluidas: 1, atividades: 2 });
    expect(et.dataConclusaoReal ?? (await op.get(`/api/stages/${A.id}`)).body.dataConclusaoReal).toBeTruthy();
  });

  it('identifica atraso e situação do prazo automaticamente (critérios 8 e 9)', async () => {
    const { hoje, somaDias } = await import('../src/lib/prazo.js');
    const h = hoje();
    // datas do projeto são derivadas das etapas
    const mk = async (nome: string, prev: string) => {
      const pj = (await post(op, '/api/projects', { frenteId: frente['4'], nome, statusId: statusIds['Em andamento'] })).body;
      await post(op, `/api/projects/${pj.id}/stages`, { nome: 'Etapa única', dataInicio: somaDias(h, -60), dataPrevista: prev, statusId: statusIds['Em andamento'] });
      return pj;
    };
    const vencido = await mk('Projeto vencido', somaDias(h, -12));
    const critico = await mk('Projeto crítico', somaDias(h, 5));
    const atencao = await mk('Projeto atenção', somaDias(h, 20));
    const normal = await mk('Projeto normal', somaDias(h, 100));
    const get = async (id: number) => (await op.get(`/api/projects/${id}`)).body;
    let v = await get(vencido.id); expect(v.prazo).toMatchObject({ situacao: 'VENCIDO', diasAtraso: 12 }); expect(v.atrasado).toBe(true);
    expect((await get(critico.id)).prazo).toMatchObject({ situacao: 'CRITICO', diasRestantes: 5 });
    expect((await get(atencao.id)).prazo.situacao).toBe('ATENCAO');
    expect((await get(normal.id)).prazo.situacao).toBe('NORMAL');
    const lista = (await op.get('/api/projects?situacaoPrazo=VENCIDO')).body; expect(lista.itens.map((x: any) => x.codigo)).toContain(vencido.codigo);
    const atrasados = (await op.get('/api/projects?card=atrasados')).body.itens.map((x: any) => x.codigo); expect(atrasados).toContain(vencido.codigo); expect(atrasados).not.toContain(normal.codigo);
    // limites configuráveis pelo administrador
    expect((await put(admin, '/api/settings/prazo.dias_critico', { valor: 30 })).status).toBe(400); // >= atenção
    expect((await put(admin, '/api/settings/prazo.dias_atencao', { valor: 45 })).status).toBe(200);
    expect((await put(admin, '/api/settings/prazo.dias_critico', { valor: 25 })).status).toBe(200);
    expect((await get(atencao.id)).prazo.situacao).toBe('CRITICO');
    await put(admin, '/api/settings/prazo.dias_critico', { valor: 7 }); await put(admin, '/api/settings/prazo.dias_atencao', { valor: 30 });
  });

  it('consulta por responsável, filtros combinados, busca e paginação', async () => {
    const r = (await op.get(`/api/projects?responsavelId=${colab.Thiago}&pageSize=5&page=1`)).body;
    expect(r.total).toBeGreaterThan(5); expect(r.itens).toHaveLength(5);
    const so = (await op.get(`/api/projects?frenteId=${frente['1']}`)).body; expect(so.total).toBe(1);
    const busca = (await op.get('/api/search?q=2_1')).body;
    expect(busca.projetos[0].codigo).toBe('2_1'); expect(busca.etapas.map((e: any) => e.codigo)).toContain('2_1 A');
    expect((await op.get('/api/projects?sort=nome&dir=desc')).status).toBe(200);
    expect((await cons.get('/api/stages?atrasadas=1')).status).toBe(200);
    expect((await cons.get('/api/activities')).body.total).toBe(2);
  });
});

describe('Fase 3 — movimentações, timeline e auditoria', () => {
  it('registra movimentações imutáveis com usuário responsável (critérios 10 e 11)', async () => {
    const et = (await op.get(`/api/projects/${p1}/stages`)).body.find((s: any) => s.letra === 'B');
    const m = await post(op, '/api/movements', { projetoId: p1, etapaId: et.id, tipoId: tipoMov, descricao: 'Recebidos três novos orçamentos.' });
    expect(m.status, JSON.stringify(m.body)).toBe(201);
    let proj = (await op.get(`/api/projects/${p1}`)).body; const ult1 = proj.ultimaMovimentacaoEm; expect(ult1).toBeTruthy();
    // movimentação retroativa não faz a "última movimentação" retroceder
    const r2 = await post(op, '/api/movements', { projetoId: p1, tipoId: tipoMov, descricao: 'Registro retroativo de reunião.', data: '2026-01-15', hora: '10:30' });
    expect((await post(op, '/api/movements', { projetoId: p1, tipoId: tipoMov, descricao: 'Retroativo sem hora.', data: '2026-02-16', hora: null })).status).toBe(201);
    expect(r2.status).toBe(201);
    proj = (await op.get(`/api/projects/${p1}`)).body; expect(proj.ultimaMovimentacaoEm).toBe(ult1);
    expect((await post(op, '/api/movements', { projetoId: p1, tipoId: tipoMov, descricao: 'Futura', data: '2999-01-01' })).status).toBe(400);
    const lst = (await op.get(`/api/movements?projetoId=${p1}`)).body;
    expect(lst.total).toBe(3); expect(lst.itens[0].usuario.nome).toBe('Operador Teste');
    expect(lst.itens[0].etapa.codigo).toBe('2_1 B');
    // etapa de outro projeto é recusada
    const outra = (await post(op, `/api/projects/${p2}/stages`, { nome: 'Outra' })).body;
    expect((await post(op, '/api/movements', { projetoId: p1, etapaId: outra.id, tipoId: tipoMov, descricao: 'Etapa errada' })).status).toBe(400);
    // filtros do histórico
    expect((await op.get(`/api/movements?projetoId=${p1}&de=2026-01-01&ate=2026-01-31`)).body.total).toBe(1);
    expect((await op.get(`/api/movements?projetoId=${p1}&busca=orçamentos`)).body.total).toBe(1);
  });

  it('não existe edição/exclusão de movimentações — nem direto no banco', async () => {
    expect((await patch(op, '/api/movements/1', { descricao: 'x' })).status).toBe(404);
    expect((await op.delete('/api/movements/1').set('x-csrf-token', op.csrf)).status).toBe(404);
    await expect(pool.query("UPDATE movimentacoes SET descricao = 'adulterada'")).rejects.toThrow(/imutáveis/);
    await expect(pool.query('DELETE FROM movimentacoes')).rejects.toThrow(/imutáveis/);
  });

  it('timeline combina movimentações e eventos do sistema (critério 12)', async () => {
    const t = (await op.get(`/api/projects/${p1}/timeline`)).body.itens;
    expect(t.some((i: any) => i.origem === 'MOVIMENTACAO')).toBe(true);
    expect(t.some((i: any) => i.origem === 'EVENTO' && i.acao === 'CREATE' && i.modulo === 'Projetos')).toBe(true);
  });

  it('audita alterações automaticamente, com antes/depois (critérios 13 e 14)', async () => {
    const r = await patch(op, `/api/projects/${p1}`, { statusId: statusIds['Em andamento'], observacoes: 'Nota inicial', nome: 'Licitação de Ar-Condicionado (revisada)' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const log = (await admin.get(`/api/audit?projetoId=${p1}&modulo=Projetos`)).body.itens;
    const st = log.find((l: any) => l.acao === 'STATUS_CHANGE');
    expect(st).toMatchObject({ campo: 'Status', valorAnterior: 'Aguardando', valorNovo: 'Em andamento', usuarioNome: 'Operador Teste', registroRotulo: '2_1' });
    expect(log.find((l: any) => l.campo === 'Observações')).toMatchObject({ valorAnterior: null, valorNovo: 'Nota inicial' });
    expect(st.ip).toBeTruthy();
    // sem alteração real → nenhuma linha nova
    const antes = (await admin.get('/api/audit?pageSize=1')).body.total;
    await patch(op, `/api/projects/${p1}`, { nome: 'Licitação de Ar-Condicionado (revisada)' });
    expect((await admin.get('/api/audit?pageSize=1')).body.total).toBe(antes);
    // histórico do projeto: operador vê o do projeto, mas não o log completo
    expect((await op.get(`/api/projects/${p1}/audit`)).body.total).toBeGreaterThan(3);
    expect((await cons.get(`/api/projects/${p1}/audit`)).status).toBe(403);
    // última alteração exibida no projeto
    expect((await op.get(`/api/projects/${p1}`)).body.ultimaAlteracao.usuario).toBe('Operador Teste');
  });

  it('auditoria não pode ser alterada nem apagada; login, logout e permissões são auditados', async () => {
    await expect(pool.query("UPDATE audit_logs SET campo = 'x'")).rejects.toThrow(/imutáveis/);
    await expect(pool.query('DELETE FROM audit_logs')).rejects.toThrow(/imutáveis/);
    const roles = (await admin.get('/api/roles')).body; const cons_ = roles.find((r: any) => r.nome === 'CONSULTA');
    const perms = cons_.permissoes.filter((p: string) => p !== 'reports.view');
    expect((await put(admin, `/api/roles/${cons_.id}`, { nome: 'CONSULTA', permissoes: perms })).status).toBe(200);
    const acoes = (await admin.get('/api/audit?pageSize=200')).body.itens.map((l: any) => l.acao);
    for (const a of ['LOGIN', 'LOGIN_FAILED', 'USER_CREATE', 'PERMISSION_CHANGE', 'STATUS_CHANGE', 'CREATE']) expect(acoes).toContain(a);
    expect((await post(admin, '/api/auth/logout')).status).toBe(200);
    expect((await admin.get('/api/projects')).status).toBe(401);
    admin = await login('admin', 'Nova@Senha1');
    expect((await admin.get('/api/audit?acao=LOGOUT')).body.total).toBeGreaterThan(0);
  });

  it('exclusão de projeto é lógica e preserva o histórico', async () => {
    expect((await op.delete(`/api/projects/${p2}`).set('x-csrf-token', op.csrf)).status).toBe(403);
    expect((await admin.delete(`/api/projects/${p2}`).set('x-csrf-token', admin.csrf)).status).toBe(200);
    expect((await admin.get('/api/projects?ativo=true')).body.itens.map((p: any) => p.codigo)).not.toContain('2_2');
    expect((await admin.get('/api/projects?ativo=todos')).body.itens.map((p: any) => p.codigo)).toContain('2_2');
    // o código 2_2 nunca é reutilizado
    const novo = await post(admin, '/api/projects', { frenteId: frente['2'], nome: 'Depois da exclusão' });
    expect(novo.body.codigo).toBe('2_3');
  });
});

describe('Dashboard — indicadores reais e clicáveis (critérios 15 e 16)', () => {
  it('cada card conta o mesmo que a lista filtrada correspondente', async () => {
    const s = (await admin.get('/api/dashboard/summary')).body;
    for (const card of Object.keys(s.cards)) {
      const lista = (await admin.get(`/api/projects?card=${card}&pageSize=1`)).body;
      expect(lista.total, card).toBe(s.cards[card]);
    }
    expect(s.cards.total).toBeGreaterThan(10);
    expect(s.cards.atrasados).toBeGreaterThanOrEqual(1);
    expect(s.porFrente.find((f: any) => f.codigo === '3').total).toBe(7);
    expect(s.prazos.vencidos).toBeGreaterThanOrEqual(1);
  });
});

describe('Confidencialidade — Livre / Interno URBS / Interno APD', () => {
  it('aplica a política em listas, detalhe, etapas, busca e dashboard', async () => {
    const confs = (await admin.get('/api/confidencialidades')).body;
    const id = (r: string) => confs.find((c: any) => c.regraAcesso === r).id;
    const roles = (await admin.get('/api/roles')).body;
    const conv = roles.find((r: any) => r.nome === 'CONVIDADO');
    expect(conv.convidado).toBe(true);
    const mk = async (username: string, roleId: number, apd: boolean) => {
      const r = await post(admin, '/api/users', { nome: username, username, email: `${username}@x.com`, senha: 'Senha@1234', roleId, pertenceApd: apd });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const ag = request.agent(app) as Agent;
      const l = await ag.post('/api/auth/login').send({ usuario: username, senha: 'Senha@1234' });
      ag.csrf = (l.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('bsc_csrf='))!.split(';')[0].split('=')[1];
      await post(ag, '/api/auth/change-password', { senhaAtual: 'Senha@1234', novaSenha: 'Senha@5678' });
      return login(username, 'Senha@5678');
    };
    const convidado = await mk('convidado1', conv.id, false);
    const opApd = await mk('op_apd', roles.find((r: any) => r.nome === 'OPERADOR').id, true);
    const opUrbs = await mk('op_urbs', roles.find((r: any) => r.nome === 'OPERADOR').id, false);

    const p: Record<string, any> = {};
    for (const r of ['TODOS', 'USUARIOS', 'EQUIPE_APD']) {
      const c = await post(admin, '/api/projects', { frenteId: frente['5'], nome: `Projeto ${r} confid`, confidencialidadeId: id(r) });
      expect(c.status).toBe(201); p[r] = c.body;
      expect((await post(admin, `/api/projects/${c.body.id}/stages`, { nome: 'Etapa X1' })).status).toBe(201);
    }
    const codigos = async (ag: Agent) => (await ag.get('/api/projects?pageSize=200&busca=confid')).body.itens.map((x: any) => x.codigo);
    expect(await codigos(convidado)).toEqual([p.TODOS.codigo]);
    expect((await codigos(opUrbs)).sort()).toEqual([p.TODOS.codigo, p.USUARIOS.codigo].sort());
    expect((await codigos(opApd)).length).toBe(3);
    expect((await codigos(admin)).length).toBe(3);

    // detalhe, etapas e movimentações de projeto invisível = 404
    expect((await convidado.get(`/api/projects/${p.USUARIOS.id}`)).status).toBe(404);
    expect((await opUrbs.get(`/api/projects/${p.EQUIPE_APD.id}`)).status).toBe(404);
    expect((await opUrbs.get(`/api/projects/${p.EQUIPE_APD.id}/stages`)).status).toBe(404);
    expect((await opUrbs.get(`/api/projects/${p.EQUIPE_APD.id}/timeline`)).status).toBe(404);
    expect((await patch(opUrbs, `/api/projects/${p.EQUIPE_APD.id}`, { nome: 'invasão' })).status).toBe(404);
    expect((await post(opUrbs, '/api/movements', { projetoId: p.EQUIPE_APD.id, tipoId: tipoMov, descricao: 'tentativa' })).status).toBe(404);
    expect((await opApd.get(`/api/projects/${p.EQUIPE_APD.id}`)).status).toBe(200);
    expect((await convidado.get(`/api/projects/${p.TODOS.id}`)).status).toBe(200);

    // listas de etapas, busca global e dashboard também respeitam
    expect((await opUrbs.get('/api/stages?pageSize=200&busca=confid')).body.itens.filter((e: any) => e.projetoCodigo === p.EQUIPE_APD.codigo).length).toBe(0);
    const busca = (await opUrbs.get('/api/search?q=confid')).body;
    expect(busca.projetos.map((x: any) => x.codigo)).not.toContain(p.EQUIPE_APD.codigo);
    const sA = (await admin.get('/api/dashboard/summary')).body.cards.total;
    const sU = (await opUrbs.get('/api/dashboard/summary')).body.cards.total;
    expect(sU).toBe(sA - 1);

    // ninguém atribui nível que não pode ver
    const bad = await post(opUrbs, '/api/projects', { frenteId: frente['5'], nome: 'Nível indevido', confidencialidadeId: id('EQUIPE_APD') });
    expect(bad.status).toBe(400);
  });
});


describe('Código do projeto editável e pessoas = usuários APD/UPD', () => {
  it('aceita código escolhido, recusa duplicado e sugere o próximo', async () => {
    const nf = await post(admin, '/api/frentes', { nome: 'Frente do teste de código' }); expect(nf.status).toBe(201);
    const f = nf.body.id; const cod = nf.body.codigo;
    expect((await op.get(`/api/projects/next-code?frenteId=${f}`)).body).toMatchObject({ codigo: `${cod}_1`, sequencia: 1 });
    const c = await post(op, '/api/projects', { frenteId: f, nome: 'Projeto com código escolhido', sequencia: 14 });
    expect(c.status, JSON.stringify(c.body)).toBe(201); expect(c.body.codigo).toBe(`${cod}_14`);
    const dup = await post(op, '/api/projects', { frenteId: f, nome: 'Duplicado', sequencia: 14 });
    expect(dup.status).toBe(409); expect(dup.body.erro).toMatch(new RegExp(`${cod}_14 já existe`));
    expect((await op.get(`/api/projects/code-available?frenteId=${f}&sequencia=14`)).body.disponivel).toBe(false);
    expect((await op.get(`/api/projects/code-available?frenteId=${f}&sequencia=2`)).body.disponivel).toBe(true);
    expect((await post(op, '/api/projects', { frenteId: f, nome: 'Código inválido', sequencia: 0 })).status).toBe(422);
    // sem informar, segue a sequência após o maior código
    expect((await post(op, '/api/projects', { frenteId: f, nome: 'Automático depois' })).body.codigo).toBe(`${cod}_15`);
    // código de projeto excluído também não pode ser reutilizado
    await admin.delete(`/api/projects/${c.body.id}`).set('x-csrf-token', admin.csrf);
    const re = await post(op, '/api/projects', { frenteId: f, nome: 'Reuso', sequencia: 14 });
    expect(re.status).toBe(409); expect(re.body.erro).toMatch(/excluído/);
    // auditoria registra que o código foi escolhido manualmente
    const au = (await admin.get('/api/audit?pageSize=200')).body.itens.find((a: any) => a.registroRotulo === `${cod}_14` && a.acao === 'CREATE');
    expect(au.info.codigoEscolhidoPeloUsuario).toBe(true);
  });

  it('Dono, Scrum Master e equipe só aceitam usuários ativos da APD/UPD', async () => {
    const f = frente['4'];
    const idOp = (await admin.get('/api/users?pageSize=100')).body.itens.find((u: any) => u.username === 'operador').id;
    const r1 = await post(op, '/api/projects', { frenteId: f, nome: 'Dono fora da APD', donoId: idOp });
    expect(r1.status).toBe(400); expect(r1.body.erro).toMatch(/APD\/UPD/);
    const ok = await post(op, '/api/projects', { frenteId: f, nome: 'Projeto com equipe nas etapas', donoId: colab.Thiago });
    expect(ok.status).toBe(201);
    const base = `/api/projects/${ok.body.id}/stages`;
    expect((await post(op, base, { nome: 'Scrum inválido', scrumMasterId: idOp })).status).toBe(400);
    expect((await post(op, base, { nome: 'Equipe mista', scrumMasterId: colab.Marcos, membros: [colab.Mariana, idOp] })).status).toBe(400);
    expect((await post(op, base, { nome: 'Responsável inválido', responsavelId: idOp })).status).toBe(400);
    const et = await post(op, base, { nome: 'Etapa válida', responsavelId: colab.Thiago, scrumMasterId: colab.Marcos, membros: [colab.Mariana], tags: ['licitação', 'demo'], dataInicio: '2026-03-01', dataPrevista: '2026-04-10' });
    expect(et.status, JSON.stringify(et.body)).toBe(201);
    const et2 = await post(op, base, { nome: 'Etapa 2', scrumMasterId: colab.Thiago, membros: [colab.Mariana, colab.Marcos], dataInicio: '2026-02-01', dataPrevista: '2026-06-30' });
    expect(et2.status).toBe(201);
    const e1 = (await op.get(`/api/stages/${et.body.id}`)).body;
    expect(e1.scrumMaster.nome).toBe('Marcos'); expect(e1.membros.map((m: any) => m.nome)).toEqual(['Mariana']); expect(e1.tags).toEqual(['licitação', 'demo']);
    // projeto: consolidação derivada das etapas
    const det = (await op.get(`/api/projects/${ok.body.id}`)).body;
    expect(det.dono.nome).toBe('Thiago'); expect(det).not.toHaveProperty('scrumMaster');
    expect(det.scrumNomes).toEqual(['Marcos', 'Thiago']); expect(det.equipeNomes).toEqual(['Marcos', 'Mariana']); expect(det.tags).toEqual(['demo', 'licitação']);
    expect(det.dataInicio).toBe('2026-02-01'); expect(det.dataPrevista).toBe('2026-06-30');
    // buscas e filtros por participação nas etapas
    const lista = (await op.get('/api/projects?busca=Marcos&pageSize=50')).body.itens;
    expect(lista.map((p: any) => p.codigo)).toContain(ok.body.codigo);
    expect((await op.get(`/api/projects?scrumMasterId=${colab.Marcos}&pageSize=50`)).body.itens.map((p: any) => p.codigo)).toContain(ok.body.codigo);
    expect((await op.get(`/api/projects?responsavelId=${colab.Mariana}&pageSize=50`)).body.itens.map((p: any) => p.codigo)).toContain(ok.body.codigo);
    expect((await op.get(`/api/stages?scrumMasterId=${colab.Thiago}&pageSize=50`)).body.itens.map((x: any) => x.id)).toContain(et2.body.id);
    // editar equipe e datas da etapa recalcula o projeto e audita
    expect((await patch(op, `/api/stages/${et2.body.id}`, { membros: [colab.Marcos], dataPrevista: '2026-05-15' })).status).toBe(200);
    const det2 = (await op.get(`/api/projects/${ok.body.id}`)).body;
    expect(det2.dataPrevista).toBe('2026-05-15'); expect(det2.equipeNomes).toEqual(['Marcos', 'Mariana']);
    const log = (await admin.get(`/api/audit?projetoId=${ok.body.id}&modulo=Etapas&pageSize=100`)).body.itens;
    expect(log.find((l: any) => l.campo === 'Equipe (membros)')).toMatchObject({ valorAnterior: 'Marcos, Mariana', valorNovo: 'Marcos' });
    // campos de projeto ignorados na entrada
    const ign = await patch(op, `/api/projects/${ok.body.id}`, { dataInicio: '2020-01-01', scrumMasterId: colab.Mariana, tags: ['x'] });
    expect(ign.status).toBe(200);
    expect((await op.get(`/api/projects/${ok.body.id}`)).body.dataInicio).toBe('2026-02-01');
  });
});

describe('Campos removidos e filtro por confidencialidade', () => {
  it('projeto não tem mais prioridade/confiabilidade e filtra por confidencialidade', async () => {
    const lista = (await admin.get('/api/projects?pageSize=5')).body.itens[0];
    expect(lista).not.toHaveProperty('prioridade'); expect(lista).not.toHaveProperty('confiabilidade');
    expect((await admin.get('/api/prioridades')).status).toBe(404);
    const confs = (await admin.get('/api/confidencialidades')).body;
    const apd = confs.find((c: any) => c.regraAcesso === 'EQUIPE_APD').id;
    const r = (await admin.get(`/api/projects?confidencialidadeId=${apd}&pageSize=200`)).body;
    expect(r.itens.length).toBeGreaterThan(0);
    expect(r.itens.every((p: any) => p.confidencialidade.id === apd)).toBe(true);
  });
});

describe('Fase 4 — indicadores, prazos e alertas', () => {
  let adminId: number;
  it('indicadores por Scrum Master e por equipe vêm das etapas', async () => {
    adminId = (await admin.get('/api/users?pageSize=100')).body.itens.find((u: any) => u.username === 'admin').id;
    const sm = (await op.get('/api/dashboard/por-scrum')).body;
    const marcos = sm.find((x: any) => x.nome === 'Marcos');
    expect(marcos.projetos).toBeGreaterThanOrEqual(1);
    expect(marcos).toHaveProperty('atrasados'); expect(marcos).toHaveProperty('bloqueados');
    const eq = (await op.get('/api/dashboard/por-equipe')).body;
    const mariana = eq.find((x: any) => x.nome === 'Mariana');
    expect(mariana.etapas).toBeGreaterThanOrEqual(1); expect(mariana.pendencias).toBeGreaterThanOrEqual(1);
    expect(mariana).toMatchObject({ projetos: expect.any(Number), atividades: expect.any(Number), atrasos: expect.any(Number), finalizacoes: expect.any(Number) });
  });

  it('painel de prazos, indicadores gerenciais e inatividade', async () => {
    const pz = (await op.get('/api/dashboard/prazos')).body;
    expect(pz.projetos.vencidos).toBeGreaterThanOrEqual(1); expect(pz.etapas).toHaveProperty('ate7');
    expect(pz.situacao.vencido).toBeGreaterThanOrEqual(1); expect(pz.limites).toEqual({ atencao: 30, critico: 7 });
    const ind = (await op.get('/api/dashboard/indicadores')).body;
    expect(ind.totais.projetos).toBeGreaterThan(10); expect(ind.totais.etapas).toBeGreaterThan(3);
    expect(ind.percentuais.atrasado).toBeGreaterThanOrEqual(0);
    await pool.query("UPDATE projetos SET created_at = now() - interval '40 days' WHERE ativo AND ultima_movimentacao_em IS NULL");
    const ina = (await op.get('/api/dashboard/inatividade?dias=15')).body;
    expect(ina.itens.length).toBeGreaterThan(0); expect(ina.itens[0]).toHaveProperty('diasSemMovimentacao');
    const mm = (await op.get('/api/dashboard/movimentacoes-mes?meses=12')).body;
    expect(mm).toHaveLength(12); expect(mm.reduce((s: number, x: any) => s + x.total, 0)).toBeGreaterThan(0);
    const filtro = (await op.get(`/api/dashboard/movimentacoes-mes?meses=6&projetoId=${p1}`)).body;
    expect(filtro).toHaveLength(6);
    expect((await cons.get('/api/dashboard/prazos')).status).toBe(200);
  });

  it('gera notificações respeitando regras, destinatários e deduplicação', async () => {
    const { hoje, somaDias } = await import('../src/lib/prazo.js');
    const h = hoje();
    const pj = await post(op, '/api/projects', { frenteId: frente['5'], nome: 'Projeto de alertas', donoId: colab.Thiago });
    await post(op, `/api/projects/${pj.body.id}/stages`, { nome: 'Etapa atrasada', scrumMasterId: colab.Marcos, responsavelId: colab.Marcos, dataInicio: somaDias(h, -30), dataPrevista: somaDias(h, -3), statusId: statusIds['Em andamento'] });
    await post(op, `/api/projects/${pj.body.id}/stages`, { nome: 'Etapa a vencer', scrumMasterId: colab.Mariana, dataInicio: somaDias(h, -5), dataPrevista: somaDias(h, 4), statusId: statusIds['Em andamento'] });
    // regras padrão existem e só o administrador as vê
    const regras = (await admin.get('/api/alerts')).body; expect(regras.length).toBeGreaterThanOrEqual(5);
    expect((await op.get('/api/alerts')).status).toBe(403);
    const extra = await post(admin, '/api/alerts', { nome: 'Cópia para o administrador', tipo: 'ATRASO', frequencia: 'DIARIA', destinatarios: { participantes: false, userIds: [adminId] } });
    expect(extra.status, JSON.stringify(extra.body)).toBe(201);
    expect((await post(admin, '/api/alerts', { nome: 'Sem dias', tipo: 'PRAZO_PROXIMO', destinatarios: { participantes: true, userIds: [] } })).status).toBe(400);
    expect((await post(admin, '/api/alerts', { nome: 'Sem ninguém', tipo: 'ATRASO', destinatarios: { participantes: false, userIds: [] } })).status).toBe(400);

    const r1 = await post(admin, '/api/alerts/run'); expect(r1.status).toBe(200); expect(r1.body.criadas).toBeGreaterThan(0);
    const r2 = await post(admin, '/api/alerts/run'); expect(r2.body.criadas).toBe(0); // deduplicação
    const msgs = async (uid: number) => (await pool.query('SELECT mensagem FROM notificacoes WHERE user_id = $1', [uid])).rows.map((x) => x.mensagem as string);
    const m = await msgs(colab.Marcos);
    expect(m.some((x) => /^A etapa .* está atrasada\.$/.test(x))).toBe(true);
    expect(m.some((x) => /^Você possui \d+ etapas? atrasadas?\.$/.test(x))).toBe(true);
    const mar = await msgs(colab.Mariana);
    expect(mar.some((x) => /^A etapa .* vence em 4 dias\.$/.test(x))).toBe(true);
    expect((await msgs(colab.Thiago)).some((x) => /^O projeto .* sem movimentação|^A etapa .* está atrasada/.test(x))).toBe(true); // dono é avisado
    // central do usuário: lista, contador e marcar como lida
    const lista = (await admin.get('/api/notifications?pageSize=50')).body;
    expect(lista.total).toBeGreaterThan(0); expect(lista.naoLidas).toBe(lista.total);
    const um = lista.itens[0];
    expect((await post(admin, `/api/notifications/${um.id}/read`)).status).toBe(200);
    expect((await admin.get('/api/notifications/count')).body.naoLidas).toBe(lista.total - 1);
    expect((await post(admin, '/api/notifications/read-all')).status).toBe(200);
    expect((await admin.get('/api/notifications/count')).body.naoLidas).toBe(0);
    // cada usuário só enxerga as próprias notificações
    expect((await op.get('/api/notifications')).body.itens.every((n: any) => n.userId !== adminId)).toBe(true);
  });

  it('respeita a confidencialidade: quem não enxerga o projeto não é notificado', async () => {
    const { hoje, somaDias } = await import('../src/lib/prazo.js');
    const confs = (await admin.get('/api/confidencialidades')).body;
    const livre = confs.find((c: any) => c.regraAcesso === 'TODOS').id;
    void livre;
    // usuário comum (não APD) escolhido como destinatário de um projeto Interno APD não recebe
    const idOp = (await admin.get('/api/users?pageSize=100')).body.itens.find((u: any) => u.username === 'operador').id;
    const apd = confs.find((c: any) => c.regraAcesso === 'EQUIPE_APD').id;
    const pj = await post(admin, '/api/projects', { frenteId: frente['5'], nome: 'Projeto APD alertas', donoId: colab.Thiago, confidencialidadeId: apd });
    await post(admin, `/api/projects/${pj.body.id}/stages`, { nome: 'Etapa APD atrasada', scrumMasterId: colab.Marcos, dataInicio: somaDias(hoje(), -20), dataPrevista: somaDias(hoje(), -1), statusId: statusIds['Em andamento'] });
    const reg = await post(admin, '/api/alerts', { nome: 'Cópia ao operador', tipo: 'ATRASO', frequencia: 'DIARIA', destinatarios: { participantes: false, userIds: [idOp] } });
    expect(reg.status).toBe(201);
    await post(admin, '/api/alerts/run');
    const r = await pool.query(`SELECT mensagem FROM notificacoes WHERE user_id = $1 AND projeto_id = $2`, [idOp, pj.body.id]);
    expect(r.rowCount).toBe(0);
  });
});

describe('Fase 5 — documentos, ocorrências e relatórios', () => {
  let pid: number, eid: number, docId: number, ocId: number;
  const up = (a: Agent, url: string, campos: Record<string, string>, arq?: { nome: string; buf: Buffer; tipo?: string }) => {
    let r = a.post(url).set('x-csrf-token', a.csrf);
    for (const [k, v] of Object.entries(campos)) r = r.field(k, v);
    if (arq) r = r.attach('arquivo', arq.buf, { filename: arq.nome, contentType: arq.tipo ?? 'application/pdf' });
    return r;
  };
  const bin = (r: any, cb: (e: Error | null, b: Buffer) => void) => { const c: Buffer[] = []; r.on('data', (d: Buffer) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); };

  it('prepara um projeto com etapa', async () => {
    const pj = await post(admin, '/api/projects', { frenteId: frente['5'], nome: 'Projeto Fase 5', donoId: colab.Thiago });
    expect(pj.status).toBe(201); pid = pj.body.id;
    const et = await post(admin, `/api/projects/${pid}/stages`, { nome: 'Etapa docs', scrumMasterId: colab.Marcos, dataInicio: '2026-09-01', dataPrevista: '2026-12-01' });
    expect(et.status).toBe(201); eid = et.body.id;
  });

  it('upload, download, versões e histórico de documentos', async () => {
    const r = await up(op, '/api/documents', { projetoId: String(pid), etapaId: String(eid), categoria: 'Relatórios', observacao: 'primeira' }, { nome: 'Relatório ção.pdf', buf: Buffer.from('%PDF-1.4 versao1') });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    docId = r.body.id; expect(r.body.versao).toBe(1); expect(r.body.nome).toBe('Relatório ção.pdf'); expect(r.body.visualizavel).toBe(true);
    const v2 = await up(op, `/api/documents/${docId}/versions`, { observacao: 'revisado' }, { nome: 'Relatorio v2.pdf', buf: Buffer.from('%PDF-1.4 versao2 maior') });
    expect(v2.status).toBe(201); expect(v2.body.versao).toBe(2);
    const det = (await op.get(`/api/documents/${docId}`)).body;
    expect(det.versoes.map((v: any) => v.versao)).toEqual([2, 1]); expect(det.versoes[0].sha256).toHaveLength(64);
    const d1 = await op.get(`/api/documents/${docId}/download?versao=1`).buffer(true).parse(bin as any);
    expect(d1.status).toBe(200); expect(d1.body.toString()).toBe('%PDF-1.4 versao1');
    expect(d1.headers['content-disposition']).toContain('attachment');
    const dl = await op.get(`/api/documents/${docId}/download?inline=1`).buffer(true).parse(bin as any);
    expect(dl.body.toString()).toBe('%PDF-1.4 versao2 maior'); expect(dl.headers['content-disposition']).toContain('inline');
    const lista = (await op.get(`/api/documents?projetoId=${pid}`)).body;
    expect(lista.total).toBe(1);
    const tl = (await op.get(`/api/projects/${pid}/timeline`)).body.itens;
    expect(tl.some((x: any) => x.acao === 'DOCUMENT_UPLOAD' || /Arquivo|versão/i.test(JSON.stringify(x)))).toBe(true);
  });

  it('bloqueia extensões perigosas, referências de rede e arquivo ausente', async () => {
    const x = await up(op, '/api/documents', { projetoId: String(pid) }, { nome: 'virus.exe', buf: Buffer.from('MZ'), tipo: 'application/octet-stream' });
    expect(x.status).toBe(400);
    expect((await up(op, '/api/documents', { projetoId: String(pid) })).status).toBe(400);
    const ref = await up(op, '/api/documents', { projetoId: String(pid), nome: 'Pasta de premissas', caminhoRede: 'R:\\APD\\1.Financeiro\\1_14\\A - Premissas' });
    expect(ref.status).toBe(201); expect(ref.body.versao).toBeNull(); expect(ref.body.caminhoRede).toContain('Premissas');
    expect((await op.get(`/api/documents/${ref.body.id}/download`)).status).toBe(404);
    const outra = await post(admin, '/api/projects', { frenteId: frente['5'], nome: 'Outro projeto', donoId: colab.Thiago });
    const et2 = await post(admin, `/api/projects/${outra.body.id}/stages`, { nome: 'Etapa de outro projeto' });
    expect((await up(op, '/api/documents', { projetoId: String(pid), etapaId: String(et2.body.id), nome: 'a', caminhoRede: 'R:\\x' })).status).toBe(400);
  });

  it('exclusão exige documents.manage; consulta não envia; é exclusão lógica auditada', async () => {
    expect((await up(cons, '/api/documents', { projetoId: String(pid) }, { nome: 'a.pdf', buf: Buffer.from('x') })).status).toBe(403);
    expect((await cons.get(`/api/documents/${docId}`)).status).toBe(200);
    expect((await op.delete(`/api/documents/${docId}`).set('x-csrf-token', op.csrf)).status).toBe(403);
    expect((await admin.delete(`/api/documents/${docId}`).set('x-csrf-token', admin.csrf)).status).toBe(204);
    expect((await admin.get(`/api/documents/${docId}`)).status).toBe(404);
    const { rows } = await pool.query("SELECT count(*)::int n FROM documento_versoes WHERE documento_id = $1", [docId]);
    expect(rows[0].n).toBe(2);
    const a = await pool.query("SELECT 1 FROM audit_logs WHERE acao = 'DOCUMENT_DELETE' AND registro_id = $1", [String(docId)]);
    expect(a.rowCount).toBe(1);
  });

  it('documentos respeitam a confidencialidade do projeto', async () => {
    const confs = (await admin.get('/api/confidencialidades')).body;
    const apd = confs.find((c: any) => c.regraAcesso === 'EQUIPE_APD').id;
    const pj = await post(admin, '/api/projects', { frenteId: frente['5'], nome: 'Projeto APD docs', donoId: colab.Thiago, confidencialidadeId: apd });
    const d = await up(admin, '/api/documents', { projetoId: String(pj.body.id), nome: 'Sigiloso', caminhoRede: 'R:\\sigilo' });
    expect(d.status).toBe(201);
    expect((await op.get(`/api/documents/${d.body.id}`)).status).toBe(404);
    expect((await op.get('/api/documents?pageSize=200')).body.itens.some((x: any) => x.id === d.body.id)).toBe(false);
    expect((await up(op, '/api/documents', { projetoId: String(pj.body.id), nome: 'x', caminhoRede: 'R:\\x' })).status).toBe(404);
  });

  it('ocorrências: criar, resolver, reabrir, anexar e filtrar', async () => {
    const c = await post(op, '/api/occurrences', { projetoId: pid, etapaId: eid, titulo: 'Fornecedor não respondeu', severidade: 'ALTA', prazoResolucao: '2026-01-10' });
    expect(c.status, JSON.stringify(c.body)).toBe(201); ocId = c.body.id;
    expect(c.body.status).toBe('ABERTA'); expect(c.body.vencida).toBe(true);
    expect((await post(cons, '/api/occurrences', { projetoId: pid, titulo: 'Tentativa' })).status).toBe(403);
    expect((await patch(op, `/api/occurrences/${ocId}`, { status: 'RESOLVIDA' })).status).toBe(400); // sem solução
    const r = await patch(op, `/api/occurrences/${ocId}`, { status: 'RESOLVIDA', solucao: 'Novo contato realizado.' });
    expect(r.status).toBe(200); expect(r.body.dataResolucao).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(r.body.vencida).toBe(false);
    const re = await patch(op, `/api/occurrences/${ocId}`, { status: 'EM_TRATAMENTO' });
    expect(re.body.dataResolucao).toBeNull();
    const an = await up(op, '/api/documents', { projetoId: String(pid), ocorrenciaId: String(ocId), categoria: 'Evidências', nome: 'Print' }, { nome: 'print.png', buf: Buffer.from('png'), tipo: 'image/png' });
    expect(an.status).toBe(201);
    expect((await op.get(`/api/occurrences/${ocId}`)).body.anexos).toBe(1);
    expect((await op.get(`/api/occurrences?projetoId=${pid}&severidade=ALTA&aberta=true`)).body.total).toBe(1);
    expect((await op.get('/api/occurrences?vencida=true')).body.itens.some((x: any) => x.id === ocId)).toBe(true);
    const aud = await pool.query("SELECT campo FROM audit_logs WHERE modulo = 'Ocorrências' AND registro_id = $1", [String(ocId)]);
    expect(aud.rows.map((x) => x.campo)).toContain('Status');
  });

  it('relatórios: catálogo, JSON, CSV, Excel e PDF', async () => {
    const cat = (await op.get('/api/reports')).body;
    expect(cat.length).toBe(10); expect(cat.some((x: any) => x.id === 'auditoria')).toBe(false);
    expect((await admin.get('/api/reports')).body.length).toBe(11);
    expect((await op.get('/api/reports/auditoria')).status).toBe(403);
    for (const id of ['geral', 'vigentes', 'atrasados', 'a-vencer', 'por-frente', 'por-scrum', 'por-equipe', 'etapas-atrasadas', 'sem-movimentacao', 'movimentacoes']) {
      const j = await op.get(`/api/reports/${id}`); expect(j.status, id).toBe(200); expect(j.body.colunas.length).toBeGreaterThan(2);
    }
    const geral = (await op.get('/api/reports/geral')).body; expect(geral.total).toBeGreaterThan(5);
    expect((await op.get(`/api/reports/geral?frenteId=${frente['5']}`)).body.linhas.every((l: any) => l.frente === geral.linhas.find((x: any) => x.frente && x.codigo.startsWith('5_'))?.frente)).toBe(true);
    const csv = await op.get('/api/reports/geral?formato=csv').buffer(true).parse(bin as any);
    expect(csv.headers['content-type']).toContain('text/csv'); expect(csv.body.toString().startsWith('\uFEFFCódigo;Projeto')).toBe(true);
    const xl = await op.get('/api/reports/geral?formato=xlsx').buffer(true).parse(bin as any);
    expect(xl.headers['content-type']).toContain('spreadsheetml'); expect(xl.body.subarray(0, 2).toString()).toBe('PK');
    const pdf = await op.get('/api/reports/geral?formato=pdf').buffer(true).parse(bin as any);
    expect(pdf.headers['content-type']).toBe('application/pdf'); expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-'); expect(pdf.body.length).toBeGreaterThan(3000);
    const aud = await admin.get('/api/reports/auditoria?formato=pdf').buffer(true).parse(bin as any);
    expect(aud.status).toBe(200);
    expect((await admin.get('/api/reports/inexistente')).status).toBe(404);
  });
});

describe('Fase 6 — importação da planilha', () => {
  async function planilha(linhas: (string | null)[][], datas = ['05/01/2026', '12/01/2026', '01/01/2099', '30/02/2026']) {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('2026');
    ws.addRow([]); ws.addRow([]);
    ws.addRow(['info', 'Mapa Estratégico', 'Direcionador', 'Código', 'Cód. Ação Tática', 'Etapa', 'D. Produto', 'Scrum master', 'Equipe', 'Nome do projeto', 'Confidencialidade', 'Atividade', 'Caminho da pasta', 'Status', 'Data Início', 'Dt. / Entrega', 'Dta. /entrega ', ...datas]);
    ws.addRow([null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '    prevista']);
    for (const l of linhas) ws.addRow(l);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  const prev = (a: Agent, buf: Buffer, nome = 'bsc.xlsx') => a.post('/api/import/preview').set('x-csrf-token', a.csrf).attach('arquivo', buf, { filename: nome });
  // info, mapa, direc, cod, acao, etapa, dono, scrum, equipe, nome, conf, atividade, pasta, status, ini, prev, real, mov1..4
  const L = (cod: string, letra: string | null, o: Partial<Record<string, string | null>> = {}): (string | null)[] => [
    '1', o.mapa ?? 'Aprendizado.', 'D1', cod, '1.1.1', letra, 'Thiago', o.scrum ?? 'Marcos', o.equipe ?? 'Individual', o.nome ?? `Projeto ${cod}`, o.conf ?? 'INTERNO URBS',
    o.atv ?? `Etapa ${letra}`, o.pasta ?? null, o.status ?? 'Em andamento', o.ini ?? '2026-01-10', o.prev ?? '2026-03-10', o.real ?? null, o.m1 ?? null, o.m2 ?? null, o.m3 ?? null, o.m4 ?? null,
  ];
  let impId: number;

  it('só quem tem import.manage importa', async () => {
    expect((await prev(op, await planilha([L('4_61', 'A')]))).status).toBe(403);
    expect((await admin.get('/api/import')).status).toBe(200);
    expect((await op.get('/api/import')).status).toBe(403);
  });

  it('prévia: válidos, duplicados, campos ausentes, códigos e datas inválidas — sem gravar nada', async () => {
    const buf = await planilha([
      L('4_61', null, { nome: 'Projeto importado', status: 'Em andamento', conf: 'INTERNO' }),
      L('4_61', 'A', { atv: 'Premissas', m1: '[MARCOS - 05/01/2026] Reunião inicial', m3: 'futura', m4: 'sem data válida' }),
      L('4_61', 'B', { atv: 'Diagnóstico', status: 'Finalizado', equipe: 'Zelda', m2: 'Segunda semana' }),
      L('4_61', 'B', { atv: 'Diagnóstico repetido' }),
      L('4_62', 'A', { status: '', equipe: 'Equipe Completa' }),
      L('4_63', 'A', { ini: '2026-05-01', prev: '2026-04-01' }),
      L('4_64', 'A', { mapa: 'Mercado.' }),
      L('XX', 'A'), L(null, 'A', { atv: 'Sem código' }), L('4_65', 'A', { atv: '' }), L('4_66', 'A', { status: 'Inexistente' }),
      L('4_67', 'A', { ini: '30/02/2026' }),
    ]);
    const r = await prev(admin, buf);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    impId = r.body.id;
    const s = r.body.resumo;
    expect(s.linhas).toBe(12); expect(s.validos).toBe(4); expect(s.duplicados).toBe(1); expect(s.erros).toBe(7);
    expect(s.porTipo.CAMPO_OBRIGATORIO).toBe(2); expect(s.porTipo.CODIGO_INVALIDO).toBe(2); expect(s.porTipo.DATA_INVALIDA).toBeGreaterThanOrEqual(3); expect(s.porTipo.STATUS).toBeGreaterThanOrEqual(2);
    expect(s.projetosNovos).toBe(2); expect(s.etapas).toBe(3); expect(s.movimentacoes).toBe(2); // futura e data inválida ficam de fora
    expect(r.body.colunas.some((c: any) => c.campo === 'codigo')).toBe(true);
    const nomes = r.body.pessoas.map((p: any) => p.nome); expect(nomes).toContain('Zelda'); expect(nomes).not.toContain('Individual');
    expect(r.body.pessoas.find((p: any) => p.nome === 'Marcos').sugestaoUserId).toBe(colab.Marcos);
    expect(r.body.pessoas.find((p: any) => p.nome === 'Zelda').sugestaoUserId).toBeNull();
    const { rows } = await pool.query("SELECT count(*)::int n FROM projetos WHERE codigo = '4_61'"); expect(rows[0].n).toBe(0);
    const det = (await admin.get(`/api/import/${impId}`)).body;
    expect(det.problemas.some((p: any) => p.tipo === 'CONFIDENCIALIDADE' && /INTERNO/.test(p.mensagem))).toBe(true);
    const err = (await admin.get(`/api/import/${impId}/linhas?estado=ERRO&pageSize=50`)).body; expect(err.total).toBe(7);
    const csv = await admin.get(`/api/import/${impId}/problemas.csv`); expect(csv.text).toContain('Código do projeto ausente');
  });

  it('rejeita arquivos sem as colunas obrigatórias', async () => {
    const ExcelJS = (await import('exceljs')).default; const wb = new ExcelJS.Workbook(); wb.addWorksheet('x').addRow(['a', 'b']);
    const r = await prev(admin, Buffer.from(await wb.xlsx.writeBuffer()));
    expect(r.status).toBe(400); expect(r.body.erro).toMatch(/cabeçalho/i);
    expect((await admin.post('/api/import/preview').set('x-csrf-token', admin.csrf).attach('arquivo', Buffer.from('x'), { filename: 'a.exe' })).status).toBe(400);
  });

  it('confirma: cria projeto/etapas/movimentações rastreáveis, deriva status e respeita as escolhas de pessoas', async () => {
    const c = await post(admin, `/api/import/${impId}/confirm`, { pessoas: { Zelda: colab.Mariana, Marcos: colab.Marcos, Thiago: null } });
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    expect(c.body.resultado).toMatchObject({ projetosCriados: 2, etapasCriadas: 3, movimentacoes: 2 });
    const p = (await pool.query("SELECT p.*, s.nome st, c.nome conf FROM projetos p JOIN status s ON s.id = p.status_id JOIN confidencialidades c ON c.id = p.confidencialidade_id WHERE codigo = '4_61'")).rows[0];
    expect(p.nome).toBe('Projeto importado'); expect(p.conf).toBe('Interno URBS'); expect(p.importacao_id).toBe(impId); expect(p.origem_importacao).toContain('linha');
    expect(p.campos_extras.direcionador).toBe('D1');
    const et = (await pool.query("SELECT e.letra, e.tags, e.responsavel_id, e.scrum_master_id, e.importacao_id FROM etapas e WHERE projeto_id = $1 ORDER BY ordem", [p.id])).rows;
    expect(et.map((e) => e.letra)).toEqual(['A', 'B']); expect(et[0].tags).toContain('Individual'); expect(et[0].scrum_master_id).toBe(colab.Marcos);
    expect(et[1].responsavel_id).toBe(colab.Mariana);
    const mv = (await pool.query("SELECT importada, importacao_id, origem_linha, usuario_id, to_char(data_hora AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') d FROM movimentacoes WHERE projeto_id = $1 ORDER BY data_hora", [p.id])).rows;
    expect(mv.map((m) => m.d)).toEqual(['2026-01-05', '2026-01-12']); expect(mv.every((m) => m.importada && m.importacao_id === impId)).toBe(true);
    expect(mv[0].usuario_id).toBe(colab.Marcos); // autor lido do “[MARCOS - …]”
    const p2 = (await pool.query("SELECT s.nome st FROM projetos p JOIN status s ON s.id = p.status_id WHERE codigo = '4_62'")).rows[0];
    expect(p2.st).toBe('Aguardando');
    expect((await pool.query("SELECT count(*)::int n FROM projetos WHERE codigo IN ('4_63','4_64','4_65','4_66','4_67')")).rows[0].n).toBe(0);
    const a = await pool.query("SELECT 1 FROM audit_logs WHERE modulo = 'Importação' AND registro_id = $1", [String(impId)]); expect(a.rowCount).toBe(1);
    expect((await post(admin, `/api/import/${impId}/confirm`, {})).status).toBe(400); // não confirma duas vezes
    expect((await post(admin, `/api/import/${impId}/cancel`)).status).toBe(400);
  });

  it('reimportar o mesmo arquivo não duplica nada; linhas novas entram; cancelar não grava', async () => {
    const base = [L('4_61', null, { nome: 'Projeto importado' }), L('4_61', 'A', { atv: 'Premissas', m1: '[MARCOS - 05/01/2026] Reunião inicial' }), L('4_61', 'C', { atv: 'Nova etapa', m2: 'Nova movimentação' })];
    const r = await prev(admin, await planilha(base)); expect(r.status).toBe(201);
    expect(r.body.resumo).toMatchObject({ duplicados: 2, validos: 1, etapas: 1, movimentacoes: 1 });
    const c = await post(admin, `/api/import/${r.body.id}/confirm`, {});
    expect(c.body.resultado).toMatchObject({ projetosCriados: 0, etapasCriadas: 1, movimentacoes: 1 });
    expect((await pool.query("SELECT count(*)::int n FROM etapas e JOIN projetos p ON p.id = e.projeto_id WHERE p.codigo = '4_61'")).rows[0].n).toBe(3);
    const r2 = await prev(admin, await planilha([L('4_70', 'A')]));
    expect((await post(admin, `/api/import/${r2.body.id}/cancel`)).status).toBe(200);
    expect((await post(admin, `/api/import/${r2.body.id}/confirm`, {})).status).toBe(400);
    expect((await pool.query("SELECT count(*)::int n FROM projetos WHERE codigo = '4_70'")).rows[0].n).toBe(0);
    const hist = (await admin.get('/api/import')).body; expect(hist.itens.map((i: any) => i.status)).toEqual(expect.arrayContaining(['CONCLUIDA', 'CANCELADA']));
  });

  it('códigos de projetos excluídos nunca são reutilizados e usuários fora da APD são recusados no mapeamento', async () => {
    const pj = (await pool.query("SELECT id FROM projetos WHERE codigo = '4_61'")).rows[0].id;
    await pool.query('UPDATE projetos SET ativo = false WHERE id = $1', [pj]);
    const r = await prev(admin, await planilha([L('4_61', 'Z', { atv: 'Tentativa' })]));
    expect(r.body.resumo.erros).toBe(1);
    const idOp = (await admin.get('/api/users?pageSize=100')).body.itens.find((u: any) => u.username === 'operador').id;
    expect((await post(admin, `/api/import/${r.body.id}/confirm`, { pessoas: { Marcos: idOp } })).status).toBe(400);
    await pool.query('UPDATE projetos SET ativo = true WHERE id = $1', [pj]);
  });
});

describe('Fase 6 — API documentada (OpenAPI)', () => {
  it('serve a especificação e a interface /api/docs com os assets locais', async () => {
    const r = await request(app).get('/api/openapi.json');
    expect(r.status).toBe(200); expect(r.body.openapi).toMatch(/^3\./); expect(r.body.info.version).toBe('0.6.0');
    for (const p of ['/auth/login', '/projects', '/projects/{id}/stages', '/documents/{id}/download', '/reports/{id}', '/import/preview', '/import/{id}/confirm', '/dashboard/indicadores']) expect(r.body.paths[p], p).toBeTruthy();
    expect(Object.keys(r.body.paths).length).toBeGreaterThan(60);
    const docs = await request(app).get('/api/docs'); expect(docs.status).toBe(200); expect(docs.text).toContain('swagger-ui');
    expect((await request(app).get('/api/docs/assets/swagger-ui-bundle.js')).status).toBe(200);
    expect((await request(app).get('/api/health')).body.versao).toBe('0.6.0');
  });
});

describe('Fase 6 — views para Power BI', () => {
  it('expõe as views bi_* consultáveis, com dados e sem campos sensíveis', async () => {
    for (const v of ['bi_dim_frentes', 'bi_dim_status', 'bi_dim_pessoas', 'bi_dim_calendario', 'bi_projetos', 'bi_etapas', 'bi_atividades', 'bi_movimentacoes', 'bi_movimentacoes_mensal', 'bi_ocorrencias', 'bi_documentos']) {
      await pool.query(`SELECT * FROM ${v} LIMIT 1`);
    }
    const p = await pool.query('SELECT * FROM bi_projetos');
    expect(p.rowCount).toBeGreaterThan(0);
    expect(p.fields.map((f) => f.name)).toEqual(expect.arrayContaining(['codigo', 'frente', 'situacao_prazo', 'atrasado', 'dias_sem_movimentacao', 'confidencialidade_nivel']));
    const pe = await pool.query('SELECT * FROM bi_dim_pessoas');
    expect(pe.fields.map((f) => f.name).join()).not.toMatch(/email|senha|password/);
    const m = await pool.query('SELECT count(*)::int n FROM bi_movimentacoes'); const t = await pool.query('SELECT count(*)::int n FROM movimentacoes');
    expect(m.rows[0].n).toBe(t.rows[0].n);
  });
});
