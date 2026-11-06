import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { consultations } from "@/db/schema";
import { asInt, fail, logAudit, readJson, requireTenant, str } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTenant();
  if (auth.error) return auth.error;
  const tenantId = auth.tenant.id;
  const { id } = await params;
  const consultationId = asInt(id, 0);
  if (!consultationId) return fail("Consulta inválida.", 400);

  const [current] = await db
    .select()
    .from(consultations)
    .where(and(eq(consultations.id, consultationId), eq(consultations.tenantId, tenantId)))
    .limit(1);

  if (!current) return fail("Consulta não encontrada.", 404);
  if (current.status === "cancelada") {
    return fail("Não é possível iniciar o cronômetro de uma consulta cancelada.", 400);
  }

  const body = await readJson(req);
  const action = str(body.action, 24);
  const now = new Date();

  if (action === "start") {
    if (current.timerStartedAt) {
      return Response.json({ ok: true, consultation: current });
    }
    // Pausa automaticamente outro cronômetro em aberto na mesma conta para evitar contagem duplicada de horas
    const runningOthers = await db
      .select()
      .from(consultations)
      .where(
        and(
          eq(consultations.tenantId, tenantId),
          isNotNull(consultations.timerStartedAt),
          ne(consultations.id, consultationId),
        ),
      );
    for (const other of runningOthers) {
      if (!other.timerStartedAt) continue;
      const elapsed = Math.max(0, Math.floor((now.getTime() - other.timerStartedAt.getTime()) / 1000));
      await db
        .update(consultations)
        .set({
          actualSeconds: other.actualSeconds + elapsed,
          timerStartedAt: null,
          updatedAt: now,
        })
        .where(eq(consultations.id, other.id));
    }

    const [updated] = await db
      .update(consultations)
      .set({
        timerStartedAt: now,
        status: current.status === "realizada" ? "em_atendimento" : "em_atendimento",
        updatedAt: now,
      })
      .where(and(eq(consultations.id, consultationId), eq(consultations.tenantId, tenantId)))
      .returning();

    await logAudit(tenantId, "iniciar_cronometro", "consulta", consultationId);
    return Response.json({ ok: true, consultation: updated });
  }

  if (action === "pause") {
    if (!current.timerStartedAt) {
      return Response.json({ ok: true, consultation: current });
    }
    const elapsed = Math.max(0, Math.floor((now.getTime() - current.timerStartedAt.getTime()) / 1000));
    const [updated] = await db
      .update(consultations)
      .set({
        actualSeconds: current.actualSeconds + elapsed,
        timerStartedAt: null,
        updatedAt: now,
      })
      .where(and(eq(consultations.id, consultationId), eq(consultations.tenantId, tenantId)))
      .returning();

    await logAudit(tenantId, "pausar_cronometro", "consulta", consultationId, { actualSeconds: updated.actualSeconds });
    return Response.json({ ok: true, consultation: updated });
  }

  if (action === "finish") {
    const runningElapsed = current.timerStartedAt
      ? Math.max(1, Math.floor((now.getTime() - current.timerStartedAt.getTime()) / 1000))
      : 0;
    const totalSeconds = Math.max(current.actualSeconds + runningElapsed, current.actualSeconds > 0 ? current.actualSeconds : 1);

    const [updated] = await db
      .update(consultations)
      .set({
        actualSeconds: totalSeconds,
        timerStartedAt: null,
        timerEndedAt: now,
        status: "realizada",
        updatedAt: now,
      })
      .where(and(eq(consultations.id, consultationId), eq(consultations.tenantId, tenantId)))
      .returning();

    await logAudit(tenantId, "finalizar_cronometro", "consulta", consultationId, { actualSeconds: totalSeconds });
    return Response.json({ ok: true, consultation: updated, actualSeconds: totalSeconds });
  }

  if (action === "reset") {
    const nextStatus = current.status === "em_atendimento" ? "confirmada" : current.status;
    const [updated] = await db
      .update(consultations)
      .set({
        actualSeconds: 0,
        timerStartedAt: null,
        timerEndedAt: null,
        status: nextStatus,
        updatedAt: now,
      })
      .where(and(eq(consultations.id, consultationId), eq(consultations.tenantId, tenantId)))
      .returning();

    await logAudit(tenantId, "zerar_cronometro", "consulta", consultationId);
    return Response.json({ ok: true, consultation: updated });
  }

  if (action === "set_manual") {
    const seconds = Math.max(0, Math.min(86400, asInt(body.actualSeconds, 0)));
    const [updated] = await db
      .update(consultations)
      .set({
        actualSeconds: seconds,
        updatedAt: now,
      })
      .where(and(eq(consultations.id, consultationId), eq(consultations.tenantId, tenantId)))
      .returning();
    await logAudit(tenantId, "ajustar_tempo", "consulta", consultationId, { actualSeconds: seconds });
    return Response.json({ ok: true, consultation: updated });
  }

  return fail("Ação de cronômetro inválida.", 400);
}
