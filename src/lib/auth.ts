import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getSupabase } from "./supabase";

const SESSION_NAME = "persys_session";

export type SessionUser = {
  id: string;
  dni: string;
  nombre: string;
  rol: string;
};

export const ROLES = {
  vendedora: "vendedora",
  agendadora: "agendadora",
  almacen: "almacen",
  controller: "controller",
  admin: "admin",
} as const;

async function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "persys-dev-secret-cambiar"
  );
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(await getSecret());

  const store = await cookies();
  store.set(SESSION_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await getSecret());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

// Valida contra la BD que el usuario siga activo (el admin puede deshabilitar cuentas).
export async function requireUser(): Promise<
  { user: SessionUser; error: null } | { user: null; error: Response }
> {
  const session = await getSessionUser();
  if (!session) {
    return {
      user: null,
      error: Response.json({ error: "No autenticado" }, { status: 401 }),
    };
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, dni, nombre, rol, estado")
    .eq("id", session.id)
    .single();

  if (error || !data || data.estado !== "activo") {
    return {
      user: null,
      error: Response.json({ error: "Cuenta deshabilitada" }, { status: 403 }),
    };
  }

  return {
    user: { id: data.id, dni: data.dni, nombre: data.nombre, rol: data.rol },
    error: null,
  };
}

export async function requireRoles(
  roles: string[]
): Promise<
  { user: SessionUser; error: null } | { user: null; error: Response }
> {
  const result = await requireUser();
  if (result.error) return result;
  if (!roles.includes(result.user!.rol)) {
    return {
      user: null,
      error: Response.json({ error: "Acceso denegado" }, { status: 403 }),
    };
  }
  return result;
}
