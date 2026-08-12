"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Button, Input, Select, Modal, Badge, Spinner, ErrorBanner } from "@/components/ui";

const ROL_LABEL: Record<string, string> = {
  vendedora: "Vendedora",
  agendadora: "Agendadora",
  almacen: "Almacén",
  controller: "Controller",
  admin: "Admin",
};

type Usuario = {
  id: string;
  dni: string;
  nombre: string;
  apellido: string | null;
  email: string | null;
  telefono: string | null;
  rol: string;
  estado: string;
  descripcion: string | null;
  fecha_contratacion: string | null;
};

export default function AdminClient() {
  const [tab, setTab] = useState<"usuarios" | "config">("usuarios");
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNuevo, setShowNuevo] = useState(false);
  const [editar, setEditar] = useState<Usuario | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await api<{ usuarios: Usuario[] }>("/api/usuarios");
    if (error) setError(error);
    else setUsuarios(data?.usuarios ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Administración</h1>

      <div className="mb-6 flex gap-2">
        <Button variant={tab === "usuarios" ? "primary" : "secondary"} onClick={() => setTab("usuarios")}>
          Usuarios
        </Button>
        <Button variant={tab === "config" ? "primary" : "secondary"} onClick={() => setTab("config")}>
          Configuración
        </Button>
      </div>
      <ErrorBanner message={error} />

      {tab === "usuarios" && (
        <>
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setShowNuevo(true)}>Nuevo usuario</Button>
          </div>
          {loading ? (
            <Spinner />
          ) : (
            <div className="space-y-2">
              {usuarios.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-800">
                        {u.nombre} {u.apellido ?? ""}
                      </p>
                      <Badge color="purple">{ROL_LABEL[u.rol] ?? u.rol}</Badge>
                      <Badge color={u.estado === "activo" ? "green" : "red"}>{u.estado}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      DNI {u.dni} · {u.telefono ?? "sin teléfono"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditar(u)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant={u.estado === "activo" ? "secondary" : "success"}
                      onClick={async () => {
                        const { error } = await api(`/api/usuarios/${u.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ estado: u.estado === "activo" ? "inactivo" : "activo" }),
                        });
                        if (!error) cargar();
                      }}
                    >
                      {u.estado === "activo" ? "Deshabilitar" : "Habilitar"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showNuevo && (
            <FormUsuario
              onClose={() => setShowNuevo(false)}
              onDone={() => {
                setShowNuevo(false);
                cargar();
              }}
            />
          )}
          {editar && (
            <FormUsuario
              usuario={editar}
              onClose={() => setEditar(null)}
              onDone={() => {
                setEditar(null);
                cargar();
              }}
            />
          )}
        </>
      )}

      {tab === "config" && <ConfigPanel />}
    </div>
  );
}

function FormUsuario({
  usuario,
  onClose,
  onDone,
}: {
  usuario?: Usuario | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [dni, setDni] = useState(usuario?.dni ?? "");
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [apellido, setApellido] = useState(usuario?.apellido ?? "");
  const [telefono, setTelefono] = useState(usuario?.telefono ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [rol, setRol] = useState(usuario?.rol ?? "vendedora");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function guardar() {
    setError(null);
    setLoading(true);
    const esEdicion = Boolean(usuario);
    const body: Record<string, any> = { rol };
    if (esEdicion) {
      if (password) body.password = password;
      if (nombre !== usuario!.nombre) body.nombre = nombre;
      if (apellido !== (usuario!.apellido ?? "")) body.apellido = apellido || null;
      if (telefono !== (usuario!.telefono ?? "")) body.telefono = telefono || null;
      if (email !== (usuario!.email ?? "")) body.email = email || null;
    } else {
      body.dni = dni;
      body.nombre = nombre;
      body.apellido = apellido || null;
      body.telefono = telefono || null;
      body.email = email || null;
      body.password = password;
    }
    const { error } = await api(esEdicion ? `/api/usuarios/${usuario!.id}` : "/api/usuarios", {
      method: esEdicion ? "PATCH" : "POST",
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (error) setError(error);
    else onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={usuario ? "Editar usuario" : "Nuevo usuario"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={loading}>
            {loading ? "Guardando..." : "Guardar"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {!usuario && <Input label="DNI *" maxLength={8} value={dni} onChange={(e) => setDni(e.target.value)} required />}
        <Input label="Nombre *" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        <Input label="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} />
        <Input label="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select label="Rol" value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="vendedora">Vendedora</option>
          <option value="agendadora">Agendadora</option>
          <option value="almacen">Almacén</option>
          <option value="controller">Controller</option>
          <option value="admin">Admin</option>
        </Select>
        <Input
          label={usuario ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña *"}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorBanner message={error} />
      </div>
    </Modal>
  );
}

function ConfigPanel() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<{ config: Record<string, string> }>("/api/config").then(({ data, error }) => {
      if (error) setError(error);
      else setConfig(data?.config ?? {});
      setLoading(false);
    });
  }, []);

  async function guardar() {
    setError(null);
    setMsg(null);
    setSaving(true);
    const { error } = await api("/api/config", {
      method: "PUT",
      body: JSON.stringify(config),
    });
    setSaving(false);
    if (error) setError(error);
    else setMsg("Configuración guardada");
  }

  if (loading) return <Spinner />;

  return (
    <section className="max-w-lg rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Configuraciones</h2>
      <div className="space-y-3">
        <Input
          label="Empresa de envío por defecto"
          value={config.empresa_envio_default ?? ""}
          onChange={(e) => setConfig({ ...config, empresa_envio_default: e.target.value })}
        />
        <Input
          label="Número de WhatsApp de la empresa"
          value={config.whatsapp_empresa ?? ""}
          onChange={(e) => setConfig({ ...config, whatsapp_empresa: e.target.value })}
        />
        <Input
          label="Mensaje de confirmación"
          value={config.mensaje_confirmacion ?? ""}
          onChange={(e) => setConfig({ ...config, mensaje_confirmacion: e.target.value })}
        />
        <ErrorBanner message={error} />
        {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{msg}</div>}
        <Button onClick={guardar} disabled={saving}>
          {saving ? "Guardando..." : "Guardar configuración"}
        </Button>
      </div>
    </section>
  );
}
