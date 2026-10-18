import type { User } from "@prisma/client";

type DnsConfig = {
  clientStatus?: string;
};
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { BiEditAlt } from "react-icons/bi";
import { useFetcher } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { BrutalButtonClose } from "~/components/common/BrutalButtonClose";
import { CopyButton } from "~/components/common/CopyButton";
import { cn } from "~/utils/cn";
import { IoWarningOutline } from "react-icons/io5";
import { FaArrowLeft, FaCheck } from "react-icons/fa";
import { DNSInput } from "./dns_toolkit/DNSInput";
import { APP_HOST_DNS } from "~/lib/appHostDns";

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

export const useDisclosure = ({ user }: { user: User }) => {
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

export const DNSModal = ({ user, isOpen, onOpen, onClose }: { user: User; isOpen: boolean; onOpen: () => void; onClose: () => void }) => {
  const [localHost, setLocalHost] = useState(user.host ?? "");
  const [domain, setDomain] = useState<string>(user.domain || "");
  const fetcher = useFetcher();
  const [isConfigOpen, setIsConfigOpen] = useState(false);
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

  const openDomainConfig = () => {
    setIsConfigOpen(true);
  };

  const handleClose = () => {
    setLocalHost(user.host ?? "");
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
                  containerClassName="h-9"
                  className="h-9 bg-brand-500  text-black"
                >
                  Actualizar
                </BrutalButton>
              }
              value={localHost}
              defaultValue={user.host ?? undefined}
              onChange={(e: ChangeType) => setLocalHost(formatHost(e))}
              error={error}
            />

            {!!user.domain && (
              <DNSInput
                isDisabled
                label="Tu dominio propio "
                mode="domain"
                submitNode={
                  // @todo inject props for disable?
                  <BrutalButton
                    type="button"
                    isLoading={isLoading}
                    onClick={onSubmit}
                    containerClassName="h-9"
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

        {!isConfigOpen && !user.domain && (
          <BrutalButton
            containerClassName="ml-auto mt-auto "
            onClick={() => setIsConfigOpen(true)}
          >
            Agrega tu propio dominio
          </BrutalButton>
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
              editingLabel="Edita el dominio o da clic afuera para cancelar"
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
            {/* Commented out: DNS subdomain hint */}
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
          <Footer
            onClose={onClose}
            isDomain={!!user.domain}
            onClick={openDomainConfig}
          />
        )}
      </Modal>
    </>
  );
};

const Footer = ({
  isDomain,
  onClose,
  onClick,
}: {
  isDomain?: boolean;
  onClose?: () => void;
  onClick?: () => void;
}) => {
  return (
    <nav className="flex justify-between w-full mt-6">
      <BrutalButton onClick={onClose} className="bg-white min-w-10">
        <FaArrowLeft />
      </BrutalButton>
      
      {isDomain && (
        <BrutalButton onClick={onClick}>Editar dominio</BrutalButton>
      )}
    </nav>
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
      <section className="border border-black rounded-b-lg p-1 grid grid-cols-3 text-xs gap-2">
        <span>A</span>
        <div className="flex items-center">
          <p className="truncate"> {user.domain}</p>
          <CopyButton className="ml-1" text={user.domain ?? ""} />
        </div>

        <div className="col-span-1 w-max items-center flex">
          <p className="truncate"> {APP_HOST_DNS.v4}</p>
          <CopyButton className="ml-1" text={APP_HOST_DNS.v4} />
        </div>
      </section>
    </article>
  );
};

// Estado del dominio (`User.dnsConfig`, lo escribe /api/v1/user): «Ready» cuando su DNS ya
// llega a EasyBits. El cert lo emite el servidor solo en el primer acceso; no hay paso ACME.
const DNSConfig = ({ user }: { user: User }) => {
  const ready = (user.dnsConfig as DnsConfig | null)?.clientStatus === "Ready";
  return (
    <article className="w-full flex items-center gap-2">
      {ready ? (
        <FaCheck className="text-green-600" />
      ) : (
        <IoWarningOutline className="text-yellow-600" />
      )}
      <p>
        {ready ? (
          <>
            <strong className="text-brand-500">{user.domain}</strong> ya apunta a EasyBits.
          </>
        ) : (
          <>
            <strong className="text-brand-500">{user.domain}</strong> todavía no apunta a
            EasyBits: agrega el registro de abajo y dale «Verificar».
          </>
        )}
      </p>
    </article>
  );
};

export const EditButton = ({ isDisabled, onClick }: { isDisabled?: boolean; onClick?: () => void }) => {
  return (
    <button
      disabled={isDisabled}
      type="button"
      onClick={onClick}
      className={cn(
        "active:bg-black active:text-white rounded-r-lg h-full p-3 text-xl border-l border-black disabled:bg-gray-300 disabled:text-gray-400"
      )}
    >
      <BiEditAlt />
    </button>
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
    <article className="z-40 fixed inset-0 grid place-content-center">
      <section className="absolute inset-0 bg-black/50 backdrop-blur" ></section>
      <section className="relative max-w-[90%] md:max-w-[800px] w-full md:w-[756px]  mx-auto border-2 border-black bg-white p-6 md:p-8 rounded-2xl flex flex-col items-start gap-6">
        <nav className="flex justify-between items-start gap-4 w-full ">
          <h1 className="text-2xl md:text-3xl font-semibold">
            Usa tu subdominio EasyBits o ¡Agrega el tuyo! 🔥
          </h1>
          <BrutalButtonClose onClick={onClose} />
        </nav>

        {children}
      </section>
    </article>
  );
};

