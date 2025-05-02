import type { User } from "@prisma/client";
import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { BiEditAlt } from "react-icons/bi";
import { useFetcher } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { BrutalButtonClose } from "~/components/common/BrutalButtonClose";
import { CopyButton } from "~/components/common/CopyButton";
import { useClickOutside } from "./useOutsideClick";
import { cn } from "~/utils/cn";
import { IoWarningOutline } from "react-icons/io5";
import { FaCheck } from "react-icons/fa";

const statuses = ["Awaiting configuration", "Awaiting certificates"];

type ChangeType = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;

const formatHost = (e: ChangeType) => {
  let f = e.currentTarget.value.trim();
  f = f.replace(".", "");
  f = f.replace(":", "");
  f = f.replace(";", "");
  f = f.replace("ñ", "");
  f = f.replace("Ñ", "");
  // setHost(f);
  return f;
};

export const useHostEditor = ({ user }: { user: User }) => {
  const [open, setOpen] = useState(false);
  const onOpen = () => {
    setOpen(true);
  };
  const onClose = () => {
    setOpen(false);
  };

  return {
    onOpen,
    onClose,
    isOpen: open,
  };
};

export const DNSModal = ({ user, isOpen, onOpen, onClose }) => {
  const [localHost, setLocalHost] = useState(user.host);
  const [domain, setDomain] = useState(user.domain || "no-configurado");
  const fetcher = useFetcher();
  const error = fetcher.data?.error;
  const isLoading = fetcher.state !== "idle";
  const onSubmit = async () => {
    await fetcher.submit(
      {
        intent: "update_host",
        host: localHost,
        userId: user.id,
      },
      { method: "post", action: "/api/v1/user" }
    );
  };

  const updateDomain = async () => {
    await fetcher.submit(
      {
        intent: "update_domain",
        domain,
        userId: user.id,
      },
      { method: "post", action: "/api/v1/user" }
    );
  };

  useEffect(() => {
    if (user.domain) {
      updateDomain();
    }
  }, []);

  const verifyDomain = () => {
    fetcher.submit(
      {
        intent: "check_domain",
        domain,
      },
      { method: "post", action: "/api/v1/user" }
    );
  };

  return (
    <>
      <Modal onClose={onClose} open={isOpen} setOpen={onOpen} user={user}>
        <DNSInput
          submitNode={
            // @todo inject props for disable?
            <BrutalButton
              type="button"
              isLoading={isLoading}
              onClick={onSubmit}
              containerClassName="ml-auto mr-2 h-9"
              className="h-9"
            >
              Actualizar
            </BrutalButton>
          }
          value={localHost}
          onChange={(e: ChangeType) => setLocalHost(formatHost(e))}
          error={error}
        />
        <hr className="w-full my-2" />
        <DNSInput
          copyButton={
            !user.domain ? (
              <div className="ml-auto text-yellow-600">
                <IoWarningOutline />
              </div>
            ) : undefined
          }
          mode="domain"
          value={domain}
          label={"Tu dominio propio"}
          submitNode={
            // @todo inject props for disable?
            <BrutalButton
              type="button"
              isLoading={isLoading}
              onClick={updateDomain}
              containerClassName="ml-auto mr-2 h-9"
              className="h-9"
            >
              Actualizar
            </BrutalButton>
          }
          onChange={(e: ChangeType) => setDomain(e.currentTarget.value)}
          error={error}
        />
        <DNSConfig user={user} />
        <IPsInfo user={user} />
        <BrutalButton
          isLoading={isLoading}
          onClick={verifyDomain}
          containerClassName="ml-auto"
        >
          Verificar
        </BrutalButton>
      </Modal>
    </>
  );
};

const IPsInfo = ({ user }: { user: User }) => {
  return (
    <article className="w-full mt-6">
      <h2 className="mb-2">
        Agrega estas entradas DNS para dirigir el tráfico
      </h2>
      <section className="border-2 border-black rounded-t-lg p-1 grid grid-cols-3 border-b-0 gap-2 relative text-gray-500">
        <span className="col-span-1">Tipo de registro</span>
        <span className="col-span-1">Nombre del dominio</span>
        <span className="col-span-1">Valor</span>{" "}
      </section>
      {/* Content */}
      <section className="border-2 border-black border-b-0 p-1 grid grid-cols-3 text-xs gap-2">
        <span>A</span>
        <div className="flex items-center">
          <p className="truncate"> {user.domain}</p>
          <CopyButton text={user.domain} />
        </div>

        <div className="col-span-1 w-max items-center flex">
          <p className="truncate"> 66.241.125.82</p>
          <CopyButton text={"66.241.125.82"} />
        </div>
      </section>
      {/* Content */}
      <section className="border-2 border-black rounded-b-lg p-1 grid grid-cols-3 text-xs gap-2">
        <span>AAAA</span>
        <div className="flex items-center">
          <p className="truncate"> {user.domain}</p>
          <CopyButton text={user.domain} />
        </div>

        <div className="col-span-1 w-max items-center flex">
          <p className="truncate"> 2a09:8280:1::5c:8bf9:0</p>
          <CopyButton text={"2a09:8280:1::5c:8bf9:0"} />
        </div>
      </section>
    </article>
  );
};

