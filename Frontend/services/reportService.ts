import { type MaintenanceReportQuery, type MaintenanceReportResponse } from "@/models/report";
import { getToken } from "@/lib/auth";

export async function getMaintenanceReport(
  query: MaintenanceReportQuery
): Promise<MaintenanceReportResponse | null> {
  const py = process.env.NEXT_PUBLIC_PY_API_URL;
  if (!py) return null;

  try {
    const url = new URL(`${py}/api/reports/maintenance`);
    if (query.from) url.searchParams.set("from", query.from);
    if (query.to) url.searchParams.set("to", query.to);
    if (query.maintenance_type && query.maintenance_type !== "Ambas") {
      url.searchParams.set("maintenance_type", query.maintenance_type);
    }

    const token = getToken();
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: token ? ({ Authorization: `Bearer ${token}` } as HeadersInit) : undefined
    });
    if (res.status === 401) throw new Error("Não autenticado");
    if (!res.ok) return null;
    const data = await res.json();
    return {
      total: Number(data.total ?? 0),
      items: Array.isArray(data.items)
        ? data.items.map((it: any) => ({
            computer_id: Number(it.computer_id),
            computer_name: String(it.computer_name ?? ""),
            patrimonio: it.patrimonio != null ? String(it.patrimonio) : null,
            technician: it.technician != null ? String(it.technician) : null,
            maintenance_type: it.maintenance_type === "Corretiva" ? "Corretiva" : "Preventiva",
            performed_at: String(it.performed_at),
          }))
        : [],
    };
  } catch {
    return null;
  }
}
