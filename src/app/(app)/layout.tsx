import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} />
      <main className="flex-1 overflow-x-hidden p-6">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