const DNSConfig = ({ user }: { user: User }) => {
  return (
    <>
      {/* Header */}
      <article className="w-full my-6">
        <h2 className="mb-2">
          Agrega el siguiente registro CNAME a tu proveedor DNS para verificar
          que eres el propietario de {" "}
          <strong className="text-brand-500">{user.domain}</strong>
        </h2>
        <section className="border-2 border-black rounded-t-lg p-1 grid grid-cols-3 border-b-0 gap-2 relative text-gray-500">
          <span className="col-span-1">Tipo de registro</span>
          <span className="col-span-1">Nombre del dominio</span>
          <span className="col-span-1">Valor</span>{" "}
          {user.dnsConfig?.clientStatus !== "Ready" && (
            <div className="absolute text-yellow-600 right-2 top-2">
              <IoWarningOutline />
            </div>
          )}
          {user.dnsConfig?.clientStatus === "Ready" && (
            <div className="absolute text-green-600 right-2 top-2">
              <FaCheck />
            </div>
          )}
        </section>
        {/* Content */}
        <section className="border-2 border-black rounded-b-lg p-1 grid grid-cols-3 text-xs gap-2">
          <span>{user.dnsConfig?.dnsValidationInstructions.split(" ")[0]}</span>
          <div className="flex items-center">
            <p className="truncate">
              {" "}
              {user.dnsConfig?.dnsValidationHostname.split(".")[0]}
            </p>
            <CopyButton
              text={user.dnsConfig?.dnsValidationHostname.split(".")[0]}
            />
          </div>

          <div className="col-span-1 w-max items-center flex">
            <p className="truncate"> {user.dnsConfig?.dnsValidationTarget}</p>
            <CopyButton text={user.dnsConfig?.dnsValidationTarget} />
          </div>
        </section>
      </article>
    </>
  );
};

const DNSInput = ({
  onChange,
  copyButton,
  mode,
  error,
  value,
  submitNode,
  label = "Tu dominio gratis",
  link,
}: {
  copyButton?: ReactNode;
  mode?: "domain";
  label?: string;
  error?: string;
  submitNode?: ReactNode;
  onChange?: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  value: string;
  link?: string;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const ref = useClickOutside({
    isActive: isEditing,
    onOutsideClick() {
      setIsEditing(false);
      // fetcher.data = null; // to remove errors
    },
  });
  const l =
    link || mode === "domain"
      ? `https://${value}/tienda`
      : `https://${value}.easybits.cloud/tienda`;
  return (
    <article ref={ref} className="w-full">
      <p className="mb-2">{label}</p>
      <section className="flex gap-3 items-center rounded-xl border-2 border-black">
        {!isEditing && (
          <span className="text-md p-1 border-brand-500 rounded-lg border ml-1">
            {l}
          </span>
        )}

        {!isEditing && (
          <>
            {copyButton ? (
              copyButton
            ) : (
              <CopyButton
                text={`https://${value}.easybits.cloud/tienda`}
                className="ml-auto"
              />
            )}
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className={cn(
                "active:bg-black active:text-white rounded-r-lg h-full p-3 text-xl"
              )}
            >
              <BiEditAlt />
            </button>
          </>
        )}

        {isEditing && (
          <div className="p-1 flex items-baseline gap-1">
            {mode !== "domain" && <p>https://</p>}
            <input
              autoFocus
              value={value}
              onChange={onChange}
              // onBlur={toggleIsEditing}
              type="text"
              className="rounded-xl border-brand-500"
            />
            {mode !== "domain" && <p>.easybits.cloud</p>}
          </div>
        )}

        {isEditing && submitNode}
      </section>
      {isEditing && error && <p className="text-xs text-red-500">{error}</p>}
    </article>
  );
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
      if (e.key === "Escape") {
        onClose?.();
      }
    };

    if (!open) {
      return () => {
        document.body.style.overflow = "auto";
        removeEventListener("keydown", escHanlder);
      };
    }

    addEventListener("keydown", escHanlder);
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "auto";
      removeEventListener("keydown", escHanlder);
    };
  }, [open]);

  if (!open) return null;
  return (
    <article className="fixed inset-0 z-20 grid place-content-center">
      <section className="absolute inset-0 bg-black/50 backdrop-blur"></section>
      <section className="relative bg-white p-6 rounded-2xl flex flex-col items-start gap-3">
        <nav className="flex justify-between gap-4">
          <h1 className="text-xl font-bold">
            Usa tu subdominio EasyBits o ¡Agrega tu propio dominio! 🔥
          </h1>
          <BrutalButtonClose onClick={onClose} />
        </nav>
        <hr className="my-2" />
        {children}
      </section>
    </article>
  );
};
