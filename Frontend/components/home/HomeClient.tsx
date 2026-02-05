"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { loadDevices } from "@/controllers/devicesController";
import { loadDashboardMetrics } from "@/controllers/dashboardController";
import { loadMaintenanceReport } from "@/controllers/reportController";

import { type DevicesQuery } from "@/models/device";
import { type DashboardMetrics } from "@/models/dashboard";
import { type MaintenanceReportResponse } from "@/models/report";

import { StatCard } from "@/components/dashboard/StatCard";
import { DashboardPies } from "@/components/dashboard/DashboardPies";
import { ReportClient } from "@/components/report/ReportClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Tab = "dispositivos" | "preventiva" | "corretiva" | "relatorio";

function normalizeTab(tab?: string | null): Tab {
  if (tab === "preventiva" || tab === "corretiva" || tab === "dispositivos" || tab === "relatorio") return tab;
  return "dispositivos";
}

function statusVariant(status: string) {
  if (status === "Em Dia") return "ok";
  if (status === "Atrasada") return "late";
  if (status === "Pendente") return "pending";
  return "neutral";
}

export function HomeClient() {
  const searchParams = useSearchParams();

  const hasBackend = Boolean(process.env.NEXT_PUBLIC_PY_API_URL);

  const tab = normalizeTab(searchParams.get("tab"));
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = 10;

  const reportFrom = searchParams.get("from") ?? "";
  const reportTo = searchParams.get("to") ?? "";
  const reportTypeRaw = searchParams.get("maintenance_type") ?? "Ambas";
  const reportType = (reportTypeRaw === "Preventiva" || reportTypeRaw === "Corretiva" || reportTypeRaw === "Ambas")
    ? reportTypeRaw
    : "Ambas";

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [devicesData, setDevicesData] = useState<Awaited<ReturnType<typeof loadDevices>> | null>(null);

  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [report, setReport] = useState<MaintenanceReportResponse | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const m = await loadDashboardMetrics();
        if (!alive) return;
        setMetrics(m);
      } catch {
        if (!alive) return;
        setMetrics(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function run() {
      setDevicesError(null);
      setReportError(null);

      if (tab === "relatorio") {
        setDevicesData(null);
        setReportLoading(true);
        try {
          const r = await loadMaintenanceReport({ from: reportFrom, to: reportTo, maintenance_type: reportType });
          if (!alive) return;
          setReport(r);
        } catch (e: any) {
          if (!alive) return;
          setReport(null);
          setReportError(e?.message ?? "Falha ao carregar relatório");
        } finally {
          if (!alive) return;
          setReportLoading(false);
        }
        return;
      }

      setReport(null);
      setReportLoading(false);

      setDevicesLoading(true);
      try {
        const d = await loadDevices({ tab: tab as DevicesQuery["tab"], q, page, pageSize });
        if (!alive) return;
        setDevicesData(d);
      } catch (e: any) {
        if (!alive) return;
        setDevicesData({ items: [], page, pageSize, total: 0 } as any);
        setDevicesError(e?.message ?? "Falha ao carregar dispositivos");
      } finally {
        if (!alive) return;
        setDevicesLoading(false);
      }
    }

    run();

    return () => {
      alive = false;
    };
  }, [tab, q, page, pageSize, reportFrom, reportTo, reportType]);

  const totalComputers = metrics?.total_computers ?? 0;
  const preventiveDone = metrics?.preventive_done_computers ?? 0;
  const preventiveNeeded = metrics?.preventive_needed_computers ?? 0;
  const correctiveDone = metrics?.corrective_done_total ?? 0;

  const preventivePct = preventiveNeeded > 0 ? Math.round((preventiveDone / preventiveNeeded) * 100) : 0;

  const from = devicesData ? (devicesData.total === 0 ? 0 : (devicesData.page - 1) * devicesData.pageSize + 1) : 0;
  const to = devicesData ? Math.min(devicesData.total, devicesData.page * devicesData.pageSize) : 0;
  const pages = devicesData ? Math.max(1, Math.ceil(devicesData.total / devicesData.pageSize)) : 1;

  const mkHref = (next: Partial<DevicesQuery>) => {
    const params = new URLSearchParams();
    params.set("tab", next.tab ?? tab);
    const nextQ = next.q ?? q;
    if (nextQ) params.set("q", nextQ);
    params.set("page", String(next.page ?? page));
    return `/?${params.toString()}`;
  };

  const showAuthHint = (msg?: string | null) => {
    if (!msg) return null;
    const s = String(msg).toLowerCase();
    if (!s.includes("não autenticado") && !s.includes("unauthorized") && !s.includes("401")) return null;
    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        Sessão inválida/expirada. <Link className="underline font-semibold" href="/login">Ir para login</Link>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Controle de Dispositivos</h2>
          <p className="mt-2 text-sm text-gray-600">
            Gerencie a manutenção preventiva e corretiva de todos os dispositivos
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Preventivas Realizadas"
          value={`${preventiveDone} / ${preventiveNeeded}`}
          subtitle={preventiveNeeded > 0 ? `${preventivePct}% concluído` : "—"}
        />
        <StatCard
          title="Total de Computadores"
          value={String(totalComputers)}
          subtitle={hasBackend ? "Espelho local do GLPI" : "Backend não configurado"}
        />
        <StatCard
          title="Corretivas Realizadas"
          value={String(correctiveDone)}
          subtitle="Registros no banco local"
        />
      </div>

      <DashboardPies metrics={metrics} />

      <div className="rounded-xl bg-white p-1.5 shadow-sm border border-gray-200">
        <Tabs value={tab}>
          <TabsList className="bg-transparent gap-1">
            <TabsTrigger asChild value="dispositivos">
              <Link href={mkHref({ tab: "dispositivos", page: 1 })}>Dispositivos</Link>
            </TabsTrigger>
            <TabsTrigger asChild value="preventiva">
              <Link href={mkHref({ tab: "preventiva", page: 1 })}>Manutenção Preventiva</Link>
            </TabsTrigger>
            <TabsTrigger asChild value="corretiva">
              <Link href={mkHref({ tab: "corretiva", page: 1 })}>Manutenção Corretiva</Link>
            </TabsTrigger>
            <TabsTrigger asChild value="relatorio">
              <Link href="/?tab=relatorio">Relatório</Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === "relatorio" ? (
        <div className="space-y-3">
          {reportLoading ? (
            <p className="text-sm text-muted-foreground">Carregando relatório...</p>
          ) : reportError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Erro: {reportError}
              {showAuthHint(reportError)}
            </div>
          ) : null}

          <ReportClient
            rows={report?.items ?? []}
            total={report?.total ?? 0}
            filters={{ from: reportFrom, to: reportTo, maintenance_type: reportType as any }}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white p-6">
            <form className="flex w-full gap-3" action="/" method="get">
              <input type="hidden" name="tab" value={tab} />
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <Input name="q" defaultValue={q} placeholder="Buscar por nome, setor ou serial..." className="pl-10" />
              </div>
              <Button variant="primary" type="submit" className="px-6">Buscar</Button>
            </form>
            {devicesError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Erro: {devicesError}
                {showAuthHint(devicesError)}
              </div>
            ) : null}
          </div>

          <div className="mt-4">
            {devicesLoading ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Carregando...</p>
            ) : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={{ width: "25%" }}>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última Manutenção</TableHead>
                  <TableHead>Próxima Manutenção</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(devicesData?.items ?? []).map((row: any) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-semibold">{row.device_name}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.maintenance_status) as any}>{row.maintenance_status}</Badge>
                    </TableCell>
                    <TableCell>{row.last_maintenance_date ?? "—"}</TableCell>
                    <TableCell>{row.next_maintenance_date ?? "A Agendar"}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button asChild variant="outline" type="button">
                          <Link href={`/dispositivos/${row.id}`}>Visualizar</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {(devicesData?.items ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <svg className="h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm font-medium">Nenhum dispositivo encontrado</p>
                        {!hasBackend ? (
                          <p className="text-xs text-gray-400">Configure a variável NEXT_PUBLIC_PY_API_URL para conectar ao backend</p>
                        ) : (
                          <p className="text-xs text-gray-400">Rode o sync do GLPI no backend para importar dados</p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>

            <div className="mt-4 flex items-center justify-between gap-3 px-6 pb-6">
              <p className="text-sm text-muted-foreground">Mostrando {from} - {to} de {devicesData?.total ?? 0}</p>

              <div className="flex items-center gap-2">
                <Button asChild variant="outline" type="button">
                  <Link href={mkHref({ page: Math.max(1, page - 1) })}>Anterior</Link>
                </Button>
                <span className="text-sm font-extrabold">{page}</span>
                <span className="text-sm text-muted-foreground">/ {pages}</span>
                <Button asChild variant="outline" type="button">
                  <Link href={mkHref({ page: Math.min(pages, page + 1) })}>Próximo</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
