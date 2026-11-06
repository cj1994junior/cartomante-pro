export type Plan = "monthly" | "annual" | "lifetime";
export type TenantStatus = "active" | "blocked" | "expired";
export type ConsultationStatus = "agendada" | "confirmada" | "em_atendimento" | "realizada" | "cancelada" | "nao_compareceu";
export type WorkKind = "magia" | "atividade";
export type WorkStatus = "planejado" | "em_andamento" | "concluido" | "cancelado";
export type PaymentStatus = "pendente" | "parcial" | "pago";
export type CurrencyCode = "BRL" | "EUR" | "USD";
export type Mood = "triste" | "alegre" | "cansado_desanimado" | "radiante" | "doente";
export type DailyMood = { date: string; mood: Mood };
export type ClientOrigin = "nao_informado" | "indicacao" | "whatsapp" | "instagram" | "facebook" | "outro";

export type Consulente = {
  id: number;
  name: string;
  phone: string | null;
  notes: string | null;
  origin: ClientOrigin;
  archived: boolean;
  createdAt: string;
};

export type Method = {
  id: number;
  name: string;
  description: string | null;
  priceCents: number;
  durationMinutes: number;
  active: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Consultation = {
  id: number;
  consulenteId: number;
  methodId: number | null;
  methodName: string;
  methodPriceCents: number;
  priceCents: number;
  date: string;
  startTime: string;
  durationMinutes: number;
  actualSeconds: number;
  timerStartedAt: string | null;
  timerEndedAt: string | null;
  status: ConsultationStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: string;
};

export type WhatsAppTemplateCategory =
  | "confirmacao"
  | "lembrete"
  | "inicio"
  | "pagamento"
  | "pos_consulta"
  | "trabalho"
  | "retorno"
  | "geral";

export type WhatsAppTemplate = {
  id: string;
  title: string;
  category: WhatsAppTemplateCategory;
  body: string;
};

export type WhatsAppTarget = {
  consulenteId: number;
  consultation?: Consultation | null;
  work?: SpiritualWork | null;
  preferredCategory?: WhatsAppTemplateCategory;
};

export type Payment = {
  id: number;
  consultationId: number;
  amountCents: number;
  paidAt: string;
  method: string;
  notes: string | null;
  kind: "pagamento" | "estorno";
  createdAt: string;
};

export type WorkCatalogItem = {
  id: number;
  kind: WorkKind;
  name: string;
  description: string | null;
  materials: string | null;
  priceCents: number;
  cycleDays: number;
  durationMinutes: number;
  imageUrl: string | null;
  active: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SpiritualWork = {
  id: number;
  consulenteId: number;
  catalogId: number | null;
  kind: WorkKind;
  title: string;
  catalogPriceCents: number;
  priceCents: number;
  materialCostCents: number;
  date: string;
  startTime: string | null;
  endDate: string | null;
  durationMinutes: number;
  cycleDays: number;
  status: WorkStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  intention: string | null;
  materials: string | null;
  imageUrl: string | null;
  notes: string | null;
  createdAt: string;
};

export type WorkPayment = {
  id: number;
  workId: number;
  amountCents: number;
  paidAt: string;
  method: string;
  notes: string | null;
  kind: "pagamento" | "estorno";
  createdAt: string;
};

export type Transaction = {
  id: number;
  type: "entrada" | "despesa";
  description: string;
  amountCents: number;
  date: string;
  category: string;
  paymentMethod: string;
  notes: string | null;
  consultationId: number | null;
  paymentId: number | null;
  workId: number | null;
  workPaymentId: number | null;
  reference: string | null;
  createdAt: string;
};

export type MonthlyGoal = { id: number; month: string; amountCents: number };

export type TenantSettingsData = {
  professionalName: string;
  appName: string;
  currency: CurrencyCode;
  palette: string;
  monthlyGoalCents: number;
  initialBalanceCents: number;
  reminder24h: boolean;
  reminder1h: boolean;
  reminderDay: boolean;
  reminderDayTime: string;
  incomeCategories: string[];
  expenseCategories: string[];
  paymentMethods: string[];
  paymentInstructions: string;
  profileImage: string;
  coverImage: string;
  about: string;
  lockEnabled: boolean;
  showTour: boolean;
  demoMode: boolean;
  weekStartsOn: 0 | 1;
  dashboardShowFinance: boolean;
  lastBackupAt: string | null;
  workCatalogSeeded?: boolean;
  whatsappTemplates: WhatsAppTemplate[];
  whatsappDefaultDdi: string;
  dailyMood: DailyMood | null;
};

export type DataBundle = {
  tenant: {
    id: number;
    name: string;
    ownerName: string;
    email: string;
    plan: Plan;
    status: TenantStatus;
    expiresAt: string | null;
    startedAt: string;
    isDemo: boolean;
  };
  settings: TenantSettingsData;
  consulentes: Consulente[];
  methods: Method[];
  consultations: Consultation[];
  payments: Payment[];
  workCatalog: WorkCatalogItem[];
  spiritualWorks: SpiritualWork[];
  workPayments: WorkPayment[];
  transactions: Transaction[];
  goals: MonthlyGoal[];
};

export type DeveloperSettings = {
  planPrices: Record<Plan, number>;
  paymentInstructions: string;
  showcaseImages: string[];
  supportContact: string;
  autoBlockNotice: string;
};

export type SessionInfo =
  | { role: "developer"; developer: { id: number; name: string; email: string; settings: DeveloperSettings } }
  | {
      role: "tenant";
      tenant: {
        id: number;
        name: string;
        ownerName: string;
        email: string;
        plan: Plan;
        status: TenantStatus;
        expiresAt: string | null;
        isDemo: boolean;
      };
      locked: boolean;
    }
  | { role: null };

export type DevTenant = {
  id: number;
  name: string;
  ownerName: string;
  email: string;
  phone: string | null;
  plan: Plan;
  status: TenantStatus;
  priceCents: number;
  startedAt: string;
  expiresAt: string | null;
  notes: string | null;
  isDemo: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  daysLeft: number | null;
  consultationsCount: number;
  revenueCents: number;
};

export type DevData = {
  developer: { id: number; name: string; email: string; settings: DeveloperSettings };
  tenants: DevTenant[];
  licensePayments: {
    id: number;
    tenantId: number;
    tenantName: string;
    amountCents: number;
    plan: Plan;
    paidAt: string;
    reference: string | null;
    notes: string | null;
  }[];
  demoCredentials: { email: string; password: string } | null;
};
