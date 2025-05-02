import type { User } from "@prisma/client";
import {
  useEffect,
  useState,
  type ChangeEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { BiEditAlt } from "react-icons/bi";
import { useFetcher } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { BrutalButtonClose } from "~/components/common/BrutalButtonClose";
import { CopyButton } from "~/components/common/CopyButton";
import { useClickOutside } from "./useOutsideClick";

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
    console.log("finish????");
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
          mode="domain"
          value={domain}
          label={"Tu dominio propio"}
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
          onChange={(e: ChangeType) => setDomain(e.currentTarget.value)}
          error={error}
        />

        {/* Header */}
        <article className="w-full">
          <section className="border-2 border-black rounded-t-lg p-1 grid grid-cols-3 border-b-0 gap-2">
            <span className="col-span-1">Tipo de registro</span>
            <span className="col-span-1">Nombre del dominio</span>
            <span className="col-span-1">Valor</span>
          </section>
          {/* Content */}
          <section className="border-2 border-black rounded-b-lg p-1 grid grid-cols-3 text-xs gap-2">
            <span>
              {user.dnsConfig?.dnsValidationInstructions.split(" ")[0]}
            </span>
            <div className="flex items-center">
              <p className="max-w-20 truncate">
                {" "}
                {user.dnsConfig?.dnsValidationHostname}
              </p>
              <CopyButton text={user.dnsConfig?.dnsValidationHostname} />
            </div>

            <div className="col-span-1 w-max items-center flex">
              <p className="max-w-20 truncate">
                {" "}
                {user.dnsConfig?.dnsValidationTarget}
              </p>
              <CopyButton text={user.dnsConfig?.dnsValidationTarget} />
            </div>
          </section>
        </article>

        {/* {!user.domain && (
          <BrutalButton
            // isLoading={isLoading}
            onClick={onSubmit}
            containerClassName="ml-auto"
          >
            Agregar dominio
          </BrutalButton>
        )} */}
      </Modal>
    </>
  );
};

const DNSInput = ({
  onChange,
  mode,
  error,
  value,
  submitNode,
  label = "Tu dominio gratis",
  link,
}: {
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
            <CopyButton
              text={`https://${value}.easybits.cloud/tienda`}
              className="ml-auto"
            />
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="active:bg-black active:text-white rounded-r-lg h-full p-3 text-xl"
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
