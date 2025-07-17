import { BrutalButton } from "../common/BrutalButton";
import { STRINGS } from "./StartComponent.constants";
import { Link, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import StepCheck from "/icons/y-check.png";
import Escribenos from "/icons/escribenos.svg";
import StepProgress from "../common/StepProgress";
import { useTimeout } from "~/hooks/useTimeout";
import { useBrutalToast } from "~/hooks/useBrutalToast";

export default function StartComponent({
  tasks,
  user, 
}: {
  tasks: Record<number, boolean>;
  user: any;
}) {
  const [landing, setLanding] = useState(0);
  const [share, setShare] = useState(0);
  const [copied, setCopied] = useState(false);
  const brutalToast = useBrutalToast();
  const saveLandingFlag = (num: number) => {
    localStorage.setItem("landingFlag", String(num));
    setLanding(num);
  };
  const getLandingFlag = () => Number(localStorage.getItem("landingFlag"));

  const saveShareFlag = (val: number) => {
    localStorage.setItem("shareFlag", String(val));
    setShare(val);
  };

  const getShareFlag = () => Number(localStorage.getItem("shareFlag"));

  const handleLandingClick = () => {
    saveLandingFlag(1);
    // navigating with Link
  };

  const handleCopyToClipboard = (text: string) => () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    saveShareFlag(1);
    brutalToast("Link copiado ");
  };

  useEffect(() => {
    setLanding(getLandingFlag());
    setShare(getShareFlag());
    // if (Object.values(tasks).every(Boolean)) {
    //   navigate("/dash/estadisticas");
    // } // @todo @brendi confirmar si se redirecciona porfs
  }, []);
  return (
    <div className="flex justify-center items-center relative  w-full ">
      <Toaster />
      <div className="flex min-h-screen w-full justify-center items-center max-w-7xl mx-auto md:py-10 pt-16 pb-6 px-4 md:pl-28 md:pr-8 2xl:px-0">
        <div className="w-full ">
          <div className="w-full lg:w-[756px] mx-auto rounded-xl border-2 border-black bg-white mb-8">
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
                <StepProgress
                  tasks={{ ...tasks, 3: landing === 1, 4: share === 1 }}
                />
              </div>
            </div>
            <div className="border-b-2 border-black" />

            <div className="p-4 md:p-8 flex flex-col gap-4">
              {STRINGS.steps.map(
                ({ title, subtitle, image, cta, isCompleted, path }, key) => (
                  <div
                    className="flex justify-between items-center w-full gap-4"
                    key={key}
                  >
                    <div className="flex justify-start items-start gap-3 w-3/4">
                      <div className="w-12 h-12 bg-gray-light flex items-center justify-center rounded-[4px]">
                        <img src={image} className="w-[32px]" />
                      </div>
                      <div className="w-full">
                        <p className="font-semibold text-md">{title}</p>
                        <p className="text-brand-gray text-sm">{subtitle}</p>
                      </div>
                    </div>
                    <div className="flex justify-center w-1/4">
                      {tasks[key] ||
                      (key === 3 && landing) ||
                      (key === 4 && share) ? (
                        <img src={StepCheck} className="w-[64px] ml-12" />
                      ) : (
                        <>
                          {key === 3 ? (
                            <a href={`https://${user.host}.easybits.cloud/tienda`} target="_blank">
                              <BrutalButton
           
                                onClick={handleLandingClick}
                                containerClassName="h-8 rounded-lg text-base font-medium"
                                className="h-8 w-auto min-w-24 rounded-lg text-base font-medium"
                              >
                                {cta}
                              </BrutalButton>
                            </a>
                          ) : key === 4 ? (
                            <BrutalButton
                              type="button"
                              onClick={handleCopyToClipboard(`https://${user.host}.easybits.cloud/tienda`)}
                              containerClassName="h-8 rounded-lg text-base font-medium"
                              className="h-8 w-auto min-w-24 rounded-lg text-base font-medium"
                            >
                              {cta}
                            </BrutalButton>
                          ) : (
                            <Link to={path}>
                              <BrutalButton
                                type="button"
                                containerClassName="h-8 rounded-lg text-base font-medium"
                                className="h-8 w-auto min-w-24 rounded-lg text-base font-medium"
                              >
                                {cta}
                              </BrutalButton>
                            </Link>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
          <div className="w-full lg:w-[756px] mx-auto rounded-xl border-2 border-black bg-white h-20 px-6 md:px-8 flex items-center justify-between">
            <p className="text-md">
              {STRINGS.anyQuestion}{" "}
              <a
                href="mailto:brenda@fixter.org" //  @todo please set the right email
                className="text-brand-500 underline"
              >
                {STRINGS.contactUs}
              </a>
            </p>
            <img src={Escribenos} className="w-[48px] h-[48px] mr-4 md:mr-8" />
          </div>
        </div>
      </div>
    </div>
  );
}
