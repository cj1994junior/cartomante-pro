import { fail, readJson, requireTenant } from "@/lib/api";
import { createRecord, isEntity, RecordError } from "@/lib/records";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const auth = await requireTenant();
  if (auth.error) return auth.error;
  const { entity } = await params;
  if (!isEntity(entity)) return fail("Tipo de registro inválido.", 404);
  const body = await readJson(req);
  try {
    const result = await createRecord(auth.tenant.id, entity, body);
    return Response.json(result.data, { status: result.status });
  } catch (error) {
    if (error instanceof RecordError) return fail(error.message, error.status, error.extra);
    console.error("create record error", error);
    return fail("Não foi possível salvar o registro. Verifique os dados e tente novamente.", 500);
  }
}
