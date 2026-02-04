"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import type { DeviceComponent, DeviceDetail, DeviceMaintenance, DeviceNote } from "@/models/device";
import {
  createDeviceNote,
  createMaintenance,
  deleteDeviceNote,
  deleteMaintenance,
  getDeviceComponents,
  getDeviceDetail,
  getDeviceMaintenance,
  getDeviceNotes,
  updateDeviceNote
} from "@/services/deviceDetailService";

function fmtDate(s?: string | null) {
  if (!s) return "—";
  return String(s).slice(0, 10);
}

function statusVariant(status?: string | null) {
  if (status === "Em Dia") return "ok";
  if (status === "Atrasada") return "late";
  if (status === "Pendente") return "pending";
  return "neutral";
}

export function DeviceDetailClient({ deviceId }: { deviceId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [components, setComponents] = useState<DeviceComponent[]>([]);
  const [notes, setNotes] = useState<DeviceNote[]>([]);
  const [maintenance, setMaintenance] = useState<DeviceMaintenance[]>([]);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteAuthor, setNoteAuthor] = useState("Sistema");
  const [noteContent, setNoteContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [maintOpen, setMaintOpen] = useState(false);
  const [maintType, setMaintType] = useState<"Preventiva" | "Corretiva">("Preventiva");
  const [maintDescription, setMaintDescription] = useState("");
  const [maintPerformedAt, setMaintPerformedAt] = useState("");
  const [maintNextDays, setMaintNextDays] = useState(365);
  const [maintTech, setMaintTech] = useState("");
  const [savingMaint, setSavingMaint] = useState(false);

  const maintenanceStatus = useMemo(() => {
    if (!device) return "Pendente";
    const next = device.next_maintenance ? new Date(device.next_maintenance) : null;
    if (!next) return "Pendente";
    return new Date() > next ? "Atrasada" : "Em Dia";
  }, [device]);

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      const [d, c, n, m] = await Promise.all([
        getDeviceDetail(deviceId),
        getDeviceComponents(deviceId),
        getDeviceNotes(deviceId),
        getDeviceMaintenance(deviceId)
      ]);
      setDevice(d);
      setComponents(c);
      setNotes(n);
      setMaintenance(m);
    } catch (e: any) {
      setError(e?.message ?? "Falha ao carregar dados");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  async function onCreateNote() {
    if (!noteContent.trim()) return;
    setSavingNote(true);
    try {
      await createDeviceNote(deviceId, { author: noteAuthor || "Sistema", content: noteContent });
      setNoteOpen(false);
      setNoteContent("");
      await refreshAll();
    } catch (e: any) {
      setError(e?.message ?? "Falha ao salvar nota");
    } finally {
      setSavingNote(false);
    }
  }

  async function onDeleteNote(noteId: number) {
    if (!confirm("Remover esta nota?")) return;
    try {
      await deleteDeviceNote(deviceId, noteId);
      await refreshAll();
    } catch (e: any) {
      setError(e?.message ?? "Falha ao deletar nota");
    }
  }

  async function onEditNote(note: DeviceNote) {
    const next = prompt("Editar nota:", note.content);
    if (next == null) return;
    try {
      await updateDeviceNote(deviceId, note.id, { content: next });
      await refreshAll();
    } catch (e: any) {
      setError(e?.message ?? "Falha ao atualizar nota");
    }
  }

  async function onCreateMaintenance() {
    if (!device) return;
    if (!maintDescription.trim()) return;
    if (!maintPerformedAt) return;

    setSavingMaint(true);
    try {
      await createMaintenance({
        computer_id: Number(device.id),
        maintenance_type: maintType,
        description: maintDescription,
        performed_at: new Date(maintPerformedAt).toISOString(),
        technician: maintTech || undefined,
        next_due_days: maintType === "Preventiva" ? maintNextDays : null
      });
      setMaintOpen(false);
      setMaintDescription("");
      setMaintPerformedAt("");
      setMaintTech("");
      await refreshAll();
    } catch (e: any) {
      setError(e?.message ?? "Falha ao criar manutenção");
    } finally {
      setSavingMaint(false);
    }
  }

  async function onDeleteMaintenance(id: number) {
    if (!confirm("Remover este registro de manutenção?")) return;
    try {
      await deleteMaintenance(id);
      await refreshAll();
    } catch (e: any) {
      setError(e?.message ?? "Falha ao deletar manutenção");
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Erro: {error}
      </div>
    );
  }

  if (!device) {
    return <p className="text-sm text-muted-foreground">Dispositivo não encontrado.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white shadow-lg">
        <div className="border-b border-gray-200 p-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Nome</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{device.name}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Serial</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{device.serial ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Localização</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{device.location ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</p>
              <Badge variant={statusVariant(maintenanceStatus) as any} className="mt-1">
                {maintenanceStatus}
              </Badge>
            </div>
          </div>
        </div>

        <div className="p-6">
          <Tabs defaultValue="components" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="components">Componentes</TabsTrigger>
              <TabsTrigger value="notes">Notas</TabsTrigger>
              <TabsTrigger value="maintenance">Histórico</TabsTrigger>
            </TabsList>

            <TabsContent value="components" className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Serial</TableHead>
                    <TableHead>Capacidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {components.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.component_type}</TableCell>
                      <TableCell>{c.name ?? "—"}</TableCell>
                      <TableCell>{c.model ?? "—"}</TableCell>
                      <TableCell>{c.serial ?? "—"}</TableCell>
                      <TableCell>{c.capacity ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                  {components.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-10">
                        Sem componentes importados ainda. Rode o sync.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="notes" className="space-y-4">
              <div className="flex justify-end">
                <Button variant="primary" type="button" onClick={() => setNoteOpen(true)}>
                  Adicionar Nota
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Autor</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Conteúdo</TableHead>
                    <TableHead style={{ width: 180 }}>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notes.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell>{n.author}</TableCell>
                      <TableCell>{fmtDate(n.created_at)}</TableCell>
                      <TableCell className="whitespace-pre-wrap">{n.content}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" type="button" onClick={() => onEditNote(n)}>
                            Editar
                          </Button>
                          <Button variant="destructive" type="button" onClick={() => onDeleteNote(n.id)}>
                            Remover
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {notes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-10">
                        Sem notas ainda.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>

              <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
                <DialogContent className="sm:max-w-[600px]">
                  <DialogHeader>
                    <DialogTitle>Adicionar Nota</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-2">
                    <div>
                      <label className="text-sm font-semibold">Autor</label>
                      <div className="mt-2">
                        <Input value={noteAuthor} onChange={(e) => setNoteAuthor(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-semibold">Conteúdo</label>
                      <div className="mt-2">
                        <Textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} className="min-h-[120px]" />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" type="button" onClick={() => setNoteOpen(false)} disabled={savingNote}>
                      Cancelar
                    </Button>
                    <Button variant="primary" type="button" onClick={onCreateNote} disabled={savingNote}>
                      {savingNote ? "Salvando..." : "Salvar"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </TabsContent>

            <TabsContent value="maintenance" className="space-y-4">
              <div className="flex justify-end">
                <Button variant="primary" type="button" onClick={() => setMaintOpen(true)}>
                  Adicionar Manutenção
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Técnico</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Próxima</TableHead>
                    <TableHead style={{ width: 120 }}>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {maintenance.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{m.maintenance_type}</TableCell>
                      <TableCell>{fmtDate(m.performed_at)}</TableCell>
                      <TableCell>{m.technician ?? "—"}</TableCell>
                      <TableCell className="whitespace-pre-wrap">{m.description}</TableCell>
                      <TableCell>{fmtDate(m.next_due)}</TableCell>
                      <TableCell>
                        <Button variant="destructive" type="button" onClick={() => onDeleteMaintenance(m.id)}>
                          Remover
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {maintenance.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                        Sem manutenções ainda.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>

              <Dialog open={maintOpen} onOpenChange={setMaintOpen}>
                <DialogContent className="sm:max-w-[640px]">
                  <DialogHeader>
                    <DialogTitle>Adicionar Manutenção</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-2">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-sm font-semibold">Tipo</label>
                        <div className="mt-2 flex gap-2">
                          <Button type="button" variant={maintType === "Preventiva" ? "primary" : "outline"} onClick={() => setMaintType("Preventiva")}>
                            Preventiva
                          </Button>
                          <Button type="button" variant={maintType === "Corretiva" ? "primary" : "outline"} onClick={() => setMaintType("Corretiva")}>
                            Corretiva
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-semibold">Data Realizada</label>
                        <div className="mt-2">
                          <Input type="date" value={maintPerformedAt} onChange={(e) => setMaintPerformedAt(e.target.value)} />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-sm font-semibold">Técnico (opcional)</label>
                        <div className="mt-2">
                          <Input value={maintTech} onChange={(e) => setMaintTech(e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-semibold">Próxima (dias)</label>
                        <div className="mt-2">
                          <Input
                            type="number"
                            min={1}
                            disabled={maintType !== "Preventiva"}
                            value={maintNextDays}
                            onChange={(e) => setMaintNextDays(Number(e.target.value))}
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-semibold">Descrição</label>
                      <div className="mt-2">
                        <Textarea value={maintDescription} onChange={(e) => setMaintDescription(e.target.value)} className="min-h-[120px]" />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" type="button" onClick={() => setMaintOpen(false)} disabled={savingMaint}>
                      Cancelar
                    </Button>
                    <Button variant="primary" type="button" onClick={onCreateMaintenance} disabled={savingMaint}>
                      {savingMaint ? "Salvando..." : "Salvar"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
