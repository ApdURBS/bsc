-- Fase 6: importação da planilha (prévia -> confirmação) com rastreabilidade.
CREATE TABLE "importacoes" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "arquivo_nome" text NOT NULL,
  "arquivo_sha256" text NOT NULL,
  "aba" text,
  "status" text NOT NULL DEFAULT 'PREVIA',
  "usuario_id" integer NOT NULL REFERENCES "users"("id"),
  "resumo" jsonb,
  "problemas" jsonb,
  "payload" jsonb,
  "resultado" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "concluida_em" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "importacoes_status_idx" ON "importacoes" ("status");
--> statement-breakpoint
ALTER TABLE "projetos" ADD COLUMN "importacao_id" integer REFERENCES "importacoes"("id");
--> statement-breakpoint
ALTER TABLE "etapas" ADD COLUMN "importacao_id" integer REFERENCES "importacoes"("id");
--> statement-breakpoint
ALTER TABLE "movimentacoes" ADD COLUMN "importacao_id" integer REFERENCES "importacoes"("id");
--> statement-breakpoint
ALTER TABLE "movimentacoes" ADD COLUMN "origem_linha" integer;
--> statement-breakpoint
CREATE INDEX "mov_importacao_idx" ON "movimentacoes" ("importacao_id");
