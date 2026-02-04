import { loadDevices } from "@/controllers/devicesController";
import { type DevicesQuery } from "@/models/device";
import { MaintenanceModal } from "@/components/dashboard/MaintenanceModal";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

function normalizeTab(tab?: string): DevicesQuery["tab"] {
  if (tab === "preventiva" || tab === "corretiva" || tab === "dispositivos") return tab;
  return "dispositivos";
}

function statusVariant(status: string) {
  if (status === "Em Dia") return "ok";
  if (status === "Atrasada") return "late";
  if (status === "Pendente") return "pending";
  return "neutral";
}

export default async function Page({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const hasBackend = Boolean(process.env.NEXT_PUBLIC_PY_API_URL);
  const tab = normalizeTab(
    typeof searchParams?.tab === "string" ? searchParams?.tab : undefined
  );
  const q = typeof searchParams?.q === "string" ? searchParams.q : "";
  const page = Math.max(
    1,
    Number(typeof searchParams?.page === "string" ? searchParams.page : "1") || 1
  );
  const pageSize = 10;

  const query: DevicesQuery = { tab, q, page, pageSize };
  const data = await loadDevices(query);

  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.total, data.page * data.pageSize);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  const mkHref = (next: Partial<DevicesQuery>) => {
    const params = new URLSearchParams();
    params.set("tab", next.tab ?? tab);
    const nextQ = next.q ?? q;
    if (nextQ) params.set("q", nextQ);
    params.set("page", String(next.page ?? page));
    return `/?${params.toString()}`;
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

        <MaintenanceModal defaultNextDueDays={365} />
      </div>

      <div className="rounded-xl bg-white p-1.5 shadow-sm border border-gray-200">
        <Tabs value={tab}>
          <TabsList className="bg-transparent gap-1">
            <TabsTrigger asChild value="dispositivos">
              <Link href={mkHref({ tab: "dispositivos", page: 1 })}>Dispositivos</Link>
            </TabsTrigger>
            <TabsTrigger asChild value="preventiva">
              <Link href={mkHref({ tab: "preventiva", page: 1 })}>
                Manutenção Preventiva
              </Link>
            </TabsTrigger>
            <TabsTrigger asChild value="corretiva">
              <Link href={mkHref({ tab: "corretiva", page: 1 })}>
                Manutenção Corretiva
              </Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-lg">
        <div className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white p-6">
          <form className="flex w-full gap-3" action="/" method="get">
            <input type="hidden" name="tab" value={tab} />
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <Input
                name="q"
                defaultValue={q}
                placeholder="Buscar por nome, setor ou serial..."
                className="pl-10"
              />
            </div>
            <Button variant="primary" type="submit" className="px-6">
              Buscar
            </Button>
          </form>
        </div>

        <div className="mt-4">
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
              {data.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-semibold">{row.device_name}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.maintenance_status) as any}>
                      {row.maintenance_status}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.last_maintenance_date ?? "—"}</TableCell>
                  <TableCell>{row.next_maintenance_date ?? "A Agendar"}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button asChild variant="outline" type="button">
                        <Link href={`/dispositivos/${row.id}`}>
                          Visualizar
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {data.items.length === 0 ? (
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

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Mostrando {from} - {to} de {data.total}
            </p>

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
    </div>
  );
}
