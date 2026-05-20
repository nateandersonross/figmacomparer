import { NextResponse } from "next/server";
import { z } from "zod";
import { getIssuesForUrl, upsertIssue } from "@/lib/db/issues";
import { isDbConfigured } from "@/lib/db/mysql";

const anchorSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const issueSchema = z.object({
  id: z.string().min(1).max(64),
  createdAt: z.string(),
  breakpointWidth: z.number().int(),
  breakpointLabel: z.string(),
  elementId: z.string(),
  elementLabel: z.string(),
  elementKind: z.enum(["section", "image", "text", "element"]),
  category: z.enum(["spacing", "typography", "image", "layout", "other"]),
  property: z.string(),
  expected: z.string(),
  actual: z.string(),
  notes: z.string(),
  anchor: anchorSchema,
});

const postSchema = z.object({
  websiteUrl: z.string().url(),
  sessionId: z.string().nullable().optional(),
  issue: issueSchema,
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
  try {
    const issues = await getIssuesForUrl(url);
    return NextResponse.json({ issues, dbConfigured: isDbConfigured() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load issues";
    console.error("[issues:get]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = postSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }
    await upsertIssue(parsed.data.websiteUrl, parsed.data.sessionId ?? null, parsed.data.issue);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save issue";
    console.error("[issues:post]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
