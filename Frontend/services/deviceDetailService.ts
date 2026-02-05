import type {
  DeviceComponent,
  DeviceDetail,
  DeviceMaintenance,
  DeviceNote
} from "@/models/device";

import { getToken } from "@/lib/auth";

function getBaseUrl() {
  const py = process.env.NEXT_PUBLIC_PY_API_URL;
  if (!py) throw new Error("NEXT_PUBLIC_PY_API_URL não configurada");
  return py;
}

function authHeaders() {
  const token = getToken();
  if (!token) return {} as HeadersInit;
  return { Authorization: `Bearer ${token}` } as HeadersInit;
}

export async function getDeviceDetail(deviceId: string): Promise<DeviceDetail> {
  const url = `${getBaseUrl()}/api/devices/${encodeURIComponent(deviceId)}`;
  const res = await fetch(url, { cache: "no-store", headers: authHeaders() });
  if (res.status === 401) throw new Error("Não autenticado. Faça login para acessar o dispositivo.");
  if (!res.ok) throw new Error(`Falha ao carregar device: ${res.status}`);
  return res.json();
}

export async function getDeviceComponents(deviceId: string): Promise<DeviceComponent[]> {
  const url = `${getBaseUrl()}/api/devices/${encodeURIComponent(deviceId)}/components`;
  const res = await fetch(url, { cache: "no-store", headers: authHeaders() });
  if (res.status === 401) throw new Error("Não autenticado. Faça login para ver componentes.");
  if (!res.ok) throw new Error(`Falha ao carregar componentes: ${res.status}`);
  return res.json();
}

export async function getDeviceNotes(deviceId: string): Promise<DeviceNote[]> {
  const url = `${getBaseUrl()}/api/devices/${encodeURIComponent(deviceId)}/notes`;
  const res = await fetch(url, { cache: "no-store", headers: authHeaders() });
  if (res.status === 401) throw new Error("Não autenticado. Faça login para ver notas.");
  if (!res.ok) throw new Error(`Falha ao carregar notas: ${res.status}`);
  return res.json();
}

export async function createDeviceNote(deviceId: string, payload: { author: string; content: string }) {
  const url = `${getBaseUrl()}/api/devices/${encodeURIComponent(deviceId)}/notes`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authHeaders() as any) },
    body: JSON.stringify(payload)
  });
  if (res.status === 401) throw new Error("Não autenticado. Faça login para criar notas.");
  if (!res.ok) throw new Error(`Falha ao criar nota: ${res.status}`);
  return res.json() as Promise<DeviceNote>;
}

export async function updateDeviceNote(
  deviceId: string,
  noteId: number,
  payload: { author?: string; content?: string }
) {
  const url = `${getBaseUrl()}/api/devices/${encodeURIComponent(deviceId)}/notes/${noteId}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(authHeaders() as any) },
    body: JSON.stringify(payload)
  });
  if (res.status === 401) throw new Error("Não autenticado. Faça login para editar notas.");
  if (!res.ok) throw new Error(`Falha ao atualizar nota: ${res.status}`);
  return res.json() as Promise<DeviceNote>;
}

export async function deleteDeviceNote(deviceId: string, noteId: number) {
  const url = `${getBaseUrl()}/api/devices/${encodeURIComponent(deviceId)}/notes/${noteId}`;
  const res = await fetch(url, { method: "DELETE", headers: authHeaders() });
  if (res.status === 401) throw new Error("Não autenticado. Faça login para remover notas.");
  if (!res.ok) throw new Error(`Falha ao deletar nota: ${res.status}`);
}

export async function getDeviceMaintenance(deviceId: string): Promise<DeviceMaintenance[]> {
  const url = `${getBaseUrl()}/api/devices/${encodeURIComponent(deviceId)}/maintenance`;
  const res = await fetch(url, { cache: "no-store", headers: authHeaders() });
  if (res.status === 401) throw new Error("Não autenticado. Faça login para ver manutenções.");
  if (!res.ok) throw new Error(`Falha ao carregar manutenções: ${res.status}`);
  return res.json();
}

export async function createMaintenance(payload: {
  computer_id: number;
  maintenance_type: "Preventiva" | "Corretiva";
  description: string;
  performed_at: string; // ISO
  technician?: string;
  next_due_days?: number | null;
}) {
  const url = `${getBaseUrl()}/api/maintenance`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authHeaders() as any) },
    body: JSON.stringify(payload)
  });
  if (res.status === 401) throw new Error("Não autenticado. Faça login para criar manutenção.");
  if (!res.ok) throw new Error(`Falha ao criar manutenção: ${res.status}`);
  return res.json() as Promise<DeviceMaintenance>;
}

export async function updateMaintenance(
  maintenanceId: number,
  payload: {
    maintenance_type?: "Preventiva" | "Corretiva";
    description?: string;
    performed_at?: string;
    technician?: string;
    next_due_days?: number | null;
  }
) {
  const url = `${getBaseUrl()}/api/maintenance/${maintenanceId}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(authHeaders() as any) },
    body: JSON.stringify(payload)
  });
  if (res.status === 401) throw new Error("Não autenticado. Faça login para atualizar manutenção.");
  if (!res.ok) throw new Error(`Falha ao atualizar manutenção: ${res.status}`);
  return res.json() as Promise<DeviceMaintenance>;
}

export async function deleteMaintenance(maintenanceId: number) {
  const url = `${getBaseUrl()}/api/maintenance/${maintenanceId}`;
  const res = await fetch(url, { method: "DELETE", headers: authHeaders() });
  if (res.status === 401) throw new Error("Não autenticado. Faça login para deletar manutenção.");
  if (!res.ok) throw new Error(`Falha ao deletar manutenção: ${res.status}`);
}
