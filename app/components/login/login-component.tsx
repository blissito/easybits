import logoPurple from "/icons/eyes-logo-purple.svg";
import { AuthNav } from "./auth-nav";
import { STRINGS } from "./login.strings";
import { FcGoogle } from "react-icons/fc";
import { BsStripe } from "react-icons/bs";
import { AiFillMail } from "react-icons/ai";
import { Button } from "../common/Button";
import { useState, type FormEvent } from "react";
import { Input } from "../common/Input";
import { motion, AnimatePresence } from "motion/react";
import { Form, useFetcher } from "react-router";

export default function LoginComponent({ state }: { state?: string }) {
  const fetcher = useFetcher();
  const [loginType, setLoginType] = useState<
    "social" | "email" | "showing_email_instructions"
  >("social");
  const [isLogin, setIsLogin] = useState<boolean>(false);

  const SELECTED_STRINGS = isLogin ? STRINGS["login"] : STRINGS["signup"];
  const transition = {
    duration: 0.3,
    delay: 0.1,
    ease: [0, 0.71, 0.2, 1.01],
  };
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isGoogleLoading =
    fetcher.state !== "idle" && fetcher.formData?.get("auth") === "google";
  const isStripeLoading =
    fetcher.state !== "idle" && fetcher.formData?.get("auth") === "stripe";

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginType("showing_email_instructions");
    const form = Object.fromEntries(new FormData(e.currentTarget)) as {
      displayName: string;
      email: string;
    };
    fetcher.submit(
      {
        email: form.email,
        displayName: form.displayName,
        auth: "email_signup",
      },
      {
        method: "post",
      }
    );
  };

  const isLoading = fetcher.state !== "idle";

  return (
    <section className="w-full border-[1px] border-black h-screen bg-cover bg-center bg-patternDark flex justify-center  items-center">
      <AuthNav />
      <main className="w-full ">
        <div className="flex flex-col min-w-full items-center justify-center">
          {/* hover animation can improve... just like everything in this F** world*/}

          <motion.img
            src={logoPurple}
            className="w-[95px]"
            animate={{
              x: offset.x,
              y: offset.y,
              transition: { type: "spring", stiffness: 500, damping: 10 },
            }}
          />
          <AnimatePresence mode="wait">
            <fetcher.Form onSubmit={handleSubmit} method="post">
              {loginType === "social" && (
                <motion.div
                  key="social"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  className="w-[98vw] px-4 md:px-[5%] xl:px-0   mx-auto flex flex-col items-center"
                >
                  <p className="text-center font-bold text-3xl whitespace-pre-line mb-10 w-full text-white">
                    {SELECTED_STRINGS.title}
                  </p>
                  <div className="flex min-w-full flex-col md:items-center justify-center gap-6 mb-8 mx-auto">
                    <Button
                      mode="large"
                      isLoading={isGoogleLoading}
                      className="bg-[#A6EB9A] md:min-w-[420px] "
                      type="submit"
                      name="auth"
                      value="google"
                    >
                      <FcGoogle />
                      Iniciar con Gmail
                    </Button>
                    <Button
                      mode="large"
                      isLoading={isStripeLoading}
                      className="bg-[#6772E5] md:min-w-[420px]"
                      type="submit"
                      name="auth"
                      value="stripe"
                    >
                      <BsStripe fill="white" />
                      Iniciar con Stripe
                    </Button>
                    <Button
                      mode="large"
                      className="md:min-w-[420px]"
                      type="button"
                      onClick={() => {
                        setLoginType("email");
                      }}
                    >
                      <AiFillMail />
                      Iniciar con Email
                    </Button>
                  </div>
                  <p className="text-center text-white">
                    {SELECTED_STRINGS.actionQuestion}
                    <span
                      className="text-[#9870ED] cursor-pointer underline"
                      onClick={() => setIsLogin((prev) => !prev)}
                    >
                      {SELECTED_STRINGS.action}
                    </span>
                  </p>
                </motion.div>
              )}
            </fetcher.Form>
            {loginType === "email" && (
              <motion.form
                onSubmit={handleSubmit}
                key="email"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition}
                className="w-[98vw] px-4 md:px-[5%] xl:px-0   mx-auto flex flex-col items-center"
              >
                <p className="text-center max-w-md  text-3xl whitespace-pre-line font-bold mb-8 text-white">
                  {SELECTED_STRINGS.formTitle}
                </p>
                <div className="flex min-w-full flex-col md:items-center justify-center gap-6 mb-8 mx-auto">
                  <Input
                    className="md:max-w-[420px] text-white"
                    label="Nombre"
                    name="displayName"
                    placeholder="¿Cómo te gusta que te llamen?"
                    inputClassName="w-full"
                  />
                  <Input
                    className="md:max-w-[420px] text-white"
                    label="Email"
                    type="email"
                    name="email"
                    placeholder="tucorreo@gmail.com"
                    inputClassName="w-full"
                  />
                  <Button
                    className="bg-brand-500 mt-2 md:min-w-[420px]"
                    type="submit"
                    name="loginType"
                    value="email-pass"
                    isLoading={isLoading}
                  >
                    {SELECTED_STRINGS.formSubmit}
                  </Button>
                </div>
                <p className="text-center text-white mt-0">
                  <span
                    className="text-brand-500 underline cursor-pointer "
                    onClick={() => {
                      setLoginType("social");
                    }}
                  >
                    {SELECTED_STRINGS.formAction}
                  </span>
                </p>
              </motion.form>
            )}
            {fetcher.data?.state === "confirmation_success" && (
              <p className="text-white text-2xl">
                Te hemos enviado un correo de confirmación.
                <br />
                Por favor, valida tu cuenta para comenzar. ✅
              </p>
            )}

            {fetcher.data?.state === "success" && (
              <p className="text-white text-2xl">
                Te hemos enviado un correo con tu llave. 🗝️
                <br />
                Ahora, entra a tu correo y da clic al enlace. ✅
              </p>
            )}
          </AnimatePresence>
        </div>
      </main>
    </section>
  );
}
