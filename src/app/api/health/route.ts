import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    let seeded = false;
    try {
      const result = await ensureSeed();
      seeded = result.seeded;
    } catch (error) {
      console.error("seed error", error);
    }
    return Response.json({ ok: true, seeded });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
