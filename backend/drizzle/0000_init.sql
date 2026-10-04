CREATE TYPE "public"."acao_auditoria" AS ENUM('LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'DOCUMENT_UPLOAD', 'DOCUMENT_DELETE', 'USER_CREATE', 'USER_UPDATE', 'PERMISSION_CHANGE', 'PASSWORD_RESET');--> statement-breakpoint
CREATE TYPE "public"."classificacao_status" AS ENUM('INICIAL', 'EM_ANDAMENTO', 'ATENCAO', 'ATRASO', 'BLOQUEIO', 'PAUSADO', 'CONCLUIDO', 'CANCELADO');--> statement-breakpoint
CREATE TYPE "public"."confiabilidade" AS ENUM('ALTA', 'MEDIA', 'BAIXA', 'NAO_INFORMADO');--> statement-breakpoint
CREATE TYPE "public"."severidade" AS ENUM('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');--> statement-breakpoint
CREATE TABLE "alertas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alertas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tipo" text NOT NULL,
	"antecedencia_dias" integer,
	"frequencia" text DEFAULT 'DIARIA' NOT NULL,
	"destinatarios" jsonb,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atividades" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "atividades_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"etapa_id" integer NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"responsavel_id" integer,
	"status_id" integer NOT NULL,
	"data_inicio" date,
	"data_prevista" date,
	"data_conclusao_real" date,
	"peso" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"origem_importacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" integer,
	"usuario_nome" text,
	"data_hora" timestamp with time zone DEFAULT now() NOT NULL,
	"acao" "acao_auditoria" NOT NULL,
	"modulo" text NOT NULL,
	"registro_id" text,
	"registro_rotulo" text,
	"projeto_id" integer,
	"campo" text,
	"valor_anterior" text,
	"valor_novo" text,
	"ip" text,
	"info" jsonb
);
--> statement-breakpoint
CREATE TABLE "colaboradores" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "colaboradores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nome" text NOT NULL,
	"email" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"user_id" integer,
	"equipe_id" integer,
	CONSTRAINT "colaboradores_nome_unique" UNIQUE("nome"),
	CONSTRAINT "colaboradores_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "confidencialidades" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "confidencialidades_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nome" text NOT NULL,
	"nivel" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "confidencialidades_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "configuracoes" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"descricao" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documento_versoes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "documento_versoes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"documento_id" integer NOT NULL,
	"versao" integer NOT NULL,
	"arquivo_nome" text NOT NULL,
	"arquivo_path" text NOT NULL,
	"mime_type" text,
	"tamanho" integer,
	"usuario_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documentos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "documentos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nome" text NOT NULL,
	"tipo_id" integer,
	"categoria" text,
	"projeto_id" integer NOT NULL,
	"etapa_id" integer,
	"atividade_id" integer,
	"responsavel_id" integer,
	"confidencialidade_id" integer,
	"caminho_rede" text,
	"observacao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "equipes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "equipes_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "etapas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "etapas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"projeto_id" integer NOT NULL,
	"letra" varchar(4) NOT NULL,
	"ordem" integer NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"responsavel_id" integer,
	"equipe_id" integer,
	"status_id" integer NOT NULL,
	"data_inicio" date,
	"data_prevista" date,
	"data_conclusao_real" date,
	"peso" integer DEFAULT 1 NOT NULL,
	"percentual_execucao" integer DEFAULT 0 NOT NULL,
	"pasta_caminho" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"origem_importacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "frentes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "frentes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frentes_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "frentes_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "movimentacoes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "movimentacoes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"projeto_id" integer NOT NULL,
	"etapa_id" integer,
	"atividade_id" integer,
	"data_hora" timestamp with time zone DEFAULT now() NOT NULL,
	"usuario_id" integer NOT NULL,
	"tipo_id" integer NOT NULL,
	"descricao" text NOT NULL,
	"anexo_id" integer,
	"importada" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notificacoes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notificacoes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"mensagem" text NOT NULL,
	"projeto_id" integer,
	"lida_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ocorrencias" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ocorrencias_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"titulo" text NOT NULL,
	"descricao" text,
	"data" timestamp with time zone DEFAULT now() NOT NULL,
	"projeto_id" integer,
	"etapa_id" integer,
	"atividade_id" integer,
	"tipo_id" integer,
	"responsavel_id" integer,
	"severidade" "severidade" DEFAULT 'MEDIA' NOT NULL,
	"status" text DEFAULT 'ABERTA' NOT NULL,
	"prazo_resolucao" date,
	"data_resolucao" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "password_resets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "permissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"codigo" text NOT NULL,
	"modulo" text NOT NULL,
	"descricao" text NOT NULL,
	CONSTRAINT "permissions_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "prioridades" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "prioridades_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nome" text NOT NULL,
	"nivel" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "prioridades_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "projeto_membros" (
	"projeto_id" integer NOT NULL,
	"colaborador_id" integer NOT NULL,
	CONSTRAINT "projeto_membros_projeto_id_colaborador_id_pk" PRIMARY KEY("projeto_id","colaborador_id")
);
--> statement-breakpoint
CREATE TABLE "projetos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "projetos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"frente_id" integer NOT NULL,
	"sequencia" integer NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"dono_id" integer,
	"scrum_master_id" integer,
	"equipe_id" integer,
	"status_id" integer NOT NULL,
	"confidencialidade_id" integer NOT NULL,
	"prioridade_id" integer NOT NULL,
	"confiabilidade" "confiabilidade" DEFAULT 'NAO_INFORMADO' NOT NULL,
	"data_inicio" date,
	"data_prevista" date,
	"data_conclusao_real" date,
	"ultima_movimentacao_em" timestamp with time zone,
	"percentual_execucao" integer DEFAULT 0 NOT NULL,
	"pasta_caminho" text,
	"observacoes" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"campos_extras" jsonb,
	"origem_importacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" integer,
	"updated_by_id" integer,
	CONSTRAINT "projetos_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" integer NOT NULL,
	"permission_id" integer NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "roles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nome" text NOT NULL,
	"descricao" text,
	"sistema" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "roles_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "status" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "status_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nome" text NOT NULL,
	"classificacao" "classificacao_status" NOT NULL,
	"cor" text DEFAULT '#64748b' NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "status_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "tipos_documento" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tipos_documento_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "tipos_documento_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "tipos_movimentacao" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tipos_movimentacao_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "tipos_movimentacao_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "tipos_ocorrencia" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tipos_ocorrencia_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "tipos_ocorrencia_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"username" text NOT NULL,
	"email" text NOT NULL,
	"nome" text NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"role_id" integer NOT NULL,
	"last_login_at" timestamp with time zone,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_etapa_id_etapas_id_fk" FOREIGN KEY ("etapa_id") REFERENCES "public"."etapas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_responsavel_id_colaboradores_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_status_id_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."status"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_equipe_id_equipes_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_versoes" ADD CONSTRAINT "documento_versoes_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_versoes" ADD CONSTRAINT "documento_versoes_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_tipo_id_tipos_documento_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipos_documento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_etapa_id_etapas_id_fk" FOREIGN KEY ("etapa_id") REFERENCES "public"."etapas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_atividade_id_atividades_id_fk" FOREIGN KEY ("atividade_id") REFERENCES "public"."atividades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_responsavel_id_colaboradores_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_confidencialidade_id_confidencialidades_id_fk" FOREIGN KEY ("confidencialidade_id") REFERENCES "public"."confidencialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etapas" ADD CONSTRAINT "etapas_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etapas" ADD CONSTRAINT "etapas_responsavel_id_colaboradores_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etapas" ADD CONSTRAINT "etapas_equipe_id_equipes_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etapas" ADD CONSTRAINT "etapas_status_id_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."status"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_etapa_id_etapas_id_fk" FOREIGN KEY ("etapa_id") REFERENCES "public"."etapas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_atividade_id_atividades_id_fk" FOREIGN KEY ("atividade_id") REFERENCES "public"."atividades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_tipo_id_tipos_movimentacao_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipos_movimentacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_anexo_id_documentos_id_fk" FOREIGN KEY ("anexo_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencias" ADD CONSTRAINT "ocorrencias_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencias" ADD CONSTRAINT "ocorrencias_etapa_id_etapas_id_fk" FOREIGN KEY ("etapa_id") REFERENCES "public"."etapas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencias" ADD CONSTRAINT "ocorrencias_atividade_id_atividades_id_fk" FOREIGN KEY ("atividade_id") REFERENCES "public"."atividades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencias" ADD CONSTRAINT "ocorrencias_tipo_id_tipos_ocorrencia_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipos_ocorrencia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencias" ADD CONSTRAINT "ocorrencias_responsavel_id_colaboradores_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto_membros" ADD CONSTRAINT "projeto_membros_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto_membros" ADD CONSTRAINT "projeto_membros_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projetos" ADD CONSTRAINT "projetos_frente_id_frentes_id_fk" FOREIGN KEY ("frente_id") REFERENCES "public"."frentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projetos" ADD CONSTRAINT "projetos_dono_id_colaboradores_id_fk" FOREIGN KEY ("dono_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projetos" ADD CONSTRAINT "projetos_scrum_master_id_colaboradores_id_fk" FOREIGN KEY ("scrum_master_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projetos" ADD CONSTRAINT "projetos_equipe_id_equipes_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projetos" ADD CONSTRAINT "projetos_status_id_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."status"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projetos" ADD CONSTRAINT "projetos_confidencialidade_id_confidencialidades_id_fk" FOREIGN KEY ("confidencialidade_id") REFERENCES "public"."confidencialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projetos" ADD CONSTRAINT "projetos_prioridade_id_prioridades_id_fk" FOREIGN KEY ("prioridade_id") REFERENCES "public"."prioridades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projetos" ADD CONSTRAINT "projetos_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projetos" ADD CONSTRAINT "projetos_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atividades_etapa_idx" ON "atividades" USING btree ("etapa_id");--> statement-breakpoint
