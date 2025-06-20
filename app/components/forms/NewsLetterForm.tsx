import type { Asset, File as AssetFile } from "@prisma/client";
import {
  FaChevronCircleRight,
  FaPlusCircle,
  FaRegPaperPlane,
} from "react-icons/fa";
import { useFetcher } from "react-router";
import { Input } from "../common/Input";
import { BrutalButton } from "../common/BrutalButton";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { SelectInput } from "./SelectInput";
import { FileInput } from "./FileInput";
import toast from "react-hot-toast";

export type Action = {
  assetId: string;
  name: string;
  intent: "send_email";
  gap: "in 1 week";
  index?: number;
  id?: string;
  markdown?: string;
};

export const NewsLetterMicroApp = ({
  asset,
  files,
}: {
  asset: Asset;
  files: File[];
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const initial: Action = {
    intent: "send_email",
    name: "Nuevo envío " + asset.actions.length,
    assetId: asset.id,
    gap: "in 1 week",
  };
  const [editing, setEditing] = useState<Action>(initial);

  const onClose = () => {
    setIsOpen(false);
    setEditing(initial);
  };

  const handleBlockClick = (action: Action) => () => {
    setIsOpen(true);
    setEditing(action);
  };

  return (
    <>
      <Drawer onClose={onClose} isOpen={isOpen}>
        <ActionForm
          files={files}
          assetId={asset.id}
          onSubmit={onClose}
          action={editing}
        />
        <TestEmailForm action={editing || {}} />
      </Drawer>
      <article className="grid lg:grid-cols-3 grid-cols-2 place-items-stretch gap-3">
        {(asset.actions as Action[])?.map((action) => (
          <ActionBlock
            key={action.id}
            onClick={handleBlockClick(action)}
            action={action}
          />
        ))}
        <AddButton onClick={() => setIsOpen(true)} />
      </article>
    </>
  );
};

const TestEmailForm = ({
  action,
  onSubmit,
}: {
  onSubmit?: () => void;
  action: Action;
}) => {
  const fetcher = useFetcher();
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    formData.set("intent", "test_action_email");
    formData.set("action", JSON.stringify(action));
    fetcher.submit(formData, {
      method: "post",
      action: "/api/v1/utils",
    });
    onSubmit?.();
    toast.success("Se ha enviado el correo de prueba", {
      style: {
        border: "2px solid #000000",
        padding: "16px",
        color: "#000000",
      },
      iconTheme: {
        primary: "#8BB236",
        secondary: "#FFFAEE",
      },
    });
  };
  return (
    <section className=" bg-blue-400/20 p-12 rounded-3xl border-2 border-blue-500 my-4">
      <h2 className="text-2xl">Prueba tu correo</h2>
      <fetcher.Form onSubmit={handleSubmit} className="flex flex-col">
        <Input name="emails" />
        <BrutalButton
          type="submit"
          className="flex items-center gap-4"
          containerClassName="ml-auto w-max"
          mode="ghost"
          isLoading={fetcher.state !== "idle"}
        >
          Envíar correo de prueba <FaRegPaperPlane />
        </BrutalButton>
      </fetcher.Form>
    </section>
  );
};

const AddButton = ({ onClick }: { onClick?: () => void }) => {
  return (
    <button
      onClick={onClick}
      type="button"
      className="border border-gray-400 rounded-md grid place-content-center hover:scale-95 active:scale-90 transition-all min-h-[82px]"
    >
      <FaPlusCircle />
    </button>
  );
};

const ActionBlock = ({
  action,
  onClick,
}: {
  onClick?: () => void;
  action: Action;
}) => {
  return (
    <>
      <button
        onClick={onClick}
        type="button"
        className="bg-blue-400/10 rounded-md p-4 border border-blue-400 relative active:scale-95 transition-all"
      >
        <p className="w-max bg-yellow-500/40 p-1 rounded absolute -bottom-3 -right-3">
          {action.gap}
        </p>
        <span className="absolute -right-2 bg-white top-[40%]">
          <FaChevronCircleRight />
        </span>
        <span>#{action.index}</span>
        <h2>{action.name}</h2>
      </button>
    </>
  );
};

