import { useState } from "react";
import { FaCheck } from "react-icons/fa";
import { Input } from "~/components/common/Input";
import { ModalProvider } from "~/components/common/ModalProvider";

export const Providers = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [provider, setProvider] = useState(" ");

  const handleModaStripe = () => {
    setIsOpen(true);
    setProvider("stripe");
  };

  const handleModalAnalytics = () => {
    setIsOpen(true);
    setProvider("analytics");
  };

  const handleClose = () => {
    setIsOpen(false);
  };
  return (
    <section className="flex flex-wrap mt-8 gap-6 w-full ">
      <ProviderCard
        handleModal={handleModaStripe}
        icon="/icons/stripe.svg"
        title="Stripe"
        description="Recibe pagos en línea seguros y rápidos con stripe. "
        stripeAccount="Fixtergeek"
      />
      <ProviderCard
        handleModal={handleModalAnalytics}
        icon="/icons/analytics.svg"
        title="Google Analytics"
        description="Añade un ID de medición de Analytics y obten información sobre los visitantes. "
      />
      {provider === "stripe" && (
        <ModalProvider
          title="Stripe"
          icon="/icons/stripe.svg"
          onClose={handleClose}
          isOpen={isOpen}
        >
          <div className="flex flex-col  h-full">
            <div>
              <p>
                Recibe pagos en línea desde de tienda en EasyBits de forma
                segura y rápida.
              </p>
              <ul className="mt-4">
                <li className="flex gap-2 items-start my-2">
                  {" "}
                  <FaCheck className="mt-1" />
                  Automatiza recibos para mayor comodidad.
                </li>
                <li className="flex gap-2 items-start my-2">
                  {" "}
                  <FaCheck className="mt-1" />
                  Recibe pagos mediante Apple Pay, Google Pay y Link.
                </li>
                <li className="flex gap-2 items-start my-2">
                  {" "}
                  <FaCheck className="mt-1" />
                  Realiza un seguimiento de cada transacción desde un solo lugar
                  y simplifica la contabilidad
                </li>
              </ul>
            </div>
            <img
              src="/images/stripe-example.svg"
              className="mt-auto"
              alt="ejemplo stripe"
            />
          </div>
        </ModalProvider>
      )}
      {provider === "analytics" && (
        <ModalProvider
          title="Google Analytics"
          icon="/icons/analytics.svg"
          onClose={handleClose}
          isOpen={isOpen}
        >
          <div className="flex flex-col  h-full">
            <div>
              <p className="mb-6">
                Añade un ID de medición de Google Analytics a tu tienda y obtén
                información crucial sobre los visitantes. Con acceso a datos
                demográficos y de comportamiento detallados, puede adaptar el
                marketing a su público de mayor valor.
              </p>

              <Input label="Ingresa el código" placeholder="G-XXXXXXXXXX" />
            </div>
            <img
              src="/images/analytics-example.svg"
              className="md:mt-auto mt-4"
              alt="ejemplo stripe"
            />
          </div>
        </ModalProvider>
      )}
    </section>
  );
};

const ProviderCard = ({
  icon,
  title,
  description,
  stripeAccount,
  handleModal,
}: {
  icon: string;
  title: string;
  description: string;
  stripeAccount?: string;
  handleModal?: () => void;
}) => {
  return (
    <button onClick={handleModal} className="w-full grow  md:max-w-[348px]">
      <div className="border-2 text-left border-black rounded-xl p-6 ">
        <img src={icon} alt="provider" />
        <div className="flex gap-2 items-center mb-1 mt-2 ">
          <h3 className="text-xl font-bold">{title}</h3>
          <div className="text-xs flex gap-1 items-center w-fit rounded bg-status-success-overlay text-status-success p-1">
            <FaCheck />
            <span>Cuenta: {stripeAccount}</span>
          </div>
        </div>
        <p className="text-iron">{description}</p>
      </div>
    </button>
  );
};
