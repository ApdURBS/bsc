-- Fase 5: documentos (hash, observação por versão, anexos de ocorrência) e ocorrências (autoria, solução).
ALTER TABLE "documentos" ADD COLUMN "ocorrencia_id" integer REFERENCES "ocorrencias"("id");
--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "updated_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "created_by_id" integer REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "documento_versoes" ADD COLUMN "sha256" text;
--> statement-breakpoint
ALTER TABLE "documento_versoes" ADD COLUMN "observacao" text;
--> statement-breakpoint
ALTER TABLE "ocorrencias" ADD COLUMN "solucao" text;
--> statement-breakpoint
ALTER TABLE "ocorrencias" ADD COLUMN "created_by_id" integer REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "ocorrencias" ADD COLUMN "updated_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
CREATE INDEX "documentos_projeto_idx" ON "documentos" ("projeto_id");
--> statement-breakpoint
CREATE INDEX "documentos_etapa_idx" ON "documentos" ("etapa_id");
--> statement-breakpoint
CREATE INDEX "ocorrencias_projeto_idx" ON "ocorrencias" ("projeto_id");
--> statement-breakpoint
CREATE INDEX "ocorrencias_status_idx" ON "ocorrencias" ("status");