CREATE INDEX "atividades_status_idx" ON "atividades" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "atividades_prevista_idx" ON "atividades" USING btree ("data_prevista");--> statement-breakpoint
CREATE INDEX "audit_data_idx" ON "audit_logs" USING btree ("data_hora");--> statement-breakpoint
CREATE INDEX "audit_projeto_data_idx" ON "audit_logs" USING btree ("projeto_id","data_hora");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_modulo_idx" ON "audit_logs" USING btree ("modulo","registro_id");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_versao_uq" ON "documento_versoes" USING btree ("documento_id","versao");--> statement-breakpoint
CREATE UNIQUE INDEX "etapas_projeto_letra_uq" ON "etapas" USING btree ("projeto_id","letra");--> statement-breakpoint
CREATE INDEX "etapas_status_idx" ON "etapas" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "etapas_prevista_idx" ON "etapas" USING btree ("data_prevista");--> statement-breakpoint
CREATE INDEX "mov_projeto_data_idx" ON "movimentacoes" USING btree ("projeto_id","data_hora");--> statement-breakpoint
CREATE INDEX "mov_etapa_idx" ON "movimentacoes" USING btree ("etapa_id");--> statement-breakpoint
CREATE INDEX "mov_atividade_idx" ON "movimentacoes" USING btree ("atividade_id");--> statement-breakpoint
CREATE INDEX "mov_usuario_idx" ON "movimentacoes" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "mov_data_idx" ON "movimentacoes" USING btree ("data_hora");--> statement-breakpoint
CREATE INDEX "notif_user_idx" ON "notificacoes" USING btree ("user_id","lida_em");--> statement-breakpoint
CREATE UNIQUE INDEX "projetos_frente_seq_uq" ON "projetos" USING btree ("frente_id","sequencia");--> statement-breakpoint
CREATE INDEX "projetos_status_idx" ON "projetos" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "projetos_prevista_idx" ON "projetos" USING btree ("data_prevista");--> statement-breakpoint
CREATE INDEX "projetos_scrum_idx" ON "projetos" USING btree ("scrum_master_id");--> statement-breakpoint
CREATE INDEX "projetos_dono_idx" ON "projetos" USING btree ("dono_id");--> statement-breakpoint
CREATE INDEX "projetos_equipe_idx" ON "projetos" USING btree ("equipe_id");--> statement-breakpoint
CREATE INDEX "projetos_ultmov_idx" ON "projetos" USING btree ("ultima_movimentacao_em");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");