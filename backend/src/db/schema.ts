// Controle BSC — APD/UPD — URBS
// Modelo relacional completo (Fases 1–6). Datas de negócio = date (string 'YYYY-MM-DD');
// eventos = timestamptz. Tabelas de eventos (movimentacoes, audit_logs) são imutáveis via trigger (ver drizzle/0001_imutabilidade.sql).
import {
  pgTable, pgEnum, integer, bigint, text, boolean, timestamp, date, jsonb, uniqueIndex, index, primaryKey, varchar,
} from 'drizzle-orm/pg-core';

const id = () => integer('id').primaryKey().generatedAlwaysAsIdentity();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// ───────────── Enums ─────────────
export const classificacaoStatus = pgEnum('classificacao_status', [
  'INICIAL', 'EM_ANDAMENTO', 'ATENCAO', 'ATRASO', 'BLOQUEIO', 'PAUSADO', 'CONCLUIDO', 'CANCELADO',
]);
export const severidade = pgEnum('severidade', ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']);
export const acaoAuditoria = pgEnum('acao_auditoria', [
  'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE',
  'DOCUMENT_UPLOAD', 'DOCUMENT_DELETE', 'USER_CREATE', 'USER_UPDATE', 'PERMISSION_CHANGE', 'PASSWORD_RESET',
]);

// ───────────── Acesso ─────────────
export const roles = pgTable('roles', {
  id: id(),
  nome: text('nome').notNull().unique(),
  descricao: text('descricao'),
  sistema: boolean('sistema').notNull().default(false), // perfis nativos não podem ser excluídos
  convidado: boolean('convidado').notNull().default(false), // perfil de convidado: só enxerga conteúdo de acesso livre
  ativo: boolean('ativo').notNull().default(true),
});

export const permissions = pgTable('permissions', {
  id: id(),
  codigo: text('codigo').notNull().unique(), // ex.: projects.create
  modulo: text('modulo').notNull(),
  descricao: text('descricao').notNull(),
});

export const rolePermissions = pgTable('role_permissions', {
  roleId: integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: integer('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })]);

export const users = pgTable('users', {
  id: id(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  nome: text('nome').notNull(),
  passwordHash: text('password_hash').notNull(),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  pertenceApd: boolean('pertence_apd').notNull().default(false), // usuário da APD/UPD (enxerga conteúdo "Interno APD")
  ativo: boolean('ativo').notNull().default(true),
  roleId: integer('role_id').notNull().references(() => roles.id),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ip: text('ip'),
  userAgent: text('user_agent'),
}, (t) => [index('sessions_user_idx').on(t.userId)]);

export const passwordResets = pgTable('password_resets', {
  id: id(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
});

// ───────────── Cadastros configuráveis ─────────────
export const frentes = pgTable('frentes', {
  id: id(),
  codigo: text('codigo').notNull().unique(), // prefixo do código do projeto
  nome: text('nome').notNull().unique(),
  ordem: integer('ordem').notNull().default(0),
  ativo: boolean('ativo').notNull().default(true),
  createdAt: createdAt(),
});

// Dono, Scrum Master, membros e responsáveis são USUÁRIOS (marcados "Pertence à APD/UPD").

export const statusTbl = pgTable('status', {
  id: id(),
  nome: text('nome').notNull().unique(),
  classificacao: classificacaoStatus('classificacao').notNull(),
  cor: text('cor').notNull().default('#64748b'),
  ordem: integer('ordem').notNull().default(0),
  ativo: boolean('ativo').notNull().default(true),
});

export const confidencialidades = pgTable('confidencialidades', {
  id: id(),
  nome: text('nome').notNull().unique(),
  nivel: integer('nivel').notNull().default(0), // maior = mais restrito
  // TODOS = qualquer usuário (inclusive convidado) · USUARIOS = todos os usuários, exceto convidado · EQUIPE_APD = apenas usuários APD/UPD
  regraAcesso: text('regra_acesso', { enum: ['TODOS', 'USUARIOS', 'EQUIPE_APD'] }).notNull().default('USUARIOS'),
  ativo: boolean('ativo').notNull().default(true),
});

export const tiposMovimentacao = pgTable('tipos_movimentacao', {
  id: id(),
  nome: text('nome').notNull().unique(),
  ativo: boolean('ativo').notNull().default(true),
});

export const tiposDocumento = pgTable('tipos_documento', {
  id: id(),
  nome: text('nome').notNull().unique(),
  ativo: boolean('ativo').notNull().default(true),
});

export const tiposOcorrencia = pgTable('tipos_ocorrencia', {
  id: id(),
  nome: text('nome').notNull().unique(),
  ativo: boolean('ativo').notNull().default(true),
});

export const configuracoes = pgTable('configuracoes', {
  chave: text('chave').primaryKey(),
  valor: jsonb('valor').notNull(),
  descricao: text('descricao'),
  updatedAt: updatedAt(),
});

// ───────────── Núcleo: Frente → Projeto → Etapa → Atividade → Movimentação ─────────────
export const projetos = pgTable('projetos', {
  id: id(),
  frenteId: integer('frente_id').notNull().references(() => frentes.id),
  sequencia: integer('sequencia').notNull(), // número dentro da frente
  codigo: text('codigo').notNull().unique(), // FRENTE_SEQUENCIA, ex.: 2_1
  nome: text('nome').notNull(),
  descricao: text('descricao'),
  donoId: integer('dono_id').references(() => users.id),
  statusId: integer('status_id').notNull().references(() => statusTbl.id),
  confidencialidadeId: integer('confidencialidade_id').notNull().references(() => confidencialidades.id),
  dataInicio: date('data_inicio', { mode: 'string' }), // derivada das etapas (menor início)
  dataPrevista: date('data_prevista', { mode: 'string' }), // derivada das etapas (maior previsão)
  dataConclusaoReal: date('data_conclusao_real', { mode: 'string' }),
  ultimaMovimentacaoEm: timestamp('ultima_movimentacao_em', { withTimezone: true }),
  percentualExecucao: integer('percentual_execucao').notNull().default(0), // derivado: recalculado pelo sistema
  pastaCaminho: text('pasta_caminho'), // referência a pasta de rede; não é aberta pelo navegador
  observacoes: text('observacoes'),
  ativo: boolean('ativo').notNull().default(true),
  camposExtras: jsonb('campos_extras'), // extensão futura: Direcionador, Código da Ação Tática, etc.
  origemImportacao: text('origem_importacao'),
  importacaoId: integer('importacao_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  createdById: integer('created_by_id').references(() => users.id),
  updatedById: integer('updated_by_id').references(() => users.id),
}, (t) => [
  uniqueIndex('projetos_frente_seq_uq').on(t.frenteId, t.sequencia),
  index('projetos_status_idx').on(t.statusId),
  index('projetos_prevista_idx').on(t.dataPrevista),
  index('projetos_dono_idx').on(t.donoId),
  index('projetos_ultmov_idx').on(t.ultimaMovimentacaoEm),
]);

export const etapas = pgTable('etapas', {
  id: id(),
  projetoId: integer('projeto_id').notNull().references(() => projetos.id),
  letra: varchar('letra', { length: 4 }).notNull(), // A..Z, AA, AB...
  ordem: integer('ordem').notNull(), // posição da letra (A=1)
  nome: text('nome').notNull(),
  descricao: text('descricao'),
  responsavelId: integer('responsavel_id').references(() => users.id),
  scrumMasterId: integer('scrum_master_id').references(() => users.id),
  tags: text('tags').array().notNull().default([]),
  statusId: integer('status_id').notNull().references(() => statusTbl.id),
  dataInicio: date('data_inicio', { mode: 'string' }),
  dataPrevista: date('data_prevista', { mode: 'string' }),
  dataConclusaoReal: date('data_conclusao_real', { mode: 'string' }),
  peso: integer('peso').notNull().default(1),
  percentualExecucao: integer('percentual_execucao').notNull().default(0),
  pastaCaminho: text('pasta_caminho'),
  ativo: boolean('ativo').notNull().default(true),
  origemImportacao: text('origem_importacao'),
  importacaoId: integer('importacao_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('etapas_projeto_letra_uq').on(t.projetoId, t.letra),
  index('etapas_status_idx').on(t.statusId),
  index('etapas_scrum_idx').on(t.scrumMasterId),
  index('etapas_prevista_idx').on(t.dataPrevista),
]);

export const etapaMembros = pgTable('etapa_membros', {
  etapaId: integer('etapa_id').notNull().references(() => etapas.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id),
}, (t) => [primaryKey({ columns: [t.etapaId, t.userId] }), index('etapa_membros_user_idx').on(t.userId)]);

export const atividades = pgTable('atividades', {
  id: id(),
  etapaId: integer('etapa_id').notNull().references(() => etapas.id),
  nome: text('nome').notNull(),
  descricao: text('descricao'),
  responsavelId: integer('responsavel_id').references(() => users.id),
  statusId: integer('status_id').notNull().references(() => statusTbl.id),
  dataInicio: date('data_inicio', { mode: 'string' }),
  dataPrevista: date('data_prevista', { mode: 'string' }),
  dataConclusaoReal: date('data_conclusao_real', { mode: 'string' }),
  peso: integer('peso').notNull().default(1),
  ativo: boolean('ativo').notNull().default(true),
  origemImportacao: text('origem_importacao'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('atividades_etapa_idx').on(t.etapaId),
  index('atividades_status_idx').on(t.statusId),
  index('atividades_prevista_idx').on(t.dataPrevista),
]);

// Cada movimentação é um novo registro — nunca alterada nem apagada (trigger no banco).
export const documentos = pgTable('documentos', {
  id: id(),
  nome: text('nome').notNull(),
  tipoId: integer('tipo_id').references(() => tiposDocumento.id),
  categoria: text('categoria'), // Relatórios | Documentos | Evidências | Outros
  projetoId: integer('projeto_id').notNull().references(() => projetos.id),
  etapaId: integer('etapa_id').references(() => etapas.id),
  atividadeId: integer('atividade_id').references(() => atividades.id),
  responsavelId: integer('responsavel_id').references(() => users.id),
  confidencialidadeId: integer('confidencialidade_id').references(() => confidencialidades.id),
  caminhoRede: text('caminho_rede'), // referência textual; nunca aberta automaticamente
  observacao: text('observacao'),
  ocorrenciaId: integer('ocorrencia_id').references(() => ocorrencias.id),
  ativo: boolean('ativo').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  createdById: integer('created_by_id').references(() => users.id),
}, (t) => [index('documentos_projeto_idx').on(t.projetoId), index('documentos_etapa_idx').on(t.etapaId)]);

export const documentoVersoes = pgTable('documento_versoes', {
  id: id(),
  documentoId: integer('documento_id').notNull().references(() => documentos.id),
  versao: integer('versao').notNull(),
  arquivoNome: text('arquivo_nome').notNull(),
  arquivoPath: text('arquivo_path').notNull(),
  mimeType: text('mime_type'),
  tamanho: integer('tamanho'),
  sha256: text('sha256'),
  observacao: text('observacao'),
  usuarioId: integer('usuario_id').references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('doc_versao_uq').on(t.documentoId, t.versao)]);

export const movimentacoes = pgTable('movimentacoes', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  projetoId: integer('projeto_id').notNull().references(() => projetos.id),
  etapaId: integer('etapa_id').references(() => etapas.id),
  atividadeId: integer('atividade_id').references(() => atividades.id),
  dataHora: timestamp('data_hora', { withTimezone: true }).notNull().defaultNow(),
  usuarioId: integer('usuario_id').notNull().references(() => users.id),
  tipoId: integer('tipo_id').notNull().references(() => tiposMovimentacao.id),
  descricao: text('descricao').notNull(),
  anexoId: integer('anexo_id').references(() => documentos.id),
  importada: boolean('importada').notNull().default(false),
  importacaoId: integer('importacao_id'),
  origemLinha: integer('origem_linha'),
  createdAt: createdAt(),
}, (t) => [
  index('mov_projeto_data_idx').on(t.projetoId, t.dataHora),
  index('mov_etapa_idx').on(t.etapaId),
  index('mov_atividade_idx').on(t.atividadeId),
  index('mov_usuario_idx').on(t.usuarioId),
  index('mov_data_idx').on(t.dataHora),
]);

// ───────────── Ocorrências, notificações, alertas (Fases 4–5; tabelas já criadas) ─────────────
export const ocorrencias = pgTable('ocorrencias', {
  id: id(),
  titulo: text('titulo').notNull(),
  descricao: text('descricao'),
  data: timestamp('data', { withTimezone: true }).notNull().defaultNow(),
  projetoId: integer('projeto_id').references(() => projetos.id),
  etapaId: integer('etapa_id').references(() => etapas.id),
  atividadeId: integer('atividade_id').references(() => atividades.id),
  tipoId: integer('tipo_id').references(() => tiposOcorrencia.id),
  responsavelId: integer('responsavel_id').references(() => users.id),
  severidade: severidade('severidade').notNull().default('MEDIA'),
  status: text('status').notNull().default('ABERTA'),
  prazoResolucao: date('prazo_resolucao', { mode: 'string' }),
  dataResolucao: date('data_resolucao', { mode: 'string' }),
  solucao: text('solucao'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  createdById: integer('created_by_id').references(() => users.id),
}, (t) => [index('ocorrencias_projeto_idx').on(t.projetoId), index('ocorrencias_status_idx').on(t.status)]);

export const notificacoes = pgTable('notificacoes', {
  id: id(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tipo: text('tipo').notNull(),
  mensagem: text('mensagem').notNull(),
  projetoId: integer('projeto_id').references(() => projetos.id),
  etapaId: integer('etapa_id').references(() => etapas.id),
  chave: text('chave'), // deduplicação: mesma regra + mesmo item + mesmo período = uma única notificação
  lidaEm: timestamp('lida_em', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('notif_user_idx').on(t.userId, t.lidaEm), uniqueIndex('notif_user_chave_uq').on(t.userId, t.chave)]);

export const alertas = pgTable('alertas', {
  id: id(),
  nome: text('nome').notNull().default(''),
  tipo: text('tipo').notNull(),
  antecedenciaDias: integer('antecedencia_dias'),
  frequencia: text('frequencia').notNull().default('DIARIA'),
  destinatarios: jsonb('destinatarios'),
  ativo: boolean('ativo').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ───────────── Auditoria (imutável — trigger no banco) ─────────────
export const auditLogs = pgTable('audit_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id').references(() => users.id),
  usuarioNome: text('usuario_nome'), // congelado no momento da ação
  dataHora: timestamp('data_hora', { withTimezone: true }).notNull().defaultNow(),
  acao: acaoAuditoria('acao').notNull(),
  modulo: text('modulo').notNull(),
  registroId: text('registro_id'),
  registroRotulo: text('registro_rotulo'), // rótulo legível (ex.: "2_13", "2_1 A")
  projetoId: integer('projeto_id').references(() => projetos.id),
  campo: text('campo'),
  valorAnterior: text('valor_anterior'),
  valorNovo: text('valor_novo'),
  ip: text('ip'),
  info: jsonb('info'),
}, (t) => [
  index('audit_data_idx').on(t.dataHora),
  index('audit_projeto_data_idx').on(t.projetoId, t.dataHora),
  index('audit_user_idx').on(t.userId),
  index('audit_modulo_idx').on(t.modulo, t.registroId),
]);

// ───────────── Importação da planilha (Fase 6) ─────────────
export const importacoes = pgTable('importacoes', {
  id: id(),
  arquivoNome: text('arquivo_nome').notNull(),
  arquivoSha256: text('arquivo_sha256').notNull(),
  aba: text('aba'),
  status: text('status', { enum: ['PREVIA', 'CONCLUIDA', 'CANCELADA', 'FALHOU'] }).notNull().default('PREVIA'),
  usuarioId: integer('usuario_id').notNull().references(() => users.id),
  resumo: jsonb('resumo'),
  problemas: jsonb('problemas'),
  payload: jsonb('payload'), // linhas normalizadas — descartado ao concluir ou cancelar
  resultado: jsonb('resultado'),
  createdAt: createdAt(),
  concluidaEm: timestamp('concluida_em', { withTimezone: true }),
});
