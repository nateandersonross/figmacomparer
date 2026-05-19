import { NextResponse } from "next/server";
import { z } from "zod";
import { parseAdjustmentsInput } from "@/lib/capture/adjustments";
import { formatApiError } from "@/lib/form-storage";
import { runInspectionCapture } from "@/lib/inspect/run-capture";
import { parseFigmaUrl } from "@/lib/figma/client";

const adjustmentsSchema = z
  .object({
    hideSelectors: z.union([z.string(), z.array(z.string())]).optional(),
    siteCropTop: z.number().int().min(0).optional(),
    siteCropBottom: z.number().int().min(0).optional(),
  })
  .optional();

const bodySchema = z.object({
  figmaToken: z.string().min(1),
  figmaFileUrl: z.string().url().optional(),
  figmaFileKey: z.string().min(1).optional(),
  mobileFrameId: z.string().min(1),
  desktopFrameId: z.string().min(1),
  websiteUrl: z.string().url(),
  locale: z.string().optional(),
  acceptLanguage: z.string().optional(),
  timezoneId: z.string().optional(),
  mobileAdjustments: adjustmentsSchema,
  desktopAdjustments: adjustmentsSchema,
});

function formatZodError(error: z.ZodError): string {
  return formatApiError(error.flatten());
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }

    const data = parsed.data;
    let fileKey = data.figmaFileKey;

    if (data.figmaFileUrl) {
      const fromUrl = parseFigmaUrl(data.figmaFileUrl);
      if (!fromUrl?.fileKey) {
        return NextResponse.json({ error: "Invalid Figma file URL" }, { status: 400 });
      }
      fileKey = fromUrl.fileKey;
    }

    if (!fileKey) {
      return NextResponse.json(
        { error: "Provide figmaFileKey or figmaFileUrl" },
        { status: 400 }
      );
    }

    const session = await runInspectionCapture({
      figmaToken: data.figmaToken,
      figmaFileKey: fileKey,
      mobileFrameId: data.mobileFrameId,
      desktopFrameId: data.desktopFrameId,
      websiteUrl: data.websiteUrl,
      locale: data.locale,
      acceptLanguage: data.acceptLanguage,
      timezoneId: data.timezoneId,
      mobileAdjustments: parseAdjustmentsInput(data.mobileAdjustments),
      desktopAdjustments: parseAdjustmentsInput(data.desktopAdjustments),
    });

    return NextResponse.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Capture failed";
    console.error("[inspect]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
