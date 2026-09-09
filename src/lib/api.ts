"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type ApiError = { error: string };

// Rol de la sesión actual (para gatear accesos a historial/conciliación desde el cliente).
export function useSesion() {
  const [user, setUser] = useState<{ rol: string; nombre: string; id: string } | null>(null);
  const [cargado, setCargado] = useState(false);
  useEffect(() => {
    let activo = true;
    (async () => {
      const { data } = await api<{ user: { rol: string; nombre: string; id: string } }>(
        "/api/auth/me"
      );
      if (activo) {
        setUser(data?.user ?? null);
        setCargado(true);
      }
    })();
    return () => {
      activo = false;
    };
  }, []);
  return { user, cargado };
}

export async function api<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const esFormData = options.body instanceof FormData;
    const res = await fetch(url, {
      ...options,
      headers: esFormData
        ? { ...(options.headers ?? {}) }
        : {
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
