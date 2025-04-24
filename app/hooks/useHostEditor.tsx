import type { User } from "@prisma/client";
import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { FaWindowClose } from "react-icons/fa";
import { useFetcher } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { BrutalButtonClose } from "~/components/common/BrutalButtonClose";
import { Input } from "~/components/common/Input";

export const useHostEditor = ({ user }: { user: User }) => {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState(user.host || "");

  const formatHost = (e: ChangeEvent<HTMLInputElement>) => {
    let f = e.currentTarget.value.trim();
    f = f.replace(".", "");
    f = f.replace(":", "");
    f = f.replace(";", "");
    f = f.replace("ñ", "");
    f = f.replace("Ñ", "");
    setHost(f);
  };

  const onOpen = () => {
    setOpen(true);
  };
  const onClose = () => {
    setHost(user.host || "");
    setOpen(false);
    fetcher.data = null;
  };

  const fetcher = useFetcher();
  const error = fetcher.data?.error;
  const isLoading = fetcher.state !== "idle";

  const onSubmit = async () => {
    await fetcher.submit(
      {
        intent: "update_host",
        host,
        userId: user.id,
      },
      { method: "post", action: "/api/v1/user" }
    );
  };

  return {
    onOpen,
    onClose,
    isOpen: open,
    Modal: () => (
      <>
        <Modal onClose={onClose} open={open} setOpen={setOpen} user={user}>
          <div className="flex items-end gap-2 w-full">
            <p className="">https://</p>
            <Input
              onChange={formatHost}
              value={host}
              placeholder="mi-negocio"
              label="Selecciona un subdominio:"
              className="my-[-10px]"
            />
            <p className="">.easybits.cloud</p>
          </div>
          <p className="text-xs text-red-500">{error}</p>
          <BrutalButton
            isLoading={isLoading}
            onClick={onSubmit}
            isDisabled={host === user.host}
            containerClassName="ml-auto"
          >
            Actualizar
          </BrutalButton>
        </Modal>
      </>
    ),
  };
};

const Modal = ({
  user,
  open,
  setOpen,
  children,
  onClose,
}: {
  onClose?: () => void;
  children: ReactNode;
  user: User;
  setOpen: (bool: boolean) => void;
  open: boolean;
}) => {
  useEffect(() => {
    const escHanlder = (e: KeyboardEvent) => {
      if (!open)
        return () => {
          document.body.style.overflow = "auto";
          removeEventListener("keydown", escHanlder);
        };

      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    addEventListener("keydown", escHanlder);
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "auto";
      removeEventListener("keydown", escHanlder);
    };
  }, []);

  if (!open) return null;
  return (
    <article className="fixed inset-0 z-20 grid place-content-center">
      <section className="absolute inset-0 bg-black/50 backdrop-blur"></section>
      <section className="relative bg-white p-6 rounded-2xl flex flex-col items-start gap-3">
        <nav className="flex justify-between gap-4">
          <h1 className="text-xl">
            Editar el nombre de tu subdominio gratuito
          </h1>
          <BrutalButtonClose onClick={onClose} />
        </nav>
        <hr className="my-2" />
        {children}
      </section>
    </article>
  );
};
