-- Central de notificações: etapa vinculada, chave de deduplicação e regras de alerta configuráveis.
ALTER TABLE "notificacoes" ADD COLUMN "etapa_id" integer REFERENCES "etapas"("id");
--> statement-breakpoint
ALTER TABLE "notificacoes" ADD COLUMN "chave" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "notif_user_chave_uq" ON "notificacoes" ("user_id", "chave");
--> statement-breakpoint
ALTER TABLE "alertas" ADD COLUMN "nome" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "alertas" ADD COLUMN "updated_at" timestamp with time zone NOT NULL DEFAULT now();
