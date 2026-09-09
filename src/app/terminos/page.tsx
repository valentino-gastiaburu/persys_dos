import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos de Servicio — Persys",
  description: "Términos de servicio de la aplicación Persys",
};

const sections = [
  {
    title: "Ámbito de uso",
    body: (
      <>
        <p>
          Persys es una herramienta interna de la empresa para gestionar ventas, inventario,
          distribución y cobros. Su uso está restringido al personal autorizado por la empresa.
        </p>
      </>
    ),
  },
  {
    title: "Uso adecuado",
    body: (
      <>
        <p>
          Quien accede a la aplicación se compromete a usarla únicamente para las tareas
          relacionadas con la operación de la empresa y a tratar la información que allí se
          registra de forma confidencial. Está prohibido divulgar, descargar o utilizar fuera del
          sistema los datos de clientes, pedidos o comprobantes, salvo autorización expresa.
        </p>
      </>
    ),
  },
  {
    title: "Acceso y credenciales",
    body: (
      <>
        <p>
          Las cuentas de usuario y contraseña son personales e intransferibles. Cada persona es
          responsable de las acciones realizadas con su cuenta. Cualquier uso indebido o sospecha
          de acceso no autorizado debe reportarse de inmediato al administrador.
        </p>
      </>
    ),
  },
  {
    title: "Disponibilidad del servicio",
    body: (
      <>
        <p>
          La empresa hará los esfuerzos razonables para mantener la aplicación disponible, pero
          el servicio puede interrumpirse temporalmente por mantenimiento, fallos técnicos o
          circunstancias ajenas. No se garantiza una disponibilidad ininterrumpida.
        </p>
      </>
    ),
  },
  {
    title: "Modificaciones",
    body: (
      <>
        <p>
          La empresa podrá modificar estos términos cuando lo considere necesario. El uso
          continuado de la aplicación después de un cambio implica la aceptación de los términos
          actualizados. La versión vigente es la publicada en esta página.
        </p>
        <p className="pt-3 text-sm text-slate-500">
          Última actualización: 09 de septiembre de 2026.
        </p>
      </>
    ),
  },
];

export default function TerminosPage() {
  return (
    <main className="min-h-screen bg-slate-100 py-10">
      <article className="mx-auto w-full max-w-3xl rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Términos de Servicio</h1>
        <p className="mt-1 text-sm text-slate-500">Aplicación Persys</p>
        <div className="mt-6 space-y-6">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="mb-2 text-lg font-semibold text-slate-800">{s.title}</h2>
              <div className="space-y-2 text-sm leading-relaxed text-slate-700">{s.body}</div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}