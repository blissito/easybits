import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { BrendisConfetti } from "~/components/Confetti";
import { useScript } from "~/hooks/useScript";
import { cn } from "~/utils/cn";

export const SuscriptionBox = ({ className }: { className?: string }) => {
  const fetcher = useFetcher();
  const isSuccess = fetcher.data?.success;
  const [isDisabled, setIsDisabled] = useState(true);
  return (
    <section
      className={cn(
        "max-w-3xl h-fit md:h-72 border-black border-[2px] overflow-hidden md:rounded-t-full bg-coverSuscription   rounded-r-3xl rounded-t-3xl  md:rounded-r-full  bg-cover mx-auto p-6 md:p-8  justify-center relative",
        className
      )}
    >
      <div className="w-full  text-center relative">
        <h3 className="text-2xl md:text-3xl font-bold">
          Suscríbete a nuestro newsletter
        </h3>
        <div className="text-base md:text-xl mt-2 md:mt-3 max-w-4xl mx-auto">
          Recibe un resumen mensual de las mejores consejos de marketing y
          business para creadores, o de las nuevas funcionalidades nuevas de
          EasyBits.
        </div>
        {!isSuccess && (
          <fetcher.Form
            action="/api/v1/utils"
            method="post"
            className={cn(
              "flex gap-4 max-w-2xl mx-auto mt-10 flex-wrap md:flex-nowrap justify-center",
              {
                "pointer-events-none": isDisabled,
              }
            )}
          >
            <input
              name="email"
              required
              className="bg-white  rounded-xl w-full border-2 border-black "
              placeholder="ejemplo@easybist.cloud"
            />{" "}
            <BrutalButton
              isDisabled={isDisabled}
              isLoading={fetcher.state !== "idle"}
              name="intent"
              value="send_confirmation"
              type="submit"
              containerClassName=" -mt-[2px] ml-[1px]"
              id="Suscripcion"
            >
              ¡Apuntarme!
            </BrutalButton>
            <Turnstile setIsDisabled={setIsDisabled} />
          </fetcher.Form>
        )}
        {isSuccess && (
          // @Todo ponga un monito de tv o radio pequeñito 🤖 en vez del emoji
          <div className="text-xl mt-2 md:mt-4 font-bold">
            ¡Super! Ahora, revisa tu correo para confirmar tu cuenta. 🎊
          </div>
        )}
        {isSuccess && <BrendisConfetti />}
      </div>
    </section>
  );
};

export const Turnstile = ({
  setIsDisabled,
}: {
  setIsDisabled?: (arg0: boolean) => void;
}) => {
  const ref = useRef(null);
  useScript("https://challenges.cloudflare.com/turnstile/v0/api.js", () => {
    window.turnstile?.ready(() => {
      if (ref.current.id) return;
      ref.current.id = "loaded"; // avoiding duplication
      window.turnstile?.render(ref.current, {
        callback: enable,
        sitekey: "0x4AAAAAABbVIYBqxYY44hTw",
      });
    });
  });
  const enable = (token: string) => {
    console.log(token);
    if (token) {
      setIsDisabled?.(false);
    } else {
      setIsDisabled?.(true);
    }
  };
  return <div ref={ref} className="fixed bottom-0 right-0 z-50" />;
};
