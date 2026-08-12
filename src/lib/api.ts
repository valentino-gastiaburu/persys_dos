"use client";

import { useRouter } from "next/navigation";

export type ApiError = { error: string };

export async function api<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    if (!res.ok) {
      let msg = `Error ${res.status}`;
      try {
        const body = (await res.json()) as ApiError;
        if (body.error) msg = body.error;
      } catch {
        // ignore
      }
      return { data: null, error: msg };
    }
    const data = (await res.json()) as T;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: "Error de conexión: " + String(e) };
  }
}

export function useLogout() {
  const router = useRouter();
  return async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };
}
