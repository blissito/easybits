import { BrutalButton } from "../common/BrutalButton";
import { STRINGS } from "./StartComponent.constants";
import StepCheck from "/icons/y-check.png";
import Escribenos from "/icons/escribenos.svg";
import StepProgress from "../common/StepProgress";

import { Link } from "react-router";

export default function StartComponent() {
  const steps = STRINGS.steps.length;
  const completed = STRINGS.steps.filter((item) => item.isCompleted).length;
  /*   TODO: check its progress somehow
   *    change icons
   */

  return (
    <div className="flex min-h-screen w-full justify-center items-center max-w-7xl mx-auto md:py-10 pt-16 pb-6 px-4 md:pl-28 md:pr-8 xl:px-0">
      <div className="w-full ">
        <div className="w-full lg:w-[756px] mx-auto rounded-xl border-[2px] border-black bg-white mb-8">
          <div className="p-6 md:p-8 flex justify-between items-center">
            <div>
              <p className="font-semibold text-2xl md:text-2xl">
                {STRINGS.title}
              </p>
              <p className="text-iron text-base md:text-lg">
                {STRINGS.subtitle}
              </p>
            </div>
            <div className="w-1/4 flex justify-end mr-0 md:mr-8">
              <StepProgress steps={steps} completed={completed} />
            </div>
          </div>
          <div className="border-b-2 border-black" />

          <div className="p-4 md:p-8 flex flex-col gap-6 md:gap-8">
            {STRINGS.steps.map(
              ({ title, subtitle, image, cta, isCompleted, path }, key) => (
                <div
                  className="flex justify-between items-center w-full gap-4"
                  key={key}
                >
                  <div className="flex justify-start items-start gap-2 w-3/4">
                    <div className="w-12 h-12 bg-grayLight flex items-center justify-center rounded-[4px]">
                      <img src={image} className="w-[32px]" />
                    </div>
                    <div className="w-full">
                      <p className="font-semibold text-md">{title}</p>
                      <p className="text-brand-gray text-sm">{subtitle}</p>
                    </div>
                  </div>
                  <div className="flex justify-center w-1/4">
                    {isCompleted ? (
                      <img src={StepCheck} className="w-[64px]" />
                    ) : (
                      <Link to={path}>
                        <BrutalButton
                          containerClassName="h-8 rounded-xl text-base font-medium"
                          className="h-8 w-auto min-w-24 rounded-lg text-base font-medium"
                        >
                          {cta}
                        </BrutalButton>
                      </Link>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
        <div className="w-full lg:w-[756px] mx-auto rounded-xl border-[2px] border-black bg-white h-20 px-6 md:px-8 flex items-center justify-between">
          <p className="text-md">
            {STRINGS.anyQuestion}{" "}
            <a
            // href="mailto:hola@easybits.cloud" //  @todo please set the right email
            // className="text-brand-500 underline"
            >
              {STRINGS.contactUs}
            </a>
          </p>
          <img src={Escribenos} className="w-[48px] h-[48px] mr-4 md:mr-8" />
        </div>
      </div>
    </div>
  );
}
