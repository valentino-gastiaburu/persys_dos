"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui";

type Stats = {
  pedidos_confirmados: number;
  pedidos_pendientes: number;
  viajes_en_curso: number;
  productos: number;
  clientes: number;
};

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const [p, v, pro, c] = await Promise.all([
        api("/api/pedidos"),
        api("/api/viajes"),
        api("/api/productos"),
        api("/api/clientes"),
      ]);
      const pedidos = (p.data as any)?.pedidos ?? [];
      const productos = (pro.data as any)?.productos ?? [];
      const clientes = (c.data as any)?.clientes ?? [];
      const viajes = (v.data as any)?.viajes ?? [];
      setStats({
        pedidos_confirmados: pedidos.filter((x: any) => x.estado === "confirmado").length,
        pedidos_pendientes: pedidos.filter((x: any) => ["registrado", "recibido"].includes(x.estado)).length,
        viajes_en_curso: viajes.filter((x: any) => ["alistado", "enviado"].includes(x.estado)).length,
        productos: productos.length,
        clientes: clientes.length,
      });
    })();
  }, []);

  if (!stats) return <Spinner />;

  const cards = [
    { label: "Pedidos confirmados", value: stats.pedidos_confirmados, href: "/pedidos" },
    { label: "Pedidos pendientes", value: stats.pedidos_pendientes, href: "/pedidos" },
    { label: "Viajes en curso", value: stats.viajes_en_curso, href: "/almacen" },
    { label: "Productos", value: stats.productos, href: "/productos" },
    { label: "Clientes", value: stats.clientes, href: "/clientes" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Panel</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <p className="text-3xl font-bold text-blue-600">{c.value}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{c.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
