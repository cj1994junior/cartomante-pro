
import { db } from "@/db";
import { developers } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { DEFAULT_DEVELOPER_SETTINGS } from "@/lib/settings";


export const DEV_EMAIL = process.env.DEV_EMAIL ?? "";
export const DEV_PASSWORD = process.env.DEV_PASSWORD ?? "";




export async function ensureSeed(): Promise<{ seeded: boolean }> {
  const existingDevs = await db
    .select({ id: developers.id })
    .from(developers)
    .limit(1);

  if (existingDevs.length > 0) {
    return { seeded: false };
  }

  const email = process.env.DEV_EMAIL;
  const password = process.env.DEV_PASSWORD;

  if (!email || !password) {
    throw new Error("Configure DEV_EMAIL e DEV_PASSWORD no .env.local");
  }

  await db.insert(developers).values({
    name: "Desenvolvedor Cartomante Pro",
    email: email.trim().toLowerCase(),
    passwordHash: hashPassword(password),
    settings: DEFAULT_DEVELOPER_SETTINGS as unknown as Record<string, unknown>,
  });

  return { seeded: true };
}
  