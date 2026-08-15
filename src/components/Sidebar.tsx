"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLogout } from "@/lib/api";
import type { SessionUser } from "@/lib/auth";

export default function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const logout = useLogout();
  const esAlmacen = user.rol === "almacen" || user.rol === "controller" || user.rol === "admin";

  const links: { href: string; label: string; show?: boolean }[] = [
    { href: "/", label: "Inicio" },
    { href: "/pedidos", label: "Pedidos" },
    { href: "/productos", label: "Productos" },
    { href: "/productos-unicos", label: "Productos Únicos" },
    { href: "/clientes", label: "Clientes" },
    { href: "/pagos", label: "Pagos" },
    { href: "/almacen", label: "Almacén / Viajes", show: esAlmacen },
    { href: "/admin", label: "Admin", show: user.rol === "admin" },
  ];

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-lg font-bold text-white">
          P
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800">Persys</p>
          <p className="text-xs text-slate-400">Ventas · Inventario</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-3">
        {links
          .filter((l) => l.show !== false)
          .map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
            {user.nombre.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-700">{user.nombre}</p>
            <p className="text-[11px] capitalize text-slate-400">{user.rol}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
