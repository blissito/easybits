import { Button } from "~/components/common/Button";
import { PerkItem } from "../plans/Pricing";
import { cn } from "~/utils/cn";
import type { User } from "@prisma/client";
import Edit from "/icons/edit2.svg";
import { useEffect, useState, type FormEvent } from "react";
import { Input } from "~/components/common/Input";
import { Form, useFetcher } from "react-router";
import { useEscape } from "~/hooks/useEscape";
import { BrutalButton } from "~/components/common/BrutalButton";
import { Switch } from "../../components/forms/Switch";

export const plans: {
  [x: string]: Record<string, number>;
} = {
  Starter: { price: 0, max: 0.5 },
  Creative: { price: 199, max: 50 },
  Expert: { price: 299, max: 200 },
};

export const DEFAULT_PIC =
  "https://images.pexels.com/photos/4839763/pexels-photo-4839763.jpeg?auto=compress&cs=tinysrgb&w=1200";

export const SuscriptionCard = ({
  plan,
  used,
  customer,
}: {
  used: number;
  plan: string;
  customer: unknown;
}) => {
  return (
    <section
      className={cn(
        "border-2 bg-white max-w-2xl border-black rounded-2xl  mt-8"
      )}
    >
      <div className="p-4 md:p-6 flex flex-col items-start">
        <div
          className={cn(
            "flex flex-wrap w-full justify-between mb-2 gap-3 ",
            "md:flex-nowrap md:gap-0"
          )}
        >
          <h3 className={cn("font-semibold text-xl", "md:text-2xl")}>
            {customer?.subscription || "Plan " + plan}
          </h3>
          <span className={cn("text-xl font-semibold", "md:text-2xl")}>
            ${plans[plan].price} mxn/mes
          </span>
        </div>
        <PerkItem perk="Hasta 1 asset en venta" />
        <PerkItem perk="Dashboard de administración" />
        <PerkItem perk="Landing page personalizable para tu asset" />
        <PerkItem perk="Sistema de venta en línea con integración Stripe o Paypal" />
        <PerkItem perk={`Hasta ${plans[plan].max} GB de almacenamiento`} />
      </div>
      <hr className={cn("bg-black h-[1px] border-none  w-full")} />
      <StorageBar current={used} plan={plans[plan]} />

      <hr className={cn("bg-black h-[1px] border-none w-full")} />
      <div
        className={cn(
          "flex justify-between items-center w-full flex-wrap p-4 md:p-6 gap-3",
          "md:flex-nowrap"
        )}
      >
        <p className="text-iron">Obtén más beneficios con el Plan {plan}</p>
        <Form method="post">
          <BrutalButton
            className="w-full"
            value="redirect_to_portal"
            name="intent"
            type="submit"
          >
            Mejorar plan
          </BrutalButton>
        </Form>
      </div>
    </section>
  );
};

const StorageBar = ({
  plan,
  current = 0.4,
}: {
  current: number;
  plan: {
    max: number;
    price: number;
  };
}) => {
  return (
    <section className="w-full p-4 md:p-6">
      <nav className="flex items-center justify-between">
        <p className="font-medium truncate pr-1">Uso del almacenamiento</p>
        <span className="text-sm px-1 text-iron ml-auto">
          {current.toFixed(2)} de {plan.max} GB
        </span>
      </nav>
      <div className="h-[10px] bg-black w-full rounded-full border-2 border-black relative mt-1 overflow-hidden">
        <div
          style={{
            width: `${(current / plan.max) * 100}%`,
          }}
          className={cn(
            "bg-brand-500 w-full absolute inset-0 rounded-full transition-all"
          )}
        />
      </div>
    </section>
  );
};

export const ProfileCard = ({ user }: { user: User }) => {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [isEditing, setIsEditing] = useState(false);
  const handleEdit = () => {
    setIsEditing(true);
  };
  const fetcher = useFetcher();
  const handleSubmit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    setIsEditing(false);

    fetcher.submit(
      {
        intent: "update_profile",
        data: JSON.stringify({
          displayName,
        }),
      },
      {
        method: "post",
        action: "/api/v1/user",
      }
    );
  };

  useEscape(() => setIsEditing(false));

  return (
    <section className="border-2 flex-wrap md:flex-nowrap bg-white max-w-2xl border-black rounded-2xl p-4 md:p-6 mt-4 md:mt-8 flex items-center gap-3 md:gap-6">
      <img
        className="w-12 h-12 md:w-24 md:h-24 rounded-full border-2 border-black "
        src={user.picture || DEFAULT_PIC}
        onError={({ currentTarget }) => {
          currentTarget.onerror = null;
          currentTarget.src = DEFAULT_PIC;
        }}
      />
      <div>
        {isEditing ? (
          <Form onSubmit={handleSubmit}>
            <Input
              autoFocus
              defaultValue={user.displayName}
              onChange={({ currentTarget }) =>
                setDisplayName(currentTarget.value)
              }
            />
          </Form>
        ) : (
          <div className="flex gap-1">
            <h2 className="text-xl md:text-2xl font-semibold">{displayName}</h2>
            <button onClick={handleEdit}>
              <img className="!text-iron" src={Edit} alt="icon" />
            </button>
          </div>
        )}
        <p className="md:text-base text-sm text-iron font-light">
          {user.email}
        </p>
      </div>
    </section>
  );
};

export const Notifications = ({ user }: { user: User }) => {
  const fetcher = useFetcher();
  const handle = (key: string) => (value: boolean) => {
    const update = {
      ...user.notifications,
      [key]: value,
    };

    fetcher.submit(
      {
        intent: "update_profile",
        data: JSON.stringify({
          notifications: update,
        }),
      },
      { method: "post", action: "/api/v1/user" }
    );
  };

  return (
    <section className="border-2 bg-white max-w-2xl border-black rounded-2xl p-4 md:p-6 mt-4 md:mt-8 flex flex-col items-center gap-3 md:gap-6">
      <SwitchItem
        onChange={handle("newsletter")}
        value={user.notifications?.newsletter!}
        title="Newsletter"
        description="Cuando encendido, te enviaremos nuestro newletter regularmente"
      />
      <hr className="w-full bg-black border-none h-[1px]" />
      <SwitchItem
        onChange={handle("sells")}
        value={user.notifications?.sells!}
        title="Ventas"
        description="Si encendido, te enviaremos un correo cada que hagas una venta"
      />
      <hr className="w-full bg-black border-none h-[1px]" />
      <SwitchItem
        onChange={handle("reviews")}
        value={user.notifications?.reviews!}
        title="Nuevas reseñas"
        description="Si activado, te notificaremos cuando tus clientes hagan alguna reseña"
      />
    </section>
  );
};

const SwitchItem = ({
  title,
  value,
  description,
  onChange,
}: {
  value: boolean;
  onChange?: (arg0: boolean) => void;
  title: string;
  description: string;
}) => {
  return (
    <div className="flex justify-between items-center w-full gap-4">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-iron text-sm">{description}</p>
      </div>
      <Switch value={value} onChange={onChange} />
    </div>
  );
};
