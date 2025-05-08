import { Modal } from "../common/Modal";
import { useFetcher } from "react-router";
import { FileInput } from "../forms/FileInput";
import { Input } from "../forms/Input";
import { BrutalButton } from "../common/BrutalButton";
import { LuMoonStar, LuSun } from "react-icons/lu";

import { useState } from "react";
import ButtonGroupInput from "../forms/ButtonGroupInput";
import { FaArrowLeft } from "react-icons/fa";
import { cn } from "~/utils/cn";

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
  const [typography, setTypography] = useState();
  const [colorMode, setColorMode] = useState();
  const [hexColor, setHexColor] = useState("#000000");
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
                assetId=""
                actionId={action.id}
                files={files}
                placeholder="Arrastra o selecciona tu logo"
                placeholderClassName="text-black"
                svgClassName="text-black"
                buttonClassName="flex-col p-0 py-4 min-h-[150px] border-black border-2 m-0"
              />
            </div>
            <div className="col-span-8">
              <FileInput
                assetId=""
                actionId={action.id}
                files={files}
                placeholder="Arrastra o selecciona tu foto de portada"
                placeholderClassName="text-black"
                svgClassName="text-black"
                buttonClassName="flex-col p-0 py-4 min-h-[150px] border-black border-2 m-0"
              />
            </div>
          </div>

          {/* colores */}
          <p className="text-lg mt-4 mb-2 font-semibold">Colores</p>
          <p className="text-lg text-brand-gray mb-2">
            Elige el tema de tu sitio
          </p>
          <div className="grid grid-cols-2">
            <ButtonGroupInput
              shadowClassName="bg-black"
              selectedShadowClassName="bg-black"
              options={[
                { value: "light", label: "Light", Icon: LuSun },
                { value: "dark", label: "Dark", Icon: LuMoonStar },
              ]}
              value={colorMode}
              onChange={setColorMode}
              renderOption={(option, isSelected) => (
                <div className="flex items-center justify-start gap-3">
                  <option.Icon />
                  <strong>{option.label}</strong>
                </div>
              )}
            />
          </div>
          <p className="text-lg text-brand-gray mt-4 mb-2">
            Ingresa o elige el color principal
          </p>
          <div className="grid grid-cols-12 items-center gap-4">
            <div className="col-span-4">
              <Input
                name="hexColor"
                type="text"
                maxLength={7}
                prefix={
                  <div
                    style={{ backgroundColor: hexColor }}
                    className={cn("h-6 w-10 rounded-md  border")}
                  />
                }
                value={hexColor}
                onChange={(e) => {
                  // to do this in the input level so we can use this if needed
                  const unmasked = e.target.value.replace("#", "");
                  const masked = `#${unmasked}`;
                  setHexColor(masked);
                }}
              />
            </div>
            <div className="col-span-8">
              <ButtonGroupInput
                className="gap-4"
                shadowClassName="bg-black"
                selectedShadowClassName="bg-black"
                buttonClassName="p-0"
                options={[
                  { value: "#9870ED", label: "purple" },
                  { value: "#E5A000", label: "orange" },
                  { value: "#E46962", label: "red" },
                  { value: "#83DD7E", label: "green" },
                  { value: "#87E1F2", label: "blue" },
                ]}
                value={hexColor}
                onChange={setHexColor}
                renderOption={(option, isSelected) => (
                  <div
                    className={cn("h-full")}
                    style={{ backgroundColor: option.value }}
                  />
                )}
              />
            </div>
          </div>

          {/* tipografía */}
          <p className="text-lg mt-4 mb-2 font-semibold">Tipografía</p>
          <div>
            <ButtonGroupInput
              className="grid grid-cols-2"
              shadowClassName="bg-black"
              selectedShadowClassName="bg-black"
              options={[
                { value: "typo1", label: "Alejandro Sans" },
                { value: "typo2", label: "Comic Sans" },
                { value: "typo3", label: "Roboto" },
                { value: "typo4", label: "Arial" },
              ]}
              value={typography}
              onChange={setTypography}
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
            <BrutalButton mode="ghost" type="button" className="min-w-10">
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
