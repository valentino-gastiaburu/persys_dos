import { requireRoles } from "@/lib/auth";

// Permite tocar la configuración de Drive (flujo OAuth) solo a controller/admin.
export async function requerirConsentimientoConfig() {
  const { user, error } = await requireRoles(["controller", "admin"]);
  return { user, error };
}