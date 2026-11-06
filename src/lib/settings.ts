import { eq } from "drizzle-orm";
import { db } from "@/db";
import { developers, tenantSettings } from "@/db/schema";
import { PALETTES } from "@/lib/palettes";
import { DEFAULT_WHATSAPP_TEMPLATES } from "@/lib/whatsapp";
import type { DeveloperSettings, TenantSettingsData } from "@/lib/types";

const defaultPalette = PALETTES.find((p) => p.name === "Ametista & Ouro")?.id ?? PALETTES[0].id;

export const DEFAULT_TENANT_SETTINGS: TenantSettingsData = {
  professionalName: "",
  appName: "Cartomante Pro",
  currency: "BRL",
  palette: defaultPalette,
  monthlyGoalCents: 0,
  initialBalanceCents: 0,
  reminder24h: true,
  reminder1h: true,
  reminderDay: true,
  reminderDayTime: "08:00",
  incomeCategories: ["Consultas", "Vendas", "Outros"],
  expenseCategories: ["Materiais de trabalho", "Divulgação", "Internet e telefone", "Transporte", "Outros"],
  paymentMethods: ["Pix", "Dinheiro", "Cartão de débito", "Cartão de crédito", "Transferência", "Outro"],
  paymentInstructions: "Pix: cartomante@exemplo.com — envie o comprovante para confirmar o horário.",
  profileImage: "/images/tarot-hero.jpg",
  coverImage: "/images/tarot-hero.jpg",
  about: "",
  lockEnabled: false,
  showTour: true,
  demoMode: false,
  weekStartsOn: 1,
  dashboardShowFinance: true,
  lastBackupAt: null,
  whatsappTemplates: DEFAULT_WHATSAPP_TEMPLATES,
  whatsappDefaultDdi: "55",
  dailyMood: null,
};

export async function getTenantSettings(tenantId: number): Promise<TenantSettingsData> {
  const [row] = await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1);
  if (!row) return { ...DEFAULT_TENANT_SETTINGS };
  const data = row.data as Partial<TenantSettingsData> & { pinHash?: string };
  return {
    ...DEFAULT_TENANT_SETTINGS,
    ...data,
    whatsappTemplates:
      Array.isArray(data.whatsappTemplates) && data.whatsappTemplates.length
        ? data.whatsappTemplates
        : DEFAULT_WHATSAPP_TEMPLATES,
    whatsappDefaultDdi: data.whatsappDefaultDdi || "55",
  };
}

export async function saveTenantSettings(
  tenantId: number,
  patch: Partial<TenantSettingsData> & { pinHash?: string | null },
): Promise<TenantSettingsData> {
  const current = await getTenantSettings(tenantId);
  const raw = { ...current, ...patch } as Record<string, unknown>;
  if (patch.pinHash === null) delete raw.pinHash;
  else if (patch.pinHash) raw.pinHash = patch.pinHash;
  await db
    .insert(tenantSettings)
    .values({ tenantId, data: raw, updatedAt: new Date() })
    .onConflictDoUpdate({ target: tenantSettings.tenantId, set: { data: raw, updatedAt: new Date() } });
  return raw as unknown as TenantSettingsData;
}

export async function hasPin(tenantId: number): Promise<boolean> {
  const [row] = await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1);
  const data = (row?.data ?? {}) as { pinHash?: string };
  return Boolean(data.pinHash);
}

export const DEFAULT_DEVELOPER_SETTINGS: DeveloperSettings = {
  planPrices: { monthly: 7990, annual: 74900, lifetime: 149700 },
  paymentInstructions: "Pix da conta: dev@cartomantepro.app — após o pagamento, ative a licença no painel.",
  showcaseImages: ["/images/tarot-hero.jpg", "/images/tarot-cards.jpg", "/images/tarot-crystal.jpg"],
  supportContact: "suporte@cartomantepro.app",
  autoBlockNotice:
    "Seu acesso mensal venceu. Para liberar novamente o painel, realize o pagamento e fale com o suporte para renovar a licença.",
};

export async function getDeveloperSettings(developerId: number): Promise<DeveloperSettings> {
  const [dev] = await db.select().from(developers).where(eq(developers.id, developerId)).limit(1);
  const data = (dev?.settings ?? {}) as Partial<DeveloperSettings>;
  return {
    ...DEFAULT_DEVELOPER_SETTINGS,
    ...data,
    planPrices: { ...DEFAULT_DEVELOPER_SETTINGS.planPrices, ...(data.planPrices ?? {}) },
    showcaseImages: data.showcaseImages?.length ? data.showcaseImages : DEFAULT_DEVELOPER_SETTINGS.showcaseImages,
  };
}

export async function saveDeveloperSettings(developerId: number, patch: Partial<DeveloperSettings>) {
  const current = await getDeveloperSettings(developerId);
  const merged: DeveloperSettings = {
    ...current,
    ...patch,
    planPrices: { ...current.planPrices, ...(patch.planPrices ?? {}) },
  };
  await db.update(developers).set({ settings: merged as unknown as Record<string, unknown> }).where(eq(developers.id, developerId));
  return merged;
}
