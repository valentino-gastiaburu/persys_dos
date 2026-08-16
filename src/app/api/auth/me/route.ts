import { requireUser } from "@/lib/auth";

// GET /api/auth/me — usuario de la sesión actual
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  return Response.json({ user });
}
