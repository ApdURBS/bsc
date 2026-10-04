-- Colaboradores e usuários passam a ser a mesma coisa: Dono, Scrum Master, membros e responsáveis apontam para users.
-- Correspondência: colaborador vinculado a usuário -> esse usuário; senão, mesmo e-mail; senão, mesmo nome. Sem correspondência -> campo fica vazio.
CREATE TEMP TABLE _map AS
SELECT c.id AS cid,
  COALESCE(
    c.user_id,
    (SELECT u.id FROM users u WHERE c.email IS NOT NULL AND lower(u.email) = lower(c.email) LIMIT 1),
    (SELECT u.id FROM users u WHERE lower(u.nome) = lower(c.nome) LIMIT 1)
  ) AS uid
FROM colaboradores c;--> statement-breakpoint
ALTER TABLE "projetos" DROP CONSTRAINT "projetos_dono_id_colaboradores_id_fk";--> statement-breakpoint
ALTER TABLE "projetos" DROP CONSTRAINT "projetos_scrum_master_id_colaboradores_id_fk";--> statement-breakpoint
ALTER TABLE "etapas" DROP CONSTRAINT "etapas_responsavel_id_colaboradores_id_fk";--> statement-breakpoint
ALTER TABLE "atividades" DROP CONSTRAINT "atividades_responsavel_id_colaboradores_id_fk";--> statement-breakpoint
ALTER TABLE "documentos" DROP CONSTRAINT "documentos_responsavel_id_colaboradores_id_fk";--> statement-breakpoint
ALTER TABLE "ocorrencias" DROP CONSTRAINT "ocorrencias_responsavel_id_colaboradores_id_fk";--> statement-breakpoint
ALTER TABLE "projeto_membros" DROP CONSTRAINT "projeto_membros_colaborador_id_colaboradores_id_fk";--> statement-breakpoint
UPDATE "projetos" SET "dono_id" = (SELECT uid FROM _map WHERE cid = "projetos"."dono_id") WHERE "dono_id" IS NOT NULL;--> statement-breakpoint
UPDATE "projetos" SET "scrum_master_id" = (SELECT uid FROM _map WHERE cid = "projetos"."scrum_master_id") WHERE "scrum_master_id" IS NOT NULL;--> statement-breakpoint
UPDATE "etapas" SET "responsavel_id" = (SELECT uid FROM _map WHERE cid = "etapas"."responsavel_id") WHERE "responsavel_id" IS NOT NULL;--> statement-breakpoint
UPDATE "atividades" SET "responsavel_id" = (SELECT uid FROM _map WHERE cid = "atividades"."responsavel_id") WHERE "responsavel_id" IS NOT NULL;--> statement-breakpoint
UPDATE "documentos" SET "responsavel_id" = (SELECT uid FROM _map WHERE cid = "documentos"."responsavel_id") WHERE "responsavel_id" IS NOT NULL;--> statement-breakpoint
UPDATE "ocorrencias" SET "responsavel_id" = (SELECT uid FROM _map WHERE cid = "ocorrencias"."responsavel_id") WHERE "responsavel_id" IS NOT NULL;--> statement-breakpoint
CREATE TEMP TABLE _pm AS SELECT DISTINCT pm.projeto_id, m.uid FROM "projeto_membros" pm JOIN _map m ON m.cid = pm.colaborador_id WHERE m.uid IS NOT NULL;--> statement-breakpoint
DELETE FROM "projeto_membros";--> statement-breakpoint
ALTER TABLE "projeto_membros" RENAME COLUMN "colaborador_id" TO "user_id";--> statement-breakpoint
INSERT INTO "projeto_membros" ("projeto_id", "user_id") SELECT projeto_id, uid FROM _pm;--> statement-breakpoint
ALTER TABLE "projetos" ADD CONSTRAINT "projetos_dono_id_users_id_fk" FOREIGN KEY ("dono_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projetos" ADD CONSTRAINT "projetos_scrum_master_id_users_id_fk" FOREIGN KEY ("scrum_master_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etapas" ADD CONSTRAINT "etapas_responsavel_id_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_responsavel_id_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_responsavel_id_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencias" ADD CONSTRAINT "ocorrencias_responsavel_id_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto_membros" ADD CONSTRAINT "projeto_membros_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- quem já era dono/scrum/membro/responsável passa a ser da APD/UPD (para continuar selecionável)
UPDATE "users" SET "pertence_apd" = true WHERE "id" IN (
  SELECT dono_id FROM projetos UNION SELECT scrum_master_id FROM projetos UNION SELECT user_id FROM projeto_membros
  UNION SELECT responsavel_id FROM etapas UNION SELECT responsavel_id FROM atividades
);--> statement-breakpoint
DROP TABLE "colaboradores";--> statement-breakpoint
DELETE FROM "role_permissions" WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "codigo" LIKE 'collaborators.%');--> statement-breakpoint
DELETE FROM "permissions" WHERE "codigo" LIKE 'collaborators.%';
