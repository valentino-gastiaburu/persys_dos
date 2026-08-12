"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, ErrorBanner } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [dni, setDni] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dni, password }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const body = await res.json();
        setError(body.error || "Credenciales inválidas");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-2xl font-bold text-white">
            P
          </div>
          <h1 className="text-xl font-bold text-slate-800">Persys</h1>
          <p className="text-sm text-slate-400">Ventas, Inventario y Distribución</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="DNI"
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            placeholder="00000000"
            maxLength={8}
            required
            autoFocus
          />
          <Input
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          <ErrorBanner message={error} />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
