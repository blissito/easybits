import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { MdKeyboardDoubleArrowDown } from "react-icons/md";

export const Faq = () => {
  return (
    <section className="max-w-7xl mx-auto py-20 md:py-40 px-4 md:px-[5%] xl:px-0">
      <h2 className="text-3xl md:text-5xl font-bold text-center ">
        Preguntas frecuentes
      </h2>
      <p className="text-iron text-xl md:text-2xl  mt-6 text-center">
        Si no encuentras la respuesta que buscas,{" "}
        <a href="" className="underline text-brand-500 font-light">
          escríbenos
        </a>{" "}
        .
      </p>
      <div className="mt-12 lg:mt-20 flex flex-col border-[2px] border-black rounded-xl overflow-hidden">
        <Question
          question="¿Qué es EasyBits, en una frase?"
          answer="La nube que tus agentes de IA saben usar sin que tú programes la integración. Un agente conectado puede ejecutar código en su propia máquina aislada, buscar y leer internet, guardar y servir archivos, consultar su base de datos SQL, generar documentos y desplegar aplicaciones. Todo desde un solo endpoint MCP, un SDK tipado o la REST API — y cobrado en pesos."
        />
        <Question
          question="¿Qué es una caja o sandbox?"
          answer="Una microVM Firecracker: una máquina virtual real y aislada, con root e internet, que tu agente crea para ejecutar lo que necesite. Cuando deja de usarla la dormimos, y despierta en menos de un segundo cuando vuelve a hacer falta. No es un contenedor compartido: cada agente tiene la suya."
        />
        <Question
          question="¿Puedo quedarme en el plan gratuito?"
          answer="Sí. El plan Byte es gratis para siempre e incluye 100 MB de almacenamiento, una caja y tres bases de datos. Sirve para construir y probar de verdad, no solo para mirar."
        />
        <Question
          question="¿Tengo que usar sus modelos de IA?"
          answer="No. Puedes traer tus propias llaves — de Anthropic, OpenAI o quien uses — y entonces nos pagas solo el software. Si prefieres no administrar llaves, también te revendemos tokens y los cobramos en pesos. Las dos formas conviven; eliges por agente."
        />
        <Question
          question="¿Los packs caducan?"
          answer="No. Los packs de consultas web, créditos y tokens no tienen fecha de vencimiento: se consumen cuando los uses. Por eso la suscripción y el consumo se cobran por separado — no pagas de más un mes tranquilo."
        />
        <Question
          question="¿Puedo hospedar mi aplicación aquí?"
          answer="Sí. De un repositorio a una URL pública con TLS en una sola llamada, con dominio propio, respaldos diarios y rollback. Cada máquina se cobra aparte y no necesitas plan de pago para contratar una."
        />
        <Question
          question="¿Y si necesito más almacenamiento o más cajas?"
          answer="Subes de plan: Mega da 10 GB y dos cajas concurrentes; Tera, 100 GB y cinco. Si tu caso pide más de eso, escríbenos y lo vemos — hay clientes corriendo configuraciones a la medida."
        />
        <Question
          question="¿Qué formas de pago aceptan?"
          answer="Tarjeta de débito o crédito, Link de Stripe, Apple Pay y Google Pay. Si necesitas otra opción — transferencia o factura — escríbenos y la resolvemos."
        />
      </div>
    </section>
  );
};

export const Question = ({
  question,
  answer,
}: {
  question: string;
  answer: ReactNode;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-black   border-b-[2px] overflow-hidden">
      <button
        className="w-full px-6 py-6 text-lg md:text-xl font-medium text-left flex justify-between items-center"
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        <p className="w-[90%]  text-black ">{question}</p>
        {open ? (
          <MdKeyboardDoubleArrowDown className="rotate-180 transition-all text-black" />
        ) : (
          <MdKeyboardDoubleArrowDown className="transition-all text-black" />
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0 }}
          >
            <p className="text-lg text-iron font-extralight px-6 pb-8">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