const Drawer = ({
  isOpen,
  children,
  onClose,
}: {
  children?: ReactNode;
  isOpen?: boolean;
  onClose?: () => void;
}) => {
  const bodyRef = useRef<HTMLElement>(null);
  useEffect(() => {
    bodyRef.current = document.body;
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      e.key === "Escape" ? onClose?.() : undefined;
    };
    if (isOpen) {
      document.addEventListener("keydown", handler);
    }
    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, [isOpen]);

  if (!bodyRef.current || !isOpen) return null;
  return createPortal(
    <>
      <motion.button
        initial={{
          opacity: 0,
          filter: "blur(9px)",
        }}
        animate={{
          filter: "blur(0px)",
          opacity: 1,
        }}
        id="overlay"
        type="button"
        className="fixed bg-brand-500/20 inset-0 z-10 backdrop-blur-sm hover:cursor-grab"
      />
      <motion.section
        // onClick={onClose} // @todo
        transition={{ type: "spring", bounce: 0 }}
        initial={{
          x: 30,
          filter: "blur(4px)",
        }}
        animate={{
          filter: "blur(0px)",
          x: 0,
        }}
        id="card"
        className="h-full rounded-md fixed inset-0 z-10 flex justify-end"
      >
        <main
          className="p-8 rounded-l-2xl shadow-lg w-[60%] bg-white overflow-y-scroll"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </main>
      </motion.section>
    </>,
    bodyRef.current
  );
};

const ActionForm = ({
  action,
  onSubmit,
  assetId,
  files,
}: {
  files: AssetFile[];
  assetId: string;
  onSubmit?: () => void;
  action: Action;
}) => {
  const fetcher = useFetcher();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    await fetcher.submit(
      {
        intent: "update_asset_action",
        assetId,
        action: JSON.stringify({
          ...action,
          ...Object.fromEntries(new FormData(e.currentTarget)),
        }),
      },
      {
        action: "/api/v1/assets",
        method: "post",
      }
    );
    onSubmit?.();
  };

  const hanbdleDelete = async () => {
    if (!confirm("Esta acción no se puede deshacer")) return;

    await fetcher.submit(
      {
        intent: "remove_asset_action",
        assetId,
        actionIndex: action.index!,
      },
      {
        action: "/api/v1/assets",
        method: "post",
      }
    );
    onSubmit?.();
  };

  return (
    <fetcher.Form
      onSubmit={handleSubmit}
      className="w-full h-max flex flex-col"
    >
      <h2 className="text-2xl my-4">Edita la acción</h2>
      <Input label="Asunto" defaultValue={action.name} name="name" />
      <SelectInput
        name="intent"
        defaultValue="send_email"
        placeholder="Selecciona una acción"
        options={[
          {
            label: "Envío de correo",
            value: "send_email",
          },
        ]}
      />
      <Input
        defaultValue={action.markdown}
        name="markdown"
        type="textarea"
        className="mb-4"
      />
      <FileInput actionId={action.id} files={files} assetId={assetId} />
      <SelectInput
        placeholder="Ventana de envío"
        name="gap"
        defaultValue={action.gap}
        label="Selecciona la ventana de envío para el siguiente"
        options={[
          {
            value: "in 1 week",
            label: "En 1 semana",
          },
          {
            value: "in 1 day",
            label: "En 1 día",
          },
          {
            value: "in 1 month",
            label: "En 1 mes",
          },
          {
            value: "in 1 hour",
            label: "En 1 hora",
          },
          {
            value: "in 1 minute",
            label: "En 1 minuto",
          },
        ]}
      />
      <div className="flex justify-end gap-2">
        <BrutalButton
          mode="danger"
          isDisabled={fetcher.state !== "idle"}
          type="button"
          onClick={hanbdleDelete}
        >
          Eliminar
        </BrutalButton>
        <BrutalButton isLoading={fetcher.state !== "idle"} type="submit">
          Guardar
        </BrutalButton>
      </div>
    </fetcher.Form>
  );
};
