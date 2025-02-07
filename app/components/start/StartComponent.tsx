import { BrutalButton } from "../common/BrutalButton";
import { STRINGS } from "./StartComponent.constants";
import StepCheck from "~/assets/icons/step-check.svg";
import Escribenos from "~/assets/icons/escribenos.png";

export default function StartComponent() {
  return (
    <div>
      <div className="w-[756px] rounded-xl border border-black bg-white mb-8">
        <div className="p-8">
          <div>
            <p className="font-semibold text-2xl">{STRINGS.title}</p>
            <p className="text-brand-gray text-md">{STRINGS.subtitle}</p>
          </div>
          <div>{/* status */}</div>
        </div>
        <div className="border-b border-black" />
        <div className="p-8">
          {STRINGS.steps.map(({ title, subtitle, image, cta, isCompleted }) => (
            <div className="flex justify-between items-center mb-9">
              <div className="flex justify-start gap-4">
                <div className="w-[64px] h-[51px] bg-grayLight flex items-center justify-center">
                  <img src={image} />
                </div>
                <div>
                  <p className="font-semibold text-md">{title}</p>
                  <p className="text-brand-gray text-sm">{subtitle}</p>
                </div>
              </div>
              <div className="flex justify-center w-1/4">
                {isCompleted ? (
                  <img src={StepCheck} className="w-[48px] h-[48px]" />
                ) : (
                  <BrutalButton>{cta}</BrutalButton>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="w-[756px] rounded-xl border border-black bg-white p-8 flex items-center justify-between">
        <p className="text-md">
          {STRINGS.anyQuestion}{" "}
          <span className="text-brand-500">{STRINGS.contactUs}</span>
        </p>
        <img src={Escribenos} className="w-[48px] h-[48px]" />
      </div>
    </div>
  );
}
