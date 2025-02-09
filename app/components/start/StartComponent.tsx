import { BrutalButton } from "../common/BrutalButton";
import { STRINGS } from "./StartComponent.constants";
import StepCheck from "/icons/step-check.svg";
import Escribenos from "/icons/escribenos.png";
import StepProgress from "../common/StepProgress";

export default function StartComponent() {
  const steps = STRINGS.steps.length;
  const completed = STRINGS.steps.filter((item) => item.isCompleted).length;
  /*   TODO: check its progress somehow
   *    change icons
   */

  return (
    <div className="mt-28">
      <div className="w-[756px] rounded-xl border border-black bg-white mb-8">
        <div className="p-8 flex justify-between items-center">
          <div>
            <p className="font-semibold text-2xl">{STRINGS.title}</p>
            <p className="text-brand-gray text-md">{STRINGS.subtitle}</p>
          </div>
          <div className="w-1/4">
            <StepProgress steps={steps} completed={completed} />
          </div>
        </div>
        <div className="border-b border-black" />
        {/* steps */}
        <div className="p-8">
          {STRINGS.steps.map(
            ({ title, subtitle, image, cta, isCompleted }, key) => (
              <div className="flex justify-between items-center mb-9" key={key}>
                <div className="flex justify-start gap-4">
                  <div className="w-[64px] h-[51px] bg-grayLight flex items-center justify-center rounded-md">
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
            )
          )}
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
