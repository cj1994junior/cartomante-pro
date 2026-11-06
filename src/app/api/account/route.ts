import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  backups,
  consultations,
  consulentes,
  methods,
  monthlyGoals,
  payments,
  spiritualWorks,
  tenantSettings,
  transactions,
  workCatalog,
  workPayments,
} from "@/db/schema";
import { fail, readJson, requireTenant, str } from "@/lib/api";
import { DEFAULT_TENANT_SETTINGS } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireTenant();
  if (auth.error) return auth.error;
  const tenantId = auth.tenant.id;
  const body = await readJson(req);
  const action = str(body.action, 40);

  if (action === "wipe") {
    if (str(body.confirmation).toUpperCase() !== "EXCLUIR") {
      return fail('Digite EXCLUIR para confirmar a remoção de todos os dados.', 400);
    }
    await db.transaction(async (tx) => {
      await tx.delete(transactions).where(eq(transactions.tenantId, tenantId));
      await tx.delete(workPayments).where(eq(workPayments.tenantId, tenantId));
      await tx.delete(spiritualWorks).where(eq(spiritualWorks.tenantId, tenantId));
      await tx.delete(workCatalog).where(eq(workCatalog.tenantId, tenantId));
      await tx.delete(payments).where(eq(payments.tenantId, tenantId));
      await tx.delete(consultations).where(eq(consultations.tenantId, tenantId));
      await tx.delete(methods).where(eq(methods.tenantId, tenantId));
      await tx.delete(consulentes).where(eq(consulentes.tenantId, tenantId));
      await tx.delete(monthlyGoals).where(eq(monthlyGoals.tenantId, tenantId));
      await tx.delete(backups).where(eq(backups.tenantId, tenantId));
      await tx.delete(auditLog).where(eq(auditLog.tenantId, tenantId));
      await tx.delete(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
    });
    await db.insert(tenantSettings).values({ tenantId, data: { ...DEFAULT_TENANT_SETTINGS } });
    return Response.json({ ok: true, message: "Todos os dados foram excluídos deste dispositivo/conta." });
  }

  if (action === "demo-wipe") {
    return fail("Use a ação de excluir dados com confirmação.", 400);
  }

  return fail("Ação inválida.", 400);
}
