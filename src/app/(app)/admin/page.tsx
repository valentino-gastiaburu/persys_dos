import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AdminClient from "@/components/AdminClient";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.rol !== "admin") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-medium text-red-700">Acceso restringido a administradores.</p>
      </div>
    );
  }
  return <AdminClient />;
}
