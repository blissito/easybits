import { useEffect, useState } from "react";
import { Input } from "../common/Input";
import { BrutalButton } from "../common/BrutalButton";
import { useClickOutside } from "~/hooks/useOutsideClick";
import { useFetcher } from "react-router";
import { cn } from "~/utils/cn";
import { IoClose } from "react-icons/io5";

export const DevAdmin = () => {
  const [host, set] = useState("");
  useEffect(() => {
    set(window.location.host);
  }, []);
  const [active, setActive] = useState<null | "access" | "loginAs">(null);
  const [isOpen, setIsOpen] = useState(true);
  const ref = useClickOutside({
    isActive: !!active,
    onOutsideClick() {
      setActive(null);
    },
  });
  const remove = () => {
    setIsOpen(false);
  };
  if (!isOpen) return null;
  return host.includes("localhost") ? (
    <article
      ref={ref}
      className="fixed bottom-20 border-2 rounded-2xl left-[25%] bg-white border-black py-3 px-6 flex items-center gap-3 z-50"
    >
      <button
        onClick={remove}
        className="enabled:active:bg-gray-200 p-1 enabled:hover:bg-gray-100 border border-black rounded-full"
      >
        <IoClose />
      </button>
      <span>DEV::ADMIN::{host}</span>
      <Access
        isActive={active === "access"}
        onClick={() => setActive("access")}
        onClose={() => setActive(null)}
      />
      <LoginAs
        onClose={() => setActive(null)}
        isActive={active === "loginAs"}
        onClick={() => setActive("loginAs")}
      />
    </article>
  ) : null;
};

const Access = ({ onClose, onClick, isActive }) => {
  const [email, set] = useState("");
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";
  const handleClick = async () => {
    await fetcher.submit(
      { intent: "enroll_user", email },
      { method: "post", action: "/api/v1/utils" }
    );
    onClose?.();
  };
  return (
    <>
      <button
        onClick={onClick}
        className={cn(
          " group py-2 px-3 border-black border-2 rounded-full relative",
          {
            "bg-gray-200": isActive,
          }
        )}
      >
        🔐
        <p className="invisible group-hover:visible absolute -top-8 px-2 text-gray-800 bg-gray-300 rounded-full">
          {" "}
          Enrollment{" "}
        </p>
      </button>

      {isActive && (
        <section className="bg-white border-2 border-black rounded-2xl absolute w-max px-6 py-4 top-[-330%] left-0 flex flex-col">
          <h2 className="font-bold mb-4">Acceso a usuarios</h2>
          <Input
            className="mb-2"
            label="Email"
            name="email"
            placeholder="el@mail.com"
            onChange={(e) => set(e.currentTarget.value)}
          />
          <BrutalButton
            type="button"
            onClick={handleClick}
            isLoading={isLoading}
            containerClassName="ml-auto block"
          >
            Grant access
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
            "bg-gray-200": isActive,
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
        <section className="fixed left-[25%] bottom-40 bg-white border-2 p-6 rounded-2xl border-black w-max flex flex-col">
          <h2 className="font-bold">Log in as:</h2>
          <Input
            label="Email"
            value={email}
            onChange={(e) => set(e.currentTarget.value)}
            className="my-3"
            placeholder="el@email.com"
          />
          <BrutalButton
            containerClassName="ml-auto block"
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
