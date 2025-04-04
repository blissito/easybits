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
      <div className="mt-16 flex flex-col border-[2px] border-black rounded-xl overflow-hidden">
        <Question
          question="¿Qué es un asset digital?"
          answer="En EasyBits un asset digital es un archivo que se transforma en un producto digital al tener una landing page de detalle, descripción, vista previa, reseñas, y que se vende de forma 100% digital. Este archivo puede ser un e-book sobre un tema que te apasiona, fotografías que has tomado en tus viajes, ilustraciones que realizas como hobby, conferencias profesionales, poemas que escribes en tu tiempo libre o profesionalmente, o cualquier tipo de contenido creativo digital."
        />
        <Question
          question="¿Cómo funciona EasyBits?"
          answer="EasyBits es una plataforma donde cualquier creativo puede crear una cuenta de forma gratuita, crear su primer asset y empezar a venderlo. Mientras tú compartes el link de tu tienda con tus seguidores y clientes, nosotros promocionamos tus assets en Comunidad EasyBits para que llegué a más y más usuarios que amen tu trabajo. "
        />
        <Question
          question="¿Cómo creo una cuenta?"
          answer="Da clic en el botón «Empezar», y elige como quieres crear la cuenta, con alguna red social o solo con correo electrónico. Y eso es todo, inmediatamente después de crear tu cuenta ya puedes crear tu primer asset. "
        />
        <Question
          question="¿Hay comisiones extra por venta?"
          answer="No, EasyBits no cobrá comisiones extra por venta, el precio de tu plan es lo único que pagarás a EasyBits. Pero para tener cobros en línea, debes considerar la comisión del 3.6% + 3 pesos por transacción de Stripe, el desglose de las comisiones las puedes ver directamente en tu dashbaord de Stripe."
        />
        <Question
          question="¿Cómo puedo empezar a vender mis assets?"
          answer="Despues de crear tu primer asset debes registrarte en Stripe por medio de nuestra plataforma para poder cobrar tus assets y recibir tu dinero. Recuerda que EasyBits usa Stripe para ofrecerte cobros internacionales seguros y rápidos. "
        />
        <Question
          question="¿Qué pasa si uso todo el almacenamiento incluido en el plan?"
          answer="Puedes agregar almacenamiento extra a tu plan por tan solo $ 1 USD por GB."
        />
        <Question
          question="¿Puedo quedarme en el Plan Free para siempre?"
          answer="Sí, el plan Free te permite tener 1 asset en venta, así que si no necesitas agregar más assets, puedes quedarte allí por siempre y para siempre."
        />
        <Question
          question="¿Qué formas de pago aceptan?"
          answer="Para suscribirte al Plan Creative o Expert puedes usar cualquier tarjeta de débito o crédito, Link de Stripe, ApplePay o GooglePay. Si requieres otra opción de pago, escríbenos, seguramente encontraremos una forma de pago adecuada para ti. "
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
