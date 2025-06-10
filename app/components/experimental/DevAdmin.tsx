import { useEffect, useState } from "react";
import { Input } from "../common/Input";
import { BrutalButton } from "../common/BrutalButton";
import { useClickOutside } from "~/hooks/useOutsideClick";
import { useFetcher } from "react-router";
import { cn } from "~/utils/cn";

export const DevAdmin = () => {
  const [host, set] = useState("");
  useEffect(() => {
    set(window.location.host);
  }, []);
  const [active, setActive] = useState<null | "access" | "loginAs">(null);
  const ref = useClickOutside({
    isActive: !!active,
    onOutsideClick() {
      console.log("???");
      setActive(null);
    },
  });
  return host.includes("localhost") ? (
    <article
      ref={ref}
      className="fixed bottom-20 border-2 rounded-2xl left-[25%] bg-white border-black py-3 px-6 flex items-center gap-3"
    >
      <span>DEV::ADMIN::{host}</span>
      <Borrame
        isActive={active === "access"}
        onClick={() => setActive("access")}
      />
      <LoginAs
        onClose={() => setActive("")}
        isActive={active === "loginAs"}
        onClick={() => setActive("loginAs")}
      />
    </article>
  ) : null;
};

const Borrame = ({ onClick, isActive }) => {
  return (
    <>
      <button
        onClick={onClick}
        className=" group py-2 px-3 border-black border-2 rounded-full relative"
      >
        🔐
        <p className="invisible group-hover:visible absolute -top-8 px-2 text-gray-800 bg-gray-300 rounded-full">
          {" "}
          Acceso{" "}
        </p>
      </button>

      {isActive === "access" && (
        <section className="bg-white border border-black rounded-2xl absolute w-max px-6 py-4 top-[-330%] left-0 flex flex-col">
          <h2 className="font-bold mb-4">Acceso a usuarios</h2>
          <Input
            className="mb-2"
            label="Correo"
            name="email"
            placeholder="el@mail.com"
          />
          <BrutalButton containerClassName="ml-auto block">
            Dar acceso
          </BrutalButton>
        </section>
      )}
    </>
  );
};

const LoginAs = ({ onClick, isActive, onClose }) => {
  const [email, set] = useState("");
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";
  const handleClick = async () => {
    await fetcher.submit(
      { intent: "create_session", email },
      { method: "post", action: "/api/v1/utils" }
    );
    onClose?.();
  };
  return (
    <article className="relative">
      <button
        onClick={onClick}
        className={cn(
          "group py-2 px-3 border-black border-2 rounded-full relative",
          {
            "bg-gray-300": isActive,
          }
        )}
      >
        🤿
        <p className="invisible group-hover:visible absolute -top-8 px-2 text-gray-800 bg-gray-300 rounded-full w-max">
          {" "}
          Login as{" "}
        </p>
      </button>
      {isActive && (
        <section className="fixed left-[25%] bottom-40 bg-white border-2 p-6 rounded-2xl border-black w-max">
          <h2 className="font-bold">Log in as:</h2>
          <Input
            value={email}
            onChange={(e) => set(e.currentTarget.value)}
            className="my-3"
            placeholder="el@email.com"
          />
          <BrutalButton
            isLoading={isLoading}
            type="button"
            onClick={handleClick}
          >
            Entrar
          </BrutalButton>
        </section>
      )}
    </article>
  );
};
