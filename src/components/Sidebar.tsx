"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLogout } from "@/lib/api";
import type { SessionUser } from "@/lib/auth";

const ICONOS: Record<string, React.ReactNode> = {
  inicio: (
    <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-10.5Z" />
  ),
  pedidos: (
    <>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1Z" />
      <path d="M9 13h6M9 17h6" />
    </>
  ),
  productos: (
    <>
      <path d="M6 7h12l1 14H5L6 7Z" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" />
    </>
  ),
  unicos: (
    <>
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8Z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </>
  ),
  clientes: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  pagos: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M16 8.5c-.8-1.2-2-1.8-3.5-1.8-1.7 0-3 .8-3 2s1.2 1.8 3.2 2.2c1.8.4 3 1 3 2.2 0 1.3-1.4 2.1-3.2 2.1-1.6 0-2.8-.6-3.6-1.8M12 6v12" />
    </>
  ),
  almacen: (
    <>
      <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </>
  ),
  admin: (
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
  ),
  salir: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </>
  ),
};

type LinkItem = { href: string; label: string; icon: string; show?: boolean };

export default function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const logout = useLogout();
  const esAlmacen = user.rol === "almacen" || user.rol === "controller" || user.rol === "admin";

  const links: LinkItem[] = [
    { href: "/", label: "Inicio", icon: "inicio" },
    { href: "/pedidos", label: "Pedidos", icon: "pedidos" },
    { href: "/productos", label: "Productos", icon: "productos" },
    { href: "/productos-unicos", label: "Productos Únicos", icon: "unicos" },
    { href: "/clientes", label: "Clientes", icon: "clientes" },
    { href: "/pagos", label: "Pagos", icon: "pagos" },
    { href: "/almacen", label: "Almacén / Viajes", icon: "almacen", show: esAlmacen },
    { href: "/admin", label: "Admin", icon: "admin", show: user.rol === "admin" },
  ];

  return (
    <>
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
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
            .map((l) => (
              <LinkItemLink key={l.href} link={l} active={esActivo(pathname, l.href)} />
            ))}
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

      <MenuMovil user={user} links={links} pathname={pathname} logout={logout} />
    </>
  );
}

function esActivo(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Icono({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
    >
      {ICONOS[name]}
    </svg>
  );
}

function LinkItemLink({ link, active }: { link: LinkItem; active: boolean }) {
  return (
    <Link
      href={link.href}
      className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      {link.label}
    </Link>
  );
}

function MenuMovil({
  user,
  links,
  pathname,
  logout,
}: {
  user: SessionUser;
  links: LinkItem[];
  pathname: string;
  logout: () => Promise<void> | void;
}) {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = abierto ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [abierto]);

  return (
    <>
      {abierto && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px] md:hidden"
          onClick={() => setAbierto(false)}
        />
      )}

      <div className="fixed bottom-5 right-5 z-50 md:hidden">
        {abierto && (
          <div className="mb-3 flex max-h-[70vh] w-max max-w-[calc(100vw-2.5rem)] flex-col items-end gap-2 overflow-y-auto overscroll-contain py-1 pr-1">
            <div className="flex items-center gap-2 rounded-full bg-blue-600 py-1 pl-2 pr-4 text-xs font-semibold text-white shadow-lg">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
                {user.nombre.charAt(0)}
              </span>
              <span className="max-w-[140px] truncate">{user.nombre}</span>
            </div>

            {links
              .filter((l) => l.show !== false)
              .map((l) => {
                const active = esActivo(pathname, l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setAbierto(false)}
                    className={`flex items-center gap-2.5 rounded-full border py-2 pl-2 pr-4 text-sm font-semibold shadow-lg transition-transform active:scale-95 ${
                      active
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full ${
                        active ? "bg-white/20" : "bg-blue-50 text-blue-600"
                      }`}
                    >
                      <Icono name={l.icon} />
                    </span>
                    {l.label}
                  </Link>
                );
              })}

            <button
              onClick={() => {
                setAbierto(false);
                logout();
              }}
              className="flex items-center gap-2.5 rounded-full border border-red-200 bg-white py-2 pl-2 pr-4 text-sm font-semibold text-red-600 shadow-lg active:scale-95"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50">
                <Icono name="salir" className="h-4 w-4" />
              </span>
              Cerrar sesión
            </button>
          </div>
        )}

        <button
          onClick={() => setAbierto(!abierto)}
          aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl transition-transform active:scale-95"
        >
          {abierto ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="h-6 w-6"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="h-6 w-6"
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          )}
        </button>
      </div>
    </>
  );
}
