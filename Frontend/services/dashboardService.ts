import { type DashboardMetrics } from "@/models/dashboard";
import { getToken } from "@/lib/auth";

export async function getDashboardMetrics(): Promise<DashboardMetrics | null> {
  const py = process.env.NEXT_PUBLIC_PY_API_URL;
  if (!py) return null;

  try {
    const url = new URL(`${py}/api/dashboard/metrics`);
    const token = getToken();
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: token ? ({ Authorization: `Bearer ${token}` } as HeadersInit) : undefined
    });
    if (res.status === 401) throw new Error("Não autenticado");
    if (!res.ok) return null;
    const data = await res.json();
    return {
      total_computers: Number(data.total_computers ?? 0),
      preventive_done_computers: Number(data.preventive_done_computers ?? 0),
      preventive_needed_computers: Number(data.preventive_needed_computers ?? 0),
      corrective_done_total: Number(data.corrective_done_total ?? 0),
      corrective_done_computers: Number(data.corrective_done_computers ?? 0),
      status_ok_computers: Number(data.status_ok_computers ?? 0),
      status_late_computers: Number(data.status_late_computers ?? 0),
      status_pending_computers: Number(data.status_pending_computers ?? 0),
      corrective_open_computers: Number(data.corrective_open_computers ?? 0)
    };
  } catch {
    return null;
  }
}
