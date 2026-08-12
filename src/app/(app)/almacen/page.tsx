import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AlmacenLista from "@/components/AlmacenLista";

export default async function AlmacenPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!["almacen", "controller", "admin"].includes(user.rol)) {
    return <p className="py-10 text-center text-sm text-slate-400">No tienes acceso al almacén.</p>;
  }
  return <AlmacenLista />;
}
