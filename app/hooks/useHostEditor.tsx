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
import { FaArrowLeft, FaBackward, FaCheck } from "react-icons/fa";

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
  const [domain, setDomain] = useState<string>(user.domain || "");
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

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const openDomainConfig = () => {
    setIsConfigOpen(true);
  };

  const handleClose = () => {
    setLocalHost(user.host);
    setIsConfigOpen(false);
    onClose?.();
  };

  return (
    <>
      <Modal onClose={handleClose} open={isOpen} setOpen={onOpen} user={user}>
        {!isConfigOpen && (
          <>
            <DNSInput
              submitNode={
                // @todo inject props for disable?
                <BrutalButton
                  type="button"
                  isLoading={isLoading}
                  onClick={onSubmit}
                  containerClassName="ml-auto mr-1 h-9"
                  className="h-9 bg-brand-500 text-black"
                >
                  Actualizar
                </BrutalButton>
              }
              value={localHost}
              defaultValue={user.host}
              onChange={(e: ChangeType) => setLocalHost(formatHost(e))}
              error={error}
            />

            {user.domain && (
              <DNSInput
                isDisabled
                label="Tu dominio propio "
                editingLabel="Edita el dominio o da clic afuera para cancelar"
                mode="domain"
                submitNode={
                  // @todo inject props for disable?
                  <BrutalButton
                    type="button"
                    isLoading={isLoading}
                    onClick={onSubmit}
                    containerClassName="ml-auto mr-2 h-9"
                    className="h-9 bg-white"
                  >
                    Actualizar
                  </BrutalButton>
                }
                editButton={
                  <button
                    type="button"
                    onClick={() => setIsConfigOpen(true)}
                    className={cn(
                      "active:bg-black active:text-white rounded-r-lg h-full p-3 text-xl border-l border-black"
                    )}
                  >
                    <BiEditAlt />
                  </button>
                }
                value={user.domain}
                onChange={(e: ChangeType) => setLocalHost(formatHost(e))}
                error={error}
              />
            )}
          </>
        )}

        {isConfigOpen ? (
          <>
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
                  className="h-9 bg-white"
                >
                  Actualizar
                </BrutalButton>
              }
              onChange={(e: ChangeType) => setDomain(e.currentTarget.value)}
              error={error}
            />
            <DNSConfig user={user} />
            <IPsInfo user={user} />
            {/* <p className="text-xs">
              Algunos provedores de DNS solo necesitan el nombre del subdominio:
              <strong>
                {user.dnsConfig?.dnsValidationTarget.split(".")[0]}
              </strong>{" "}
              o @ si es la raíz del dominio
            </p> */}
            <nav className="flex justify-between w-full mt-6">
              <BrutalButton
                onClick={() => setIsConfigOpen(false)}
                className="bg-white min-w-10"
              >
                <FaArrowLeft />
              </BrutalButton>
              <BrutalButton
                isLoading={isLoading}
                onClick={verifyDomain}
                containerClassName="ml-auto"
              >
                Verificar
              </BrutalButton>
            </nav>
          </>
        ) : (
          <nav className="flex justify-between w-full mt-6">
            <BrutalButton onClick={onClose} className="bg-white min-w-10">
              <FaArrowLeft />
            </BrutalButton>
            {!user.domain && (
              <BrutalButton onClick={openDomainConfig}>
                Agregar dominio
              </BrutalButton>
            )}
          </nav>
        )}
      </Modal>
    </>
  );
};

const IPsInfo = ({ user }: { user: User }) => {
  return (
    <article className="w-full ">
      <h2 className="mb-2">
        Y por último, agrega los siguientes registros DNS:
      </h2>
      <section className="border text-sm border-black rounded-t-lg p-1 grid grid-cols-3 border-b-0 gap-2 relative text-black">
        <span className="col-span-1">Tipo de registro</span>
        <span className="col-span-1">Nombre del dominio</span>
        <span className="col-span-1">Valor</span>{" "}
      </section>
      {/* Content */}
      <section className="border border-black border-b-0 p-1 grid grid-cols-3 text-xs gap-2">
        <span>A</span>
        <div className="flex items-center">
          <p className="truncate"> {user.domain}</p>
          <CopyButton className="ml-1" text={user.domain} />
        </div>

        <div className="col-span-1 w-max items-center flex">
          <p className="truncate"> 66.241.125.82</p>
          <CopyButton className="ml-1" text={"66.241.125.82"} />
        </div>
      </section>
      {/* Content */}
      <section className="border border-black rounded-b-lg p-1 grid grid-cols-3 text-xs gap-2">
        <span>AAAA</span>
        <div className="flex items-center">
          <p className="truncate"> {user.domain}</p>
          <CopyButton className="ml-1" text={user.domain} />
        </div>

        <div className="col-span-1 w-max items-center flex">
          <p className="truncate"> 2a09:8280:1::5c:8bf9:0</p>
          <CopyButton className="ml-1" text={"2a09:8280:1::5c:8bf9:0"} />
        </div>
      </section>
    </article>
  );
};

