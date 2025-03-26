import { BsStripe } from "react-icons/bs";
import { FaPaypal } from "react-icons/fa";
import { BrutalButton } from "~/components/common/BrutalButton";
import { Header } from "~/components/layout/Header";
import { cn } from "~/utils/cn";
import { SalesTable } from "./sales/SalesTable";
import { Empty } from "./assets/Empty";
import { IoCopy } from "react-icons/io5";

const LAYOUT_PADDING = "py-16 md:py-10"; // to not set padding at layout level (so brendi's design can be acomplished)

export default function Sales() {
  return (
    <>
      <article
        className={cn(
          " min-h-screen w-full relative box-border inline-block max-w-7xl mx-auto px-4 md:px-[5%] lg:px-0",
          LAYOUT_PADDING
        )}
      >
        <Header title="Ventas" />
        <EmptySales />
        {/* <SalesTable /> */}{" "}
      </article>
    </>
  );
}

const EmptyPayment = () => {
  return (
    <Empty
      illustration={<img className="w-44 mx-auto " src="/sales-empty.webp" />}
      title="  Conecta una pasarela de pagos"
      text={
        <span>
          Conecta tu pasarela preferida, EasyBits colabora con Stripe & PayPal
          para ofrecerte pagos seguros.
        </span>
      }
      footer={
        <div className="flex gap-6 justify-center">
          <BrutalButton className="bg-sea flex gap-2 items-center">
            Conectar PayPal <FaPaypal />
          </BrutalButton>
          <BrutalButton className="bg-[#6772E5] flex gap-2 items-center">
            Conectar Stripe
            <BsStripe />
          </BrutalButton>
        </div>
      }
    />
  );
};

export const EmptySales = () => {
  return (
    <Empty
      illustration={<img className="w-44 mx-auto " src="/sales-empty.webp" />}
      title="Administra tus ventas desde aquí"
      text={
        <span>
          Tus clientes/seguidores te están conociendo. <br />
          ¡Sigue compartiendo tu tienda!
        </span>
      }
      footer={
        <div className="flex gap-6 justify-center">
          <BrutalButton className=" flex gap-2 items-center">
            Copiar link <IoCopy />
          </BrutalButton>
        </div>
      }
    />
  );
};
