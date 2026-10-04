-- Scrum Master, Equipe, Tags e Datas passam a ser informados nas ETAPAS.
ALTER TABLE "etapas" ADD COLUMN "scrum_master_id" integer REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "etapas" ADD COLUMN "tags" text[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
CREATE TABLE "etapa_membros" (
  "etapa_id" integer NOT NULL REFERENCES "etapas"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  PRIMARY KEY ("etapa_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX "etapas_scrum_idx" ON "etapas" ("scrum_master_id");
--> statement-breakpoint
CREATE INDEX "etapa_membros_user_idx" ON "etapa_membros" ("user_id");
--> statement-breakpoint
UPDATE "etapas" e SET "scrum_master_id" = p."scrum_master_id", "tags" = p."tags"
  FROM "projetos" p WHERE p."id" = e."projeto_id";
--> statement-breakpoint
INSERT INTO "etapa_membros" ("etapa_id", "user_id")
  SELECT e."id", pm."user_id" FROM "etapas" e JOIN "projeto_membros" pm ON pm."projeto_id" = e."projeto_id"
  ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "projetos" p SET
  "data_inicio" = COALESCE((SELECT MIN(e."data_inicio") FROM "etapas" e JOIN "status" s ON s."id" = e."status_id"
      WHERE e."projeto_id" = p."id" AND e."ativo" AND s."classificacao" <> 'CANCELADO'), p."data_inicio"),
  "data_prevista" = COALESCE((SELECT MAX(e."data_prevista") FROM "etapas" e JOIN "status" s ON s."id" = e."status_id"
      WHERE e."projeto_id" = p."id" AND e."ativo" AND s."classificacao" <> 'CANCELADO'), p."data_prevista");
--> statement-breakpoint
DROP INDEX IF EXISTS "projetos_scrum_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "projetos_equipe_idx";
--> statement-breakpoint
ALTER TABLE "projetos" DROP COLUMN "scrum_master_id";
--> statement-breakpoint
ALTER TABLE "projetos" DROP COLUMN "equipe_id";
--> statement-breakpoint
ALTER TABLE "projetos" DROP COLUMN "tags";
--> statement-breakpoint
ALTER TABLE "etapas" DROP COLUMN "equipe_id";
--> statement-breakpoint
DROP TABLE "projeto_membros";
--> statement-breakpoint
DROP TABLE "equipes";
