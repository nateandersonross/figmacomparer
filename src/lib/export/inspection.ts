import type { InspectionSession } from "@/lib/types/inspect";

export function downloadInspectionJson(session: InspectionSession): void {
  const payload = {
    ...session,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `figma-inspection-${session.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
