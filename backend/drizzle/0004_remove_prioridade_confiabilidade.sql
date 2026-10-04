-- Campos "Prioridade" e "Nível de confiabilidade" removidos do projeto (decisão do cliente).
ALTER TABLE "projetos" DROP CONSTRAINT "projetos_prioridade_id_prioridades_id_fk";--> statement-breakpoint
ALTER TABLE "projetos" DROP COLUMN "prioridade_id";--> statement-breakpoint
ALTER TABLE "projetos" DROP COLUMN "confiabilidade";--> statement-breakpoint
DROP TABLE "prioridades";--> statement-breakpoint
DROP TYPE "public"."confiabilidade";
