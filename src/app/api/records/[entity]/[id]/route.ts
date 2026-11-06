import { asInt, fail, readJson, requireTenant } from "@/lib/api";
import { deleteRecord, isEntity, RecordError, updateRecord } from "@/lib/records";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ entity: string; id: string }> }) {
  const auth = await requireTenant();
  if (auth.error) return auth.error;
  const { entity, id } = await params;
  if (!isEntity(entity)) return fail("Tipo de registro inválido.", 404);
  const numericId = asInt(id, 0);
  if (!numericId) return fail("Registro inválido.", 400);
  const body = await readJson(req);
  try {
    const result = await updateRecord(auth.tenant.id, entity, numericId, body);
    return Response.json(result.data, { status: result.status });
  } catch (error) {
    if (error instanceof RecordError) return fail(error.message, error.status, error.extra);
    console.error("update record error", error);
    return fail("Não foi possível atualizar o registro.", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ entity: string; id: string }> }) {
  const auth = await requireTenant();
  if (auth.error) return auth.error;
  const { entity, id } = await params;
  if (!isEntity(entity)) return fail("Tipo de registro inválido.", 404);
  const numericId = asInt(id, 0);
  if (!numericId) return fail("Registro inválido.", 400);
  try {
    const result = await deleteRecord(auth.tenant.id, entity, numericId);
    return Response.json(result.data, { status: result.status });
  } catch (error) {
    if (error instanceof RecordError) return fail(error.message, error.status, error.extra);
    console.error("delete record error", error);
    return fail("Não foi possível excluir o registro.", 500);
  }
}
