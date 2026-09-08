"use client";

import { useEffect, useState } from "react";
import TabGeneral from "./_general";
import TabUnidades from "./_unidades";
import TabPedidos from "./_pedidos";
import TabIET from "./_iet";

type TabId = "general" | "unidades" | "pedidos" | "iet";

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "unidades", label: "Productos únicos" },
  { id: "pedidos", label: "Pedidos" },
  { id: "iet", label: "IMEI + Talla" },
];

const TITULOS: Record<TabId, string> = {
  general: "Historial general",
  unidades: "¿Qué pasó con una unidad?",
  pedidos: "Historial de un pedido",
  iet: "Historial por IMEI + talla",
};

const DESCRIPCIONES: Record<TabId, string> = {
  general: "Cambios y movimientos del sistema: quién, cuándo y qué cambió.",
  unidades: "El recorrido completo de un QR: ingreso, entalles, reservas, envíos, entregas y devoluciones.",
  pedidos: "Estados, ediciones, viajes y movimientos de stock de un pedido.",
  iet: "Stock actual por talla, unidades con su ubicación, kardex y entalles de un IMEI.",
};

export default function BitacoraPage() {
  const [tab, setTab] = useState<TabId>("general");
  const [params, setParams] = useState<URLSearchParams | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setParams(p);
    const t = p.get("tab");
    if (t === "unidades" || t === "pedidos" || t === "iet") setTab(t);
  }, []);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-slate-800">Bitácora</h1>
      <p className="mb-4 text-sm text-slate-500">{DESCRIPCIONES[tab]}</p>

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div key={tab}>
        {tab === "general" && <TabGeneral />}
        {tab === "unidades" && <TabUnidades initial={params} />}
        {tab === "pedidos" && <TabPedidos initial={params} />}
        {tab === "iet" && <TabIET initial={params} />}
      </div>
    </div>
  );
}