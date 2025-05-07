import { Input } from "../forms/Input";
import { Modal } from "../common/Modal";
import { SelectInput } from "../forms/SelectInput";
import { useFetcher } from "react-router";
import { FileInput } from "../forms/FileInput";
import { BrutalButton } from "../common/BrutalButton";
import { LuMoonStar, LuSun } from "react-icons/lu";

import { useState } from "react";
import ButtonGroupInput from "../forms/ButtonGroupInput";
import { FaArrowLeft } from "react-icons/fa";

export default function StoreConfig({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const action = "";
  const fetcher = useFetcher();
  const handleSubmit = () => {};
  const files = [];
  const [selectedColor, setColor] = useState();
  const [selectedTypo, setTypo] = useState();
  return (
    <>
      <Modal
        mode="drawer"
        containerClassName="z-50"
        isOpen={true}
        title={"Personaliza el look de tu sitio"}
        onClose={onClose}
      >
        <fetcher.Form
          onSubmit={handleSubmit}
          className="w-full h-max flex flex-col"
        >
          {/* logo y portada */}
          <p className="text-lg my-2 font-semibold">Logo y Portada</p>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-4">
              <FileInput
                actionId={action.id}
                files={files}
                placeholder="Arrastra o selecciona tu logo"
                isCustom
              />
            </div>
            <div className="col-span-8">
              <FileInput
                actionId={action.id}
                files={files}
                placeholder="Arrastra o selecciona tu foto de portada"
                isCustom
              />
            </div>
          </div>

          {/* colores */}
          <p className="text-lg my-4 font-semibold">Colores</p>
          <p className="text-lg text-brand-gray mb-4">
            Elige el tema de tu sitio
          </p>
          <div className="grid grid-cols-2">
            <ButtonGroupInput
              // selectedButtonClassName="bg-green-500" ejemplos que podemos customizar mas si queremos siuuu
              // selectedLabelClassName="bg-red-500"
              options={[
                { value: "light", label: "Light", Icon: LuSun },
                { value: "dark", label: "Dark", Icon: LuMoonStar },
              ]}
              value={selectedColor}
              onChange={setColor}
              renderOption={(option, isSelected) => (
                <div className="flex items-center justify-start gap-3">
                  <option.Icon />
                  <strong>{option.label}</strong>
                </div>
              )}
            />
          </div>

          {/* tipografía */}
          <p className="text-lg my-4 font-semibold">Tipografía</p>
          <div>
            <ButtonGroupInput
              // selectedButtonClassName="bg-green-500" ejemplos que podemos customizar mas si queremos siuuu
              // selectedLabelClassName="bg-red-500"
              className="grid grid-cols-2"
              // shadowClassName="col-span-1"
              // buttonClassName="col-span-1"
              options={[
                { value: "typo1", label: "Alejandro Sans" },
                { value: "typo2", label: "Comic Sans" },
                { value: "typo3", label: "Roboto" },
                { value: "typo4", label: "Arial" },
              ]}
              value={selectedTypo}
              onChange={setTypo}
              renderOption={(option, isSelected) => (
                <div className="text-start">
                  {/* use the current font idk how */}
                  <h2 className="text-xl font-semibold">Título</h2>
                  <p className="text-lg text-brand-gray mb-2">subtítulo</p>
                  <p className="text-md text-brand-gray">{option.label}</p>
                </div>
              )}
            />
          </div>

          <div className="flex justify-between gap-2 mt-4">
            <BrutalButton mode="ghost" type="button" className="w-auto">
              <FaArrowLeft />
            </BrutalButton>
            <BrutalButton isLoading={fetcher.state !== "idle"} type="submit">
              Continuar
            </BrutalButton>
          </div>
        </fetcher.Form>
      </Modal>
    </>
  );
}
