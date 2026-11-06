import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenantSettings } from "@/db/schema";
import { asBool, asCents, fail, isISODate, optionalImageStr, readJson, requireTenant, str } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getTenantSettings, saveTenantSettings } from "@/lib/settings";
import { PALETTES } from "@/lib/palettes";
import { CURRENCIES } from "@/lib/format";
import { WHATSAPP_CATEGORY_LABELS } from "@/lib/whatsapp";
import { isMood } from "@/lib/moods";
import type { TenantSettingsData, WhatsAppTemplate, WhatsAppTemplateCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireTenant();
  if (auth.error) return auth.error;
  return Response.json(await getTenantSettings(auth.tenant.id));
}

export async function PATCH(req: Request) {
  const auth = await requireTenant();
  if (auth.error) return auth.error;
  const tenantId = auth.tenant.id;
  const body = await readJson(req);
  const current = await getTenantSettings(tenantId);
  const patch: Partial<TenantSettingsData> = {};

  if (body.professionalName !== undefined) patch.professionalName = str(body.professionalName, 120);
  if (body.appName !== undefined) patch.appName = str(body.appName, 60) || "Cartomante Pro";
  if (body.currency !== undefined) {
    const currency = str(body.currency, 3) as keyof typeof CURRENCIES;
    if (!CURRENCIES[currency]) return fail("Moeda inválida. Escolha BRL, EUR ou USD.", 400);
    patch.currency = currency;
  }
  if (body.palette !== undefined) {
    if (!PALETTES.some((p) => p.id === body.palette)) return fail("Paleta inválida.", 400);
    patch.palette = body.palette as string;
  }
  if (body.monthlyGoalCents !== undefined) patch.monthlyGoalCents = asCents(body.monthlyGoalCents);
  if (body.initialBalanceCents !== undefined) patch.initialBalanceCents = asCents(body.initialBalanceCents);
  for (const key of ["reminder24h", "reminder1h", "reminderDay", "dashboardShowFinance", "showTour"] as const) {
    if (body[key] !== undefined) patch[key] = asBool(body[key], current[key] as boolean);
  }
  if (body.reminderDayTime !== undefined) {
    const time = str(body.reminderDayTime, 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return fail("Horário do lembrete inválido.", 400);
    patch.reminderDayTime = time;
  }
  for (const key of ["incomeCategories", "expenseCategories", "paymentMethods"] as const) {
    if (Array.isArray(body[key])) {
      const list = (body[key] as unknown[])
        .map((item) => str(item, 80))
        .filter(Boolean)
        .slice(0, 30);
      patch[key] = list.length ? list : current[key];
    }
  }
  if (body.paymentInstructions !== undefined) patch.paymentInstructions = str(body.paymentInstructions, 600);
  if (body.profileImage !== undefined) patch.profileImage = optionalImageStr(body.profileImage) ?? "";
  if (body.coverImage !== undefined) patch.coverImage = optionalImageStr(body.coverImage) ?? "";
  if (body.about !== undefined) patch.about = str(body.about, 1000);
  if (body.lastBackupAt !== undefined) patch.lastBackupAt = str(body.lastBackupAt, 40) || null;
  if (body.dailyMood !== undefined) {
    if (body.dailyMood === null) {
      patch.dailyMood = null;
    } else if (typeof body.dailyMood === "object" && !Array.isArray(body.dailyMood)) {
      const entry = body.dailyMood as Record<string, unknown>;
      if (!isISODate(entry.date) || !isMood(entry.mood)) {
        return fail("Selecione uma opção de humor e uma data válidas.", 400);
      }
      patch.dailyMood = { date: entry.date, mood: entry.mood };
    } else {
      return fail("O registro de humor é inválido.", 400);
    }
  }
  if (body.weekStartsOn !== undefined) patch.weekStartsOn = asBool(body.weekStartsOn === 1 || body.weekStartsOn === "1") ? 1 : 0;
  if (body.whatsappDefaultDdi !== undefined) {
    const ddi = str(body.whatsappDefaultDdi, 6).replace(/\D/g, "") || "55";
    patch.whatsappDefaultDdi = ddi;
  }
  if (Array.isArray(body.whatsappTemplates)) {
    const validCategories = Object.keys(WHATSAPP_CATEGORY_LABELS) as WhatsAppTemplateCategory[];
    const cleaned: WhatsAppTemplate[] = (body.whatsappTemplates as unknown[])
      .map((item, idx) => {
        if (typeof item !== "object" || item === null) return null;
        const raw = item as Record<string, unknown>;
        const title = str(raw.title, 100);
        const messageBody = str(raw.body, 2000);
        if (!title || !messageBody) return null;
        const catRaw = str(raw.category, 30) as WhatsAppTemplateCategory;
        const category = validCategories.includes(catRaw) ? catRaw : "geral";
        const id = str(raw.id, 60) || `tpl_${Date.now()}_${idx}`;
        return { id, title, category, body: messageBody };
      })
      .filter((t): t is WhatsAppTemplate => t !== null)
      .slice(0, 40);
    if (!cleaned.length) return fail("Mantenha ao menos uma mensagem pré-programada cadastrada.", 400);
    patch.whatsappTemplates = cleaned;
  }

  const extra: { pinHash?: string | null } = {};
  if (body.pin !== undefined && body.pin !== null && body.pin !== "") {
    const pin = str(body.pin, 12);
    if (!/^\d{4,8}$/.test(pin)) return fail("A senha de bloqueio deve ter de 4 a 8 dígitos.", 400);
    extra.pinHash = hashPassword(pin);
    patch.lockEnabled = true;
  } else if (body.lockEnabled !== undefined && !asBool(body.lockEnabled)) {
    patch.lockEnabled = false;
    extra.pinHash = null;
  } else if (body.lockEnabled !== undefined) {
    patch.lockEnabled = asBool(body.lockEnabled);
    if (patch.lockEnabled && !body.pin) {
      const [row] = await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1);
      const existing = (row?.data ?? {}) as { pinHash?: string };
      if (!existing.pinHash) return fail("Defina uma senha numérica de 4 a 8 dígitos para ativar o bloqueio.", 400);
    }
  }

  const saved = await saveTenantSettings(tenantId, { ...patch, ...extra });
  return Response.json({ settings: saved });
}

export async function POST(req: Request) {
  const auth = await requireTenant();
  if (auth.error) return auth.error;
  const tenantId = auth.tenant.id;
  const body = await readJson(req);
  const action = str(body.action, 40);

  if (action === "verify-pin") {
    const [row] = await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1);
    const data = (row?.data ?? {}) as { pinHash?: string };
    if (!data.pinHash) return Response.json({ ok: true });
    if (verifyPassword(str(body.pin, 12), data.pinHash)) return Response.json({ ok: true });
    return fail("Senha de bloqueio incorreta.", 401);
  }

  return fail("Ação inválida.", 400);
}
