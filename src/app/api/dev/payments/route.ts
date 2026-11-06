import { eq } from "drizzle-orm";
import { db } from "@/db";
import { licensePayments, tenants } from "@/db/schema";
import { asCents, asInt, fail, isISODate, readJson, requireDeveloper, str } from "@/lib/api";
import { resolveExpiry } from "@/lib/auth";
import { getDeveloperSettings } from "@/lib/settings";
import { addDaysISO, todayISO } from "@/lib/format";
import type { Plan } from "@/lib/types";

export const dynamic = "force-dynamic";

const PLANS: Plan[] = ["monthly", "annual", "lifetime"];

export async function POST(req: Request) {
  const auth = await requireDeveloper();
  if (auth.error) return auth.error;
  const body = await readJson(req);

  const tenantId = asInt(body.tenantId, 0);
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return fail("Selecione uma conta válida.", 404);

  const plan = (PLANS.includes(str(body.plan) as Plan) ? str(body.plan) : tenant.plan) as Plan;
  const devSettings = await getDeveloperSettings(auth.developer.id);
  const amountCents = body.amountCents !== undefined ? asCents(body.amountCents) : devSettings.planPrices[plan];
  if (amountCents <= 0) return fail("Informe o valor recebido.", 400);
  const paidAt = isISODate(body.paidAt) ? body.paidAt : todayISO();

  const { payment, renewed } = await db.transaction(async (tx) => {
    const [payment] = await tx
      .insert(licensePayments)
      .values({
        tenantId,
        amountCents,
        plan,
        paidAt,
        reference:
          str(body.reference, 200) ||
          (plan === "lifetime"
            ? "Licença vitalícia"
            : plan === "annual"
              ? "Licença anual"
              : "Mensalidade"),
        notes: str(body.notes, 500) || null,
      })
      .returning();

    let renewed = false;

    if (body.renew !== false) {
      
const startedAt = todayISO();

const renewalBase =
  plan !== "lifetime" &&
  tenant.plan === plan &&
  tenant.status === "active" &&
  tenant.expiresAt &&
  tenant.expiresAt > startedAt
    ? tenant.expiresAt
    : startedAt;

const expiresAt =
  plan === "lifetime" ? null : resolveExpiry(plan, renewalBase);


      await tx
        .update(tenants)
        .set({
          plan,
          status: "active",
          startedAt,
          expiresAt:
            plan === "lifetime"
              ? null
              : (expiresAt ?? addDaysISO(startedAt, 30)),
          priceCents: amountCents,
        })
        .where(eq(tenants.id, tenantId));

      renewed = true;
    }

    return { payment, renewed };
  });


  return Response.json({ ok: true, payment, renewed }, { status: 201 });
}

export async function DELETE(req: Request) {
  const auth = await requireDeveloper();
  if (auth.error) return auth.error;
  const body = await readJson(req);
  const id = asInt(body.id, 0);
  if (!id) return fail("Pagamento inválido.", 400);
  await db.delete(licensePayments).where(eq(licensePayments.id, id));
  return Response.json({ ok: true });
}