const DNSConfig = ({ user }: { user: User }) => {
  return (
    <>
      {/* Header */}
      <article className="w-full ">
        <h2 className="mb-2">
          Agrega el siguiente registro CNAME a tu proveedor DNS para verificar
          que eres el propietario de {" "}
          <strong className="text-brand-500">{user.domain}</strong>
        </h2>
        <section className="border text-sm text-black border-black rounded-t-lg p-1 grid grid-cols-3 border-b-0 gap-2 relative ">
          <span className="col-span-1 ">Tipo de registro</span>
          <span className="col-span-1">Nombre del dominio</span>
          <span className="col-span-1">Valor</span>{" "}
          {[statuses[0]].includes(user.dnsConfig?.clientStatus) && (
            <div className="absolute text-yellow-600 right-2 top-2">
              <IoWarningOutline />
            </div>
          )}
          {![statuses[0]].includes(user.dnsConfig?.clientStatus) && (
            <div className="absolute text-green-600 right-2 top-2">
              <FaCheck />
            </div>
          )}
        </section>
        {/* Content */}
        <section className="border border-black rounded-b-lg p-1 grid grid-cols-3 place-content-center text-xs gap-2">
          <span className="flex items-center">
            {user.dnsConfig?.dnsValidationInstructions.split(" ")[0]}{" "}
          </span>
          <div className="flex items-center">
            <p className="truncate">
              {" "}
              {user.dnsConfig?.dnsValidationHostname.split(".")[0]}
            </p>
            <CopyButton
              className="ml-1"
              text={user.dnsConfig?.dnsValidationHostname.split(".")[0]}
            />
          </div>

          <div className="col-span-1 w-max items-center flex">
            <p className="truncate"> {user.dnsConfig?.dnsValidationTarget}</p>
            <CopyButton
              className="ml-1"
              text={user.dnsConfig?.dnsValidationTarget}
            />
          </div>
        </section>
      </article>
    </>
  );
};

const DNSInput = ({
  defaultValue,
  isDisabled,
  onChange,
  copyButton,
  mode,
  error,
  value,
  submitNode,
  label = "Tu subdominio actual",
  editingLabel = "Edita tu dominio o da clic afuera para cancelar",
  editButton,
}: {
  defaultValue?: string;
  isDisabled?: boolean;
  copyButton?: ReactNode;
  editButton?: ReactNode;
  mode?: "domain";
  label?: string;
  editingLabel?: string;
  error?: string;
  submitNode?: ReactNode;
  onChange?: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  value: string;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const ref = useClickOutside({
    isActive: isEditing,
    onOutsideClick() {
      setIsEditing(false);
      onChange?.({ currentTarget: { value: defaultValue } });
      // fetcher.data = null; // to remove errors
    },
  });
  const l =
    mode === "domain"
      ? `https://${value}`
      : `https://${defaultValue}.easybits.cloud/tienda`;

  return (
    <article ref={ref} className="w-full ">
      {isEditing ? (
        <p className="mb-2">{editingLabel}</p>
      ) : (
        <p className="mb-2">{label} </p>
      )}

      <section className="flex gap-3  h-12 items-center rounded-xl border border-black">
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
              <CopyButton text={l} className="ml-auto" />
            )}
            {editButton ? (
              editButton
            ) : (
              <button
                disabled={isDisabled}
                type="button"
                onClick={() => setIsEditing(true)}
                className={cn(
                  "active:bg-black active:text-white rounded-r-lg h-full p-3 text-xl border-l border-black"
                )}
              >
                <BiEditAlt />
              </button>
            )}
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
              className="rounded-xl border-brand-500 h-10 focus:border-brand-500 focus:ring-brand-500"
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
      <section className="relative max-w-[800px]  mx-auto border-2 border-black bg-white p-8 rounded-2xl flex flex-col items-start gap-6">
        <nav className="flex justify-between items-start gap-4 w-full ">
          <h1 className="text-2xl md:text-3xl font-semibold">
            Usa tu subdominio EasyBits o ¡Agrega tu propio dominio! 🔥
          </h1>
          <BrutalButtonClose onClick={onClose} />
        </nav>

        {children}
      </section>
    </article>
  );
};
