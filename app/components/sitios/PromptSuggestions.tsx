import type { IconType } from "react-icons";
import {
  LuBriefcase,
  LuCalendarClock,
  LuCamera,
  LuChartBar,
  LuClipboardList,
  LuGraduationCap,
  LuPackage,
  LuRocket,
  LuShoppingBag,
  LuStethoscope,
  LuTicket,
  LuUsers,
} from "react-icons/lu";

type Suggestion = { icon: IconType; title: string; hint: string; prompt: string };

// Briefs completos: el agente rinde mucho mejor con secciones, tono y CTA explícitos
// que con "una landing para X". El usuario los edita antes de mandar.
const STATIC: Suggestion[] = [
  {
    icon: LuStethoscope,
    title: "Consultorio",
    hint: "Servicios, horarios y citas por WhatsApp",
    prompt:
      "Sitio para un consultorio dental: hero con la promesa principal y botón de agendar por WhatsApp, servicios con precio desde, equipo de doctores con foto y especialidad, horarios, ubicación con mapa, testimonios y preguntas frecuentes. Tono cálido y profesional.",
  },
  {
    icon: LuCamera,
    title: "Portafolio",
    hint: "Galería de proyectos y contacto",
    prompt:
      "Portafolio para un fotógrafo de bodas y eventos: hero con una foto a pantalla completa, galería por categorías, paquetes con precio, proceso de trabajo en 4 pasos, testimonios y formulario de contacto. Estética editorial, mucho aire y tipografía serif.",
  },
  {
    icon: LuRocket,
    title: "Lanzamiento",
    hint: "Producto nuevo con lista de espera",
    prompt:
      "Landing de lanzamiento para una app de finanzas personales: hero con la propuesta de valor y captura de correo para la lista de espera, 3 beneficios con ícono, cómo funciona, comparativa contra hacerlo en Excel, preguntas frecuentes y CTA final. Moderna y directa.",
  },
  {
    icon: LuBriefcase,
    title: "Despacho",
    hint: "Servicios profesionales y confianza",
    prompt:
      "Sitio para un despacho contable: hero con el beneficio principal, servicios (contabilidad, nómina, declaraciones, facturación), a quién atendemos, por qué nosotros con cifras, equipo, testimonios y formulario de contacto. Sobrio y confiable.",
  },
  {
    icon: LuTicket,
    title: "Evento",
    hint: "Agenda, ponentes y boletos",
    prompt:
      "Sitio para una conferencia de tecnología de un día: hero con fecha, sede y botón de comprar boleto, agenda por horario, ponentes con foto y bio corta, tipos de boleto con precio, patrocinadores, ubicación y preguntas frecuentes. Enérgico y con color.",
  },
  {
    icon: LuGraduationCap,
    title: "Curso",
    hint: "Temario, instructor e inscripción",
    prompt:
      "Landing para un curso en línea de diseño UX: hero con el resultado que obtienes, temario por módulos, para quién es y para quién no, instructor, proyectos de alumnos, precio con garantía, preguntas frecuentes y botón de inscripción.",
  },
];

const WEBAPP: Suggestion[] = [
  {
    icon: LuCalendarClock,
    title: "Reservas",
    hint: "Agenda de citas con disponibilidad",
    prompt:
      "Web app de reservas para una barbería: los clientes eligen servicio, barbero, día y hora libre, y dejan nombre y teléfono. Panel de administración con la agenda del día, para cancelar o mover citas y bloquear horarios. Base de datos para citas, servicios y barberos.",
  },
  {
    icon: LuShoppingBag,
    title: "Tienda",
    hint: "Catálogo, carrito y pedidos",
    prompt:
      "Tienda en línea de café de especialidad: catálogo con filtros por origen y tueste, ficha de producto, carrito, checkout con datos de envío y pedidos guardados en base de datos. Panel de administración para dar de alta productos y marcar pedidos como enviados.",
  },
  {
    icon: LuPackage,
    title: "Inventario",
    hint: "Existencias, entradas y salidas",
    prompt:
      "Web app de inventario para una ferretería: productos con SKU, existencias y precio, registro de entradas y salidas con fecha y responsable, alerta de existencias bajas y búsqueda rápida. Login para el equipo y exportar a CSV.",
  },
  {
    icon: LuUsers,
    title: "Portal de clientes",
    hint: "Login, documentos y estatus",
    prompt:
      "Portal de clientes para una agencia de diseño: cada cliente entra con correo y contraseña, ve sus proyectos con estatus, descarga entregables y deja comentarios. Panel interno para crear proyectos, subir archivos y cambiar el estatus.",
  },
  {
    icon: LuClipboardList,
    title: "Formularios",
    hint: "Encuestas con resultados en vivo",
    prompt:
      "Web app de encuestas: crear una encuesta con preguntas de opción múltiple y texto, compartir una liga pública, guardar respuestas en base de datos y ver resultados en gráficas en tiempo real. Login para quien crea las encuestas.",
  },
  {
    icon: LuChartBar,
    title: "Dashboard",
    hint: "Métricas de ventas del negocio",
    prompt:
      "Dashboard de ventas para un restaurante: captura de ventas diarias por platillo y forma de pago, gráficas de ventas por día y por semana, platillos más vendidos y ticket promedio. Login para el dueño y los gerentes.",
  },
];

/**
 * Ideas para arrancar el prompt del creador de sitios. Al elegir una se llena el
 * textarea con un brief completo (secciones, tono, CTA) que el usuario edita.
 */
export function PromptSuggestions({
  kind,
  value,
  onPick,
}: {
  kind: "static" | "webapp";
  value: string;
  onPick: (prompt: string) => void;
}) {
  const list = kind === "webapp" ? WEBAPP : STATIC;
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">O empieza con una idea</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {list.map((s) => {
          const Icon = s.icon;
          const active = value.trim() === s.prompt;
          return (
            <button
              key={s.title}
              type="button"
              onClick={() => onPick(s.prompt)}
              aria-pressed={active}
              className={`group text-left p-3 rounded-xl border-2 transition-all min-w-0 ${
                active
                  ? "border-black bg-brand-500/10 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                  : "border-gray-200 hover:border-black hover:-translate-y-0.5"
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`grid place-items-center w-7 h-7 rounded-lg border-2 shrink-0 transition-colors ${
                    active ? "border-black bg-brand-500 text-white" : "border-gray-200 text-gray-600 group-hover:border-black group-hover:text-black"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="font-bold text-sm truncate">{s.title}</span>
              </span>
              <span className="block text-[11px] text-gray-500 mt-1.5 leading-snug line-clamp-2">{s.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
