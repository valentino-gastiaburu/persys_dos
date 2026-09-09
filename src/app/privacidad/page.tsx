import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad — Persys",
  description: "Política de privacidad de la aplicación Persys",
};

const sections = [
  {
    title: "Identidad y contacto",
    body: (
      <>
        <p>
          Esta aplicación (Persys) es una herramienta interna de gestión de ventas, inventario
          y distribución. No es una aplicación pública de consumo masivo: se usa dentro de la
          empresa, por personal autorizado.
        </p>
        <p>
          Ante cualquier consulta sobre estos datos o el tratamiento que hacemos de ellos,
          podés escribirnos a: <strong>valentinogastiaburu@gmail.com</strong>.
        </p>
      </>
    ),
  },
  {
    title: "Datos que tratamos",
    body: (
      <>
        <p>
          Para operar, la aplicación guarda información de clientes y de los pedidos de la
          empresa: nombres, documentos de identidad, teléfonos, direcciones, distritos y
          ciudades; además de los pedidos, viajes, pagos y comprobantes de pago asociados.
          También administra las cuentas de usuario y contraseñas del personal que usa el
          sistema.
        </p>
      </>
    ),
  },
  {
    title: "Finalidad",
    body: (
      <>
        <p>
          Los datos se usan exclusivamente para la operación interna: registrar pedidos,
          controlar el inventario, organizar las entregas y los cobros, y generar reportes de
          ventas. No se usan para fines distintos ni se ceden a terceros.
        </p>
      </>
    ),
  },
  {
    title: "Almacenamiento de comprobantes de pago",
    body: (
      <>
        <p>
          Las fotos y PDFs de comprobantes de pago se guardan en una carpeta de Google Drive
          privada y con acceso limitado al personal autorizado de la empresa. La carpeta no es
          pública: solo puede ver su contenido quien tenga acceso al Drive interno.
        </p>
      </>
    ),
  },
  {
    title: "Compartición con terceros",
    body: (
      <>
        <p>
          No vendemos, alquilamos ni compartimos los datos con terceros. El único proveedor
          externo involucrado es Google, que aloja técnicamente el almacenamiento de los
          comprobantes (Google Drive) dentro de las condiciones de su propio servicio.
        </p>
      </>
    ),
  },
  {
    title: "Seguridad",
    body: (
      <>
        <p>
          El acceso a la aplicación es por usuario y contraseña, y el acceso a los comprobantes
          queda restringido a las cuentas autorizadas sobre la carpeta de Drive. Se implementan
          los mecanismos técnicos razonables para proteger la información almacenada.
        </p>
      </>
    ),
  },
  {
    title: "Derechos del titular",
    body: (
      <>
        <p>
          Puedes solicitar el acceso, rectificación o eliminación de los datos personales que te
          correspondan escribiendo al correo de contacto indicado arriba. Los datos se conservan
          mientras la empresa los necesite para su operación.
        </p>
      </>
    ),
  },
  {
    title: "Cambios en esta política",
    body: (
      <>
        <p>
          Esta política puede actualizarse cuando cambie la forma en que la aplicación maneja la
          información. La versión vigente es la que aparece publicada en esta página.
        </p>
        <p className="pt-3 text-sm text-slate-500">
          Última actualización: 09 de septiembre de 2026.
        </p>
      </>
    ),
  },
];

export default function PrivacidadPage() {
  return (
    <main className="min-h-screen bg-slate-100 py-10">
      <article className="mx-auto w-full max-w-3xl rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Política de Privacidad</h1>
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