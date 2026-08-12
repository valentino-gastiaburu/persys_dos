"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Button, Input, Modal, Spinner, ErrorBanner } from "@/components/ui";

type Cliente = {
  id: string;
  telefono: string;
  nombre: string;
  apellido: string | null;
  dni: string | null;
  direccion: string | null;
  observaciones: string | null;
};

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [showNuevo, setShowNuevo] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await api<{ clientes: Cliente[] }>(
      busqueda ? "/api/clientes?q=" + encodeURIComponent(busqueda) : "/api/clientes"
    );
    if (error) setError(error);
    else setClientes(data?.clientes ?? []);
    setLoading(false);
  }, [busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Clientes</h1>
        <Button onClick={() => setShowNuevo(true)}>Nuevo cliente</Button>
      </div>

      <div className="mb-4 flex gap-2">
        <Input
          placeholder="Buscar por teléfono o nombre..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setBusqueda(q)}
          className="max-w-xs"
        />
        <Button variant="secondary" onClick={() => setBusqueda(q)}>
          Buscar
        </Button>
      </div>
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {clientes.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-slate-400">No hay clientes.</p>
          )}
          {clientes.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <p className="truncate font-semibold text-slate-800">
                {c.nombre} {c.apellido ?? ""}
              </p>
              <p className="truncate text-sm text-blue-600">{c.telefono}</p>
              {c.dni && <p className="text-xs text-slate-400">DNI {c.dni}</p>}
              {c.direccion && <p className="mt-0.5 truncate text-xs text-slate-500">{c.direccion}</p>}
            </div>
          ))}
        </div>
      )}

      {showNuevo && (
        <NuevoClienteModal
          onClose={() => setShowNuevo(false)}
          onDone={() => {
            setShowNuevo(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function NuevoClienteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [telefono, setTelefono] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [dni, setDni] = useState("");
  const [email, setEmail] = useState("");
  const [direccion, setDireccion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function crear() {
    setError(null);
    setLoading(true);
    const { error } = await api("/api/clientes", {
      method: "POST",
      body: JSON.stringify({
        telefono,
        nombre,
        apellido: apellido || null,
        dni: dni || null,
        email: email || null,
        direccion: direccion || null,
      }),
    });
    setLoading(false);
    if (error) setError(error);
    else onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nuevo cliente"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={crear} disabled={loading || !telefono || !nombre}>
            {loading ? "Guardando..." : "Crear cliente"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Teléfono *" value={telefono} onChange={(e) => setTelefono(e.target.value)} required />
        <Input label="Nombre *" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        <Input label="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} />
        <Input label="DNI" maxLength={8} value={dni} onChange={(e) => setDni(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        <ErrorBanner message={error} />
      </div>
    </Modal>
  );
}
