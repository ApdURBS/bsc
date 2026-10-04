ALTER TABLE "roles" ADD COLUMN "convidado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pertence_apd" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "confidencialidades" ADD COLUMN "regra_acesso" text DEFAULT 'USUARIOS' NOT NULL;--> statement-breakpoint
UPDATE "confidencialidades" SET "nome"='Livre', "regra_acesso"='TODOS' WHERE "nome"='Público interno';--> statement-breakpoint
UPDATE "confidencialidades" SET "nome"='Interno URBS', "regra_acesso"='USUARIOS' WHERE "nome"='Restrito';--> statement-breakpoint
UPDATE "confidencialidades" SET "nome"='Interno APD', "regra_acesso"='EQUIPE_APD' WHERE "nome"='Confidencial';--> statement-breakpoint
UPDATE "users" SET "pertence_apd"=true WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "nome"='ADMINISTRADOR');
