import React from "react";
import { Input } from "~/components/common/Input";
import { BrutalButton } from "~/components/common/BrutalButton";

export interface EmailNode {
  id: string;
  title: string;
  trigger: string;
  content: string;
  delay: string;
}

export interface EmailNodeCardProps {
  node: EmailNode;
  isEditing: boolean;
  editValue: string;
  editContent: string;
  editDelay: string;
  onEditClick: () => void;
  onEditChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  onContentChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  onDelaySelectChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onDelayInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onEditKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onDelete: () => void;
  onSave: () => void;
  onCancel: () => void;
}

const DELAY_OPTIONS = [
  { label: "Inmediatamente", value: "in 0 minutes" },
  { label: "En 1 hora", value: "in 1 hour" },
  { label: "En 6 horas", value: "in 6 hours" },
  { label: "En 1 día", value: "in 1 day" },
  { label: "En 2 días", value: "in 2 days" },
  { label: "En 1 semana", value: "in 1 week" },
  { label: "Personalizado...", value: "custom" },
];

export const EmailNodeCard: React.FC<EmailNodeCardProps> = ({
  node,
  isEditing,
  editValue,
  editContent,
  editDelay,
  onEditClick,
  onEditChange,
  onContentChange,
  onDelaySelectChange,
  onDelayInputChange,
  onEditKeyDown,
  onDelete,
  onSave,
  onCancel,
}) => {
  const isCustom =
    editDelay &&
    !DELAY_OPTIONS.some((opt) => opt.value === editDelay) &&
    editDelay !== "";

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-2 w-full flex flex-col items-center border border-gray-200 relative">
      <button
        onClick={onDelete}
        className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
        title="Eliminar"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
      {isEditing ? (
        <>
          <Input
            value={editValue}
            onChange={onEditChange}
            onKeyDown={onEditKeyDown}
            inputClassName="font-semibold text-lg text-center border-b border-blue-400 focus:outline-none focus:border-blue-600 mb-1"
            maxLength={40}
          />
          <div className="w-full mt-2 flex flex-col gap-2">
            <label className="text-sm font-medium">
              Tiempo de espera antes de enviar:
            </label>
            <select
              className="rounded-lg border border-gray-300 px-3 py-2 text-base"
              value={isCustom ? "custom" : editDelay}
              onChange={onDelaySelectChange}
            >
              {DELAY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {(editDelay === "custom" || isCustom) && (
              <Input
                value={isCustom ? editDelay : ""}
                onChange={onDelayInputChange}
                placeholder="Ej: in 3 days, in 5 hours, at 10:00 am"
                className="w-full mt-1"
                inputClassName="w-full text-base border border-gray-300"
              />
            )}
          </div>
          <Input
            type="textarea"
            value={editContent}
            onChange={onContentChange}
            className="w-full mt-2 h-full"
            inputClassName="w-full min-h-[320px] text-base border border-gray-300"
            placeholder="Contenido markdown de la entrega..."
          />
          <nav className="flex items-center justify-end w-full gap-3">
            <BrutalButton
              mode="ghost"
              onClick={onCancel}
              containerClassName="mt-4"
            >
              Cancelar
            </BrutalButton>
            <BrutalButton onClick={onSave} containerClassName="mt-4">
              Guardar
            </BrutalButton>
          </nav>
        </>
      ) : (
        <>
          <span
            className="font-semibold text-lg mb-1 cursor-pointer hover:underline"
            onClick={onEditClick}
            title="Editar título y contenido"
          >
            {node.title}
          </span>
          <span className="text-sm text-gray-500 mb-2">{node.trigger}</span>
          <div className="w-full text-gray-700 text-sm mt-1 line-clamp-3 whitespace-pre-line">
            {node.content ? (
              node.content.slice(0, 120) +
              (node.content.length > 120 ? "..." : "")
            ) : (
              <span className="italic text-gray-400">Sin contenido</span>
            )}
          </div>
          <div className="w-full text-xs text-gray-500 mt-2 italic">
            {node.delay ? `Se enviará: ${node.delay}` : ""}
          </div>
        </>
      )}
    </div>
  );
};
