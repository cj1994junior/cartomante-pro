import { db } from "@/db";
import { developers } from "@/db/schema";
import { getDeveloperSettings, DEFAULT_DEVELOPER_SETTINGS } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const [dev] = await db.select({ id: developers.id }).from(developers).limit(1);
  const settings = dev ? await getDeveloperSettings(dev.id) : DEFAULT_DEVELOPER_SETTINGS;
  return Response.json({
    paymentInstructions: settings.paymentInstructions,
    supportContact: settings.supportContact,
    autoBlockNotice: settings.autoBlockNotice,
    planPrices: settings.planPrices,
    showcaseImages: settings.showcaseImages,
  });
}
