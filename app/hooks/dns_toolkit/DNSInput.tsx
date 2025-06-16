import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { BrutalButton } from "~/components/common/BrutalButton";
import { CopyButton } from "~/components/common/CopyButton";
import { EditButton } from "../DNSToolkit";

export const DNSInput = ({
  defaultValue,
  isDisabled,
  onChange,
  copyButton,
  mode,
  error,
  value,
  submitNode,
  label = "Tu subdominio actual",
  editingLabel = "Edita tu subdominio o da clic afuera para cancelar",
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
  const isOpen = useRef(false);
  // const [isOpen, setIsOpen] = useState(false);

  const l =
    mode === "domain"
      ? `https://${value}`
      : `https://${defaultValue}.easybits.cloud/tienda`;

  const handleClickEdit = () => {
    console.log("Click", isEditing);
    setIsEditing(true);
    // isOpen.current = true;
  };

  return (
    <article className="w-full">
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
              <EditButton isDisabled={isDisabled} onClick={handleClickEdit} />
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

        {isEditing && (
          <div className="flex ml-auto gap-2">
            <BrutalButton
              type="button"
              onClick={() => setIsEditing(false)}
              mode="ghost"
              containerClassName="h-9"
              className="h-9"
            >
              Cerrar
            </BrutalButton>
            {submitNode}
          </div>
        )}
      </section>
      {isEditing && error && <p className="text-xs text-red-500">{error}</p>}
    </article>
  );
};
