import { Button } from "~/components/common/Button";
import { PerkItem } from "../plans/Pricing";
import { cn } from "~/utils/cn";
import type { User } from "@prisma/client";
import Edit from "/icons/edit2.svg";
import { useEffect, useState, type FormEvent } from "react";
import { Input } from "~/components/common/Input";
import { Form, useFetcher } from "react-router";
import { useEscape } from "~/hooks/useEscape";

const DEFAULT_PIC =
  "https://images.pexels.com/photos/4839763/pexels-photo-4839763.jpeg?auto=compress&cs=tinysrgb&w=1200";

export const SuscriptionCard = ({ customer }: { customer: unknown }) => {
  return (
    <section
      className={cn(
        "border bg-white max-w-2xl border-black rounded-2xl p-4  mt-8 flex flex-col items-start gap-1",
        "md:p-8 md:gap-2 md:px-6 md:pt-6 md:pb-4"
      )}
    >
      <div
        className={cn(
          "flex flex-wrap w-full justify-between mb-4 gap-3 ",
          "md:flex-nowrap md:gap-0"
        )}
      >
        <h3 className={cn("font-semibold text-xl", "md:text-2xl")}>
          {customer?.subscription || "Plan Starter"}
        </h3>
        <span className={cn("text-xl font-semibold", "md:text-2xl")}>
          $0 mxn/mes
        </span>
      </div>
      <PerkItem perk="Hasta 1 assets" />
      <PerkItem perk="Hasta 1 gigabaytes" />
      <PerkItem perk="Sin acceso al API" />
      <PerkItem perk="Sin acceso a iFrames" />
      <PerkItem perk="Sin acceso a componentes" />
      <PerkItem perk="Sin plantillas" />
      <hr className={cn("bg-tale h-[1px] border-none my-4 w-full", "my-2")} />
      <div
        className={cn(
          "flex justify-between items-center w-full flex-wrap  gap-3",
          "md:flex-nowrap"
        )}
      >
        <p className="text-iron">Próxima fecha de pago: 29 Agosto 2026</p>
        <Form method="post">
          <Button
            mode="primary"
            className="w-full"
            value="redirect_to_portal"
            name="intent"
            type="submit"
          >
            Administrar plan
          </Button>
        </Form>
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
    <section className="border flex-wrap md:flex-nowrap bg-white max-w-2xl border-black rounded-2xl p-4 md:p-8 mt-4 md:mt-8 flex items-center gap-3 md:gap-6">
      <img
        className="w-12 h-12 md:w-24 md:h-24 rounded-full"
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
