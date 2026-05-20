import { NextResponse } from "next/server";
import { deleteIssue, setIssueResolved } from "@/lib/db/issues";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteIssue(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete issue";
    console.error("[issues:delete]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (typeof body.resolved !== "boolean") {
      return NextResponse.json({ error: "resolved (boolean) required" }, { status: 400 });
    }
    await setIssueResolved(id, body.resolved);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update issue";
    console.error("[issues:patch]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
