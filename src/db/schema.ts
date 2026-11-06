import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Conta do desenvolvedor (dona do app) */
export const developers = pgTable("developers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Conta licenciada da cartomante */
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ownerName: text("owner_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  plan: text("plan").notNull().default("monthly"),
  status: text("status").notNull().default("active"),
  priceCents: integer("price_cents").notNull().default(0),
  startedAt: date("started_at").notNull().defaultNow(),
  expiresAt: date("expires_at"),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const sessions = pgTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    role: text("role").notNull(),
    developerId: integer("developer_id"),
    tenantId: integer("tenant_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_tenant_idx").on(t.tenantId)],
);

/** Pagamentos de licença registrados pelo desenvolvedor */
export const licensePayments = pgTable(
  "license_payments",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    plan: text("plan").notNull(),
    paidAt: date("paid_at").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("license_payments_tenant_idx").on(t.tenantId)],
);

export const consulentes = pgTable(
  "consulentes",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    notes: text("notes"),
    origin: text("origin").notNull().default("nao_informado"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consulentes_tenant_idx").on(t.tenantId)],
);

export const methods = pgTable(
  "methods",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull().default(0),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    active: boolean("active").notNull().default(true),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("methods_tenant_idx").on(t.tenantId)],
);

export const consultations = pgTable(
  "consultations",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    consulenteId: integer("consulente_id").notNull(),
    methodId: integer("method_id"),
    methodName: text("method_name").notNull(),
    methodPriceCents: integer("method_price_cents").notNull().default(0),
    priceCents: integer("price_cents").notNull().default(0),
    date: date("date").notNull(),
    startTime: text("start_time").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    actualSeconds: integer("actual_seconds").notNull().default(0),
    timerStartedAt: timestamp("timer_started_at", { withTimezone: true }),
    timerEndedAt: timestamp("timer_ended_at", { withTimezone: true }),
    status: text("status").notNull().default("agendada"),
    paymentStatus: text("payment_status").notNull().default("pendente"),
    paymentMethod: text("payment_method"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("consultations_tenant_idx").on(t.tenantId),
    index("consultations_date_idx").on(t.date),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    consultationId: integer("consultation_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paidAt: date("paid_at").notNull(),
    method: text("method").notNull().default("pix"),
    notes: text("notes"),
    kind: text("kind").notNull().default("pagamento"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_tenant_idx").on(t.tenantId),
    uniqueIndex("payments_idem_idx").on(t.tenantId, t.idempotencyKey),
  ],
);

export const workCatalog = pgTable(
  "work_catalog",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    kind: text("kind").notNull().default("magia"),
    name: text("name").notNull(),
    description: text("description"),
    materials: text("materials"),
    priceCents: integer("price_cents").notNull().default(0),
    cycleDays: integer("cycle_days").notNull().default(1),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    imageUrl: text("image_url"),
    active: boolean("active").notNull().default(true),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("work_catalog_tenant_idx").on(t.tenantId)],
);

export const spiritualWorks = pgTable(
  "spiritual_works",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    consulenteId: integer("consulente_id").notNull(),
    catalogId: integer("catalog_id"),
    kind: text("kind").notNull().default("magia"),
    title: text("title").notNull(),
    catalogPriceCents: integer("catalog_price_cents").notNull().default(0),
    priceCents: integer("price_cents").notNull().default(0),
    materialCostCents: integer("material_cost_cents").notNull().default(0),
    date: date("date").notNull(),
    startTime: text("start_time"),
    endDate: date("end_date"),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    cycleDays: integer("cycle_days").notNull().default(1),
    status: text("status").notNull().default("em_andamento"),
    paymentStatus: text("payment_status").notNull().default("pendente"),
    paymentMethod: text("payment_method"),
    intention: text("intention"),
    materials: text("materials"),
    imageUrl: text("image_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("spiritual_works_tenant_idx").on(t.tenantId),
    index("spiritual_works_date_idx").on(t.date),
  ],
);

export const workPayments = pgTable(
  "work_payments",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    workId: integer("work_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paidAt: date("paid_at").notNull(),
    method: text("method").notNull().default("Pix"),
    notes: text("notes"),
    kind: text("kind").notNull().default("pagamento"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("work_payments_tenant_idx").on(t.tenantId),
    uniqueIndex("work_payments_idem_idx").on(t.tenantId, t.idempotencyKey),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    type: text("type").notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    date: date("date").notNull(),
    category: text("category").notNull(),
    paymentMethod: text("payment_method").notNull().default("pix"),
    notes: text("notes"),
    consultationId: integer("consultation_id"),
    paymentId: integer("payment_id"),
    workId: integer("work_id"),
    workPaymentId: integer("work_payment_id"),
    reference: text("reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_tenant_idx").on(t.tenantId),
    uniqueIndex("transactions_ref_idx").on(t.tenantId, t.reference),
  ],
);

export const monthlyGoals = pgTable(
  "monthly_goals",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    month: text("month").notNull(),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("monthly_goals_month_idx").on(t.tenantId, t.month)],
);

export const tenantSettings = pgTable("tenant_settings", {
  tenantId: integer("tenant_id").primaryKey(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_tenant_idx").on(t.tenantId)],
);

export const backups = pgTable(
  "backups",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    counts: jsonb("counts").$type<Record<string, number>>(),
    reason: text("reason").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("backups_tenant_idx").on(t.tenantId)],
);
