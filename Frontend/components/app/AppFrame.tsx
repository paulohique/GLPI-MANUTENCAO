"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { clearToken, getToken, isTokenExpired } from "@/lib/auth";
import { Button } from "@/components/ui/button";

type MeResponse = {
  username: string;
  display_name?: string | null;
  email?: string | null;
  groups?: string[];
};

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const isLogin = pathname === "/login";

  const [checking, setChecking] = useState(!isLogin);
  const [me, setMe] = useState<MeResponse | null>(null);

  const title = useMemo(() => {
    if (!me) return "GLPI Manutenções";
    return me.display_name ? `GLPI Manutenções — ${me.display_name}` : "GLPI Manutenções";
  }, [me]);

  useEffect(() => {
    if (isLogin) {
      const t = getToken();
      if (t && !isTokenExpired(t)) {
        router.replace("/");
      }
      setChecking(false);
      return;
    }

    const token = getToken();
    if (!token || isTokenExpired(token)) {
      clearToken();
      router.replace("/login");
      return;
    }

    const base = process.env.NEXT_PUBLIC_PY_API_URL;
    if (!base) {
      setChecking(false);
      return;
    }

    const ctrl = new AbortController();
    setChecking(true);

    fetch(`${base}/api/auth/me`, {
      cache: "no-store",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        if (res.status === 401) throw new Error("unauthorized");
        if (!res.ok) throw new Error(`status:${res.status}`);
        return (await res.json()) as MeResponse;
      })
      .then((data) => {
        setMe(data);
        setChecking(false);
      })
      .catch(() => {
        clearToken();
        router.replace("/login");
      });

    return () => ctrl.abort();
  }, [isLogin, router]);

  function onLogout() {
    clearToken();
    router.replace("/login");
  }

  if (!isLogin && checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
            <p className="text-sm text-gray-600">Verificando sessão...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLogin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <main className="mx-auto max-w-7xl px-6 py-10">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <header className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">GLPI Manutenções</h1>
                <p className="mt-1 text-sm text-blue-100">{me?.display_name ? `Usuário: ${me.display_name}` : title}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" type="button" onClick={onLogout}>
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
    </div>
  );
}
