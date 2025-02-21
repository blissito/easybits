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
        <a className="underline text-brand-500 font-light">escríbenos</a> .
      </p>
      <div className="mt-16 flex flex-col border-[2px] border-black rounded-xl overflow-hidden">
        <Question
          question="¿Qué es un asset digital?"
          answer="¡El Plan PRO desbloquea más funcionalidades de Formmy! Como más opciones de personalización, imagenes extra para el mensaje final, campos personalizados, notificaciones específicas, la opción de agregar colaboradores al proyecto, mensajes ilimitados y remosión de la marca de agua."
        />
        <Question
          question="¿Cómo funciona EasyBits?"
          answer="¡El Plan PRO desbloquea más funcionalidades de Formmy! Como más opciones de personalización, imagenes extra para el mensaje final, campos personalizados, notificaciones específicas, la opción de agregar colaboradores al proyecto, mensajes ilimitados y remosión de la marca de agua."
        />
        <Question
          question="¿Cómo creo una cuenta?"
          answer="¡El Plan PRO desbloquea más funcionalidades de Formmy! Como más opciones de personalización, imagenes extra para el mensaje final, campos personalizados, notificaciones específicas, la opción de agregar colaboradores al proyecto, mensajes ilimitados y remosión de la marca de agua."
        />
        <Question
          question="¿Cómo se agrega un asset?"
          answer="¡El Plan PRO desbloquea más funcionalidades de Formmy! Como más opciones de personalización, imagenes extra para el mensaje final, campos personalizados, notificaciones específicas, la opción de agregar colaboradores al proyecto, mensajes ilimitados y remosión de la marca de agua."
        />
        <Question
          question="¿Cómo puedo empezar a vender mis assets?"
          answer="¡El Plan PRO desbloquea más funcionalidades de Formmy! Como más opciones de personalización, imagenes extra para el mensaje final, campos personalizados, notificaciones específicas, la opción de agregar colaboradores al proyecto, mensajes ilimitados y remosión de la marca de agua."
        />
        <Question
          question="¿Qué pasa si uso todo el almacenamiento incluido en el plan?"
          answer="¡El Plan PRO desbloquea más funcionalidades de Formmy! Como más opciones de personalización, imagenes extra para el mensaje final, campos personalizados, notificaciones específicas, la opción de agregar colaboradores al proyecto, mensajes ilimitados y remosión de la marca de agua."
        />
        <Question
          question="¿Puedo quedarme en el Plan Free para siempre?"
          answer="¡El Plan PRO desbloquea más funcionalidades de Formmy! Como más opciones de personalización, imagenes extra para el mensaje final, campos personalizados, notificaciones específicas, la opción de agregar colaboradores al proyecto, mensajes ilimitados y remosión de la marca de agua."
        />
        <Question
          question="¿Qué formas de pago aceptan?"
          answer="¡El Plan PRO desbloquea más funcionalidades de Formmy! Como más opciones de personalización, imagenes extra para el mensaje final, campos personalizados, notificaciones específicas, la opción de agregar colaboradores al proyecto, mensajes ilimitados y remosión de la marca de agua."
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
