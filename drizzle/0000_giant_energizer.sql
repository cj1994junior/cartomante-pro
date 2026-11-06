CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"counts" jsonb,
	"reason" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consulentes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"notes" text,
	"origin" text DEFAULT 'nao_informado' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"consulente_id" integer NOT NULL,
	"method_id" integer,
	"method_name" text NOT NULL,
	"method_price_cents" integer DEFAULT 0 NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"actual_seconds" integer DEFAULT 0 NOT NULL,
	"timer_started_at" timestamp with time zone,
	"timer_ended_at" timestamp with time zone,
	"status" text DEFAULT 'agendada' NOT NULL,
	"payment_status" text DEFAULT 'pendente' NOT NULL,
	"payment_method" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "developers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "license_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"plan" text NOT NULL,
	"paid_at" date NOT NULL,
	"reference" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"month" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"consultation_id" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"paid_at" date NOT NULL,
	"method" text DEFAULT 'pix' NOT NULL,
	"notes" text,
	"kind" text DEFAULT 'pagamento' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"developer_id" integer,
	"tenant_id" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spiritual_works" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"consulente_id" integer NOT NULL,
	"catalog_id" integer,
	"kind" text DEFAULT 'magia' NOT NULL,
	"title" text NOT NULL,
	"catalog_price_cents" integer DEFAULT 0 NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"material_cost_cents" integer DEFAULT 0 NOT NULL,
	"date" date NOT NULL,
	"start_time" text,
	"end_date" date,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"cycle_days" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'em_andamento' NOT NULL,
	"payment_status" text DEFAULT 'pendente' NOT NULL,
	"payment_method" text,
	"intention" text,
	"materials" text,
	"image_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"tenant_id" integer PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"plan" text DEFAULT 'monthly' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"started_at" date DEFAULT now() NOT NULL,
	"expires_at" date,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "tenants_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"date" date NOT NULL,
	"category" text NOT NULL,
	"payment_method" text DEFAULT 'pix' NOT NULL,
	"notes" text,
	"consultation_id" integer,
	"payment_id" integer,
	"work_id" integer,
	"work_payment_id" integer,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_catalog" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"kind" text DEFAULT 'magia' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"materials" text,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"cycle_days" integer DEFAULT 1 NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"work_id" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"paid_at" date NOT NULL,
	"method" text DEFAULT 'Pix' NOT NULL,
	"notes" text,
	"kind" text DEFAULT 'pagamento' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_tenant_idx" ON "audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "backups_tenant_idx" ON "backups" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "consulentes_tenant_idx" ON "consulentes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "consultations_tenant_idx" ON "consultations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "consultations_date_idx" ON "consultations" USING btree ("date");--> statement-breakpoint
CREATE INDEX "license_payments_tenant_idx" ON "license_payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "methods_tenant_idx" ON "methods" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_goals_month_idx" ON "monthly_goals" USING btree ("tenant_id","month");--> statement-breakpoint
CREATE INDEX "payments_tenant_idx" ON "payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idem_idx" ON "payments" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "sessions_tenant_idx" ON "sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "spiritual_works_tenant_idx" ON "spiritual_works" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "spiritual_works_date_idx" ON "spiritual_works" USING btree ("date");--> statement-breakpoint
CREATE INDEX "transactions_tenant_idx" ON "transactions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_ref_idx" ON "transactions" USING btree ("tenant_id","reference");--> statement-breakpoint
CREATE INDEX "work_catalog_tenant_idx" ON "work_catalog" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "work_payments_tenant_idx" ON "work_payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_payments_idem_idx" ON "work_payments" USING btree ("tenant_id","idempotency_key");