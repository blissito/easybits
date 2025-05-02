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
  const [isEditing, setIsEditing] = useState(true);
  const [localHost, setLocalHost] = useState(user.host);
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
          ref={useClickOutside({
            isActive: isEditing,
            onOutsideClick() {
              setIsEditing(false);
              fetcher.data = null; // to remove errors
            },
          })}
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
          isEditing={isEditing}
          onEditClick={() => setIsEditing(true)}
          icon={(link: string) => <CopyButton text={link} />}
          onChange={(e: ChangeType) => setLocalHost(formatHost(e))}
          value={isEditing ? localHost : user.host}
          error={error}
        />

        <BrutalButton
          // isLoading={isLoading}
          onClick={onSubmit}
          isDisabled={isEditing}
          containerClassName="ml-auto"
        >
          Agregar dominio
        </BrutalButton>
      </Modal>
    </>
  );
};

const DNSInput = ({
  onChange,
  error,
  value,
  icon,
  ref,
  onEditClick,
  isEditing,

  submitNode,
}: {
  error?: string;
  ref?: RefObject<HTMLElement | null>;
  submitNode?: ReactNode;
  isEditing?: boolean;
  onEditClick?: () => void;
  icon?: (arg0: string) => ReactNode;
  onChange?: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  value: string;
}) => {
  return (
    <article className="w-full" ref={ref}>
      <p className="mb-2">Tu subdominio actual</p>
      <section className="flex gap-3 items-center rounded-xl border-2 border-black">
        {!isEditing && (
          <span className="text-xl p-px border-brand-500 rounded-lg border ml-1">
            https://{value}.easybits.cloud
          </span>
        )}

        {!isEditing && (
          <>
            <CopyButton
              text={`https://${value}.easybits.cloud`}
              className="ml-auto"
            />
            <button
              type="button"
              onClick={onEditClick}
              className="active:bg-black active:text-white rounded-r-lg h-full p-3 text-xl"
            >
              <BiEditAlt />
            </button>
          </>
        )}

        {isEditing && (
          <div className="p-1 flex items-baseline gap-1">
            <p>https://</p>
            <input
              autoFocus
              value={value}
              onChange={onChange}
              // onBlur={toggleIsEditing}
              type="text"
              className="rounded-xl border-brand-500"
            />
            <p>.easybits.cloud</p>
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
        setOpen(false);
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
