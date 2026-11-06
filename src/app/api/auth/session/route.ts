import { currentDeveloper, currentTenant, subscriptionState } from "@/lib/auth";
import { getDeveloperSettings, hasPin } from "@/lib/settings";
import type { Plan, SessionInfo, TenantStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const dev = await currentDeveloper();
  if (dev) {
    const info: SessionInfo = {
      role: "developer",
      developer: { id: dev.id, name: dev.name, email: dev.email, settings: await getDeveloperSettings(dev.id) },
    };
    return Response.json(info);
  }
  const tenant = await currentTenant();
  if (tenant) {
    const state = subscriptionState(tenant);
    const info: SessionInfo = {
      role: "tenant",
      tenant: {
        id: tenant.id,
        name: tenant.name,
        ownerName: tenant.ownerName,
        email: tenant.email,
        plan: tenant.plan as Plan,
        status: state.status as TenantStatus,
        expiresAt: state.expiresAt,
        isDemo: tenant.isDemo,
      },
      locked: await hasPin(tenant.id),
    };
    return Response.json(info);
  }
  const info: SessionInfo = { role: null };
  return Response.json(info);
}
