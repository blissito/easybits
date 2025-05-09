import { FileInput } from "../forms/FileInput";
import { Input } from "../forms/Input";
import { LuMoonStar, LuSun } from "react-icons/lu";
import ButtonGroupInput from "../forms/ButtonGroupInput";
import { cn } from "~/utils/cn";
import { Controller } from "react-hook-form";

export default function LookAndFeel({ control }) {
  return (
    <>
      {/* logo y portada */}
      <p className="text-lg my-2 font-semibold">Logo y Portada</p>
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-4">
          <FileInput
            assetId=""
            actionId={1}
            files={[]}
            placeholder="Arrastra o selecciona tu logo"
            placeholderClassName="text-black"
            svgClassName="text-black"
            buttonClassName="flex-col p-0 py-4 min-h-[150px] border-black border-2 m-0 gap-2"
          />
        </div>
        <div className="col-span-8">
          <FileInput
            assetId=""
            actionId={2}
            files={[]}
            placeholder="Arrastra o selecciona tu foto de portada"
            placeholderClassName="text-black"
            svgClassName="text-black"
            buttonClassName="flex-col p-0 py-4 min-h-[150px] border-black border-2 m-0 gap-2"
          />
        </div>
      </div>

      {/* colores */}
      <p className="text-lg my-2 font-semibold">Colores</p>
      <p className="text-lg text-brand-gray mb-2">Elige el tema de tu sitio</p>
      <div className="grid grid-cols-2">
        <Controller
          name="colorMode"
          control={control}
          render={({ field }) => (
            <ButtonGroupInput
              value={field.value}
              onChange={field.onChange}
              shadowClassName="bg-black"
              selectedShadowClassName="bg-black"
              options={[
                { value: "light", label: "Light", Icon: LuSun },
                { value: "dark", label: "Dark", Icon: LuMoonStar },
              ]}
              renderOption={(option, isSelected) => (
                <div className="flex items-center justify-start gap-3">
                  <option.Icon />
                  <strong>{option.label}</strong>
                </div>
              )}
            />
          )}
        />
      </div>
      <p className="text-lg text-brand-gray mt-4 mb-2">
        Ingresa o elige el color principal
      </p>
      <Controller
        name="hexColor"
        control={control}
        render={({ field }) => (
          <div className="grid grid-cols-12 items-center gap-4">
            <div className="col-span-4">
              <Input
                type="text"
                maxLength={7}
                prefix={
                  <div
                    style={{ backgroundColor: field.value }}
                    className={cn("h-6 w-10 rounded-md  border")}
                  />
                }
                value={field.value}
                onChange={(e) => {
                  // to do this in the input level or ssomewhere else so we can reuse this later
                  const unmasked = e.target.value.replace("#", "");
                  const masked = `#${unmasked}`;
                  field.onChange(masked);
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
                value={field.value}
                onChange={field.onChange}
                renderOption={(option, isSelected) => (
                  <div
                    className="h-full"
                    style={{ backgroundColor: option.value }}
                  />
                )}
              />
            </div>
          </div>
        )}
      />

      {/* tipografía */}
      <p className="text-lg my-2 font-semibold">Tipografía</p>
      <div>
        <Controller
          name="typography"
          control={control}
          defaultValue=""
          render={({ field }) => (
            <ButtonGroupInput
              value={field.value}
              onChange={field.onChange}
              className="grid grid-cols-2"
              shadowClassName="bg-black"
              selectedShadowClassName="bg-black"
              options={[
                { value: "Avenir", label: "Alejandro Sans" },
                { value: "Arial", label: "Arial" },
                { value: "Georgia", label: "Georgia" },
                { value: "Tahoma", label: "Tahoma" },
              ]}
              renderOption={(option, isSelected) => (
                <div className="text-start">
                  {/* use the current font idk how */}
                  <h2
                    className="text-xl font-semibold"
                    style={{ fontFamily: option.value }}
                  >
                    Título
                  </h2>
                  <p
                    className="text-lg text-brand-gray mb-2"
                    style={{ fontFamily: option.value }}
                  >
                    subtítulo
                  </p>
                  <p
                    className="text-md text-brand-gray"
                    style={{ fontFamily: option.value }}
                  >
                    {option.label}
                  </p>
                </div>
              )}
            />
          )}
        />
      </div>
    </>
  );
}
