const TOKEN_KEY = "glpi_manutencao_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

function base64UrlDecode(input: string): string {
  const pad = input.length % 4;
  const normalized = (pad ? input + "=".repeat(4 - pad) : input)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  try {
    return decodeURIComponent(
      atob(normalized)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
  } catch {
    return "";
  }
}

export type JwtPayload = {
  sub?: string;
  display_name?: string | null;
  email?: string | null;
  groups?: string[];
  iat?: number;
  exp?: number;
  [k: string]: unknown;
};

export function getTokenPayload(token?: string | null): JwtPayload | null {
  const t = token ?? getToken();
  if (!t) return null;
  const parts = t.split(".");
  if (parts.length < 2) return null;

  const json = base64UrlDecode(parts[1]);
  if (!json) return null;
  try {
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token?: string | null, skewSeconds = 30): boolean {
  const payload = getTokenPayload(token);
  const exp = payload?.exp;
  if (!exp || typeof exp !== "number") return true;
  const now = Math.floor(Date.now() / 1000);
  return now >= exp - Math.max(0, skewSeconds);
}
