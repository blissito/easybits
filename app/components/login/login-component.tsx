import logoPurple from "~/assets/icons/eyes-logo-purple.svg";
import { AuthNav } from "./auth-nav";
import { STRINGS } from "./login.strings";
import { FcGoogle } from "react-icons/fc";
import { BsStripe } from "react-icons/bs";
import { AiFillMail } from "react-icons/ai";
import { Button } from "../common/Button";
import { useState } from "react";
import { Input } from "../common/Input";
import { motion, AnimatePresence } from "motion/react";
import { useFetcher } from "react-router";

export default function LoginComponent() {
  const fetcher = useFetcher();
  const [loginType, setLoginType] = useState<"social" | "email">("social");
  const [isLogin, setIsLogin] = useState<boolean>(false);

  const SELECTED_STRINGS = isLogin ? STRINGS["login"] : STRINGS["signup"];
  const transition = {
    duration: 0.3,
    delay: 0.1,
    ease: [0, 0.71, 0.2, 1.01],
  };
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = (event) => {
    const { clientX, clientY, currentTarget } = event;
    const { width, height, left, top } = currentTarget.getBoundingClientRect();
    const x = (clientX - left - width / 2) * 0.1;
    const y = (clientY - top - height / 2) * 0.1;
    setOffset({ x: -x, y: -y });
  };

  const handleMouseLeave = () => {
    setOffset({ x: 0, y: 0 });
  };

  const isGoogleLoading =
    fetcher.state !== "idle" && fetcher.formData?.get("auth") === "google";
  const isStripeLoading =
    fetcher.state !== "idle" && fetcher.formData?.get("auth") === "stripe";

  return (
    <>
      <AuthNav />
      <main
        className={
          "w-full h-screen bg-contain bg-center bg-patternDark flex justify-center items-center"
        }
      >
        <div className="flex flex-col items-center justify-center">
          {/* hover animation can improve... just like everything in this F** world*/}
          <motion.div
            whileHover={{ scale: 1.5 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="hover:p-10"
          >
            <motion.img
              src={logoPurple}
              className="w-[95px]"
              animate={{
                x: offset.x,
                y: offset.y,
                transition: { type: "spring", stiffness: 500, damping: 10 },
              }}
            />
          </motion.div>
          <fetcher.Form method="post">
            <AnimatePresence mode="wait">
              {loginType === "social" && (
                <motion.div
                  key="social"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                >
                  <p className="text-center text-3xl whitespace-pre-line mb-10">
                    {SELECTED_STRINGS.title}
                  </p>
                  <div className="flex flex-col gap-8 mb-8">
                    <Button
                      size="large"
                      isLoading={isGoogleLoading}
                      bgColor="bg-[#A6EB9A]"
                      type="submit"
                      name="auth"
                      value="google"
                    >
                      <FcGoogle />
                      Iniciar con Gmail
                    </Button>
                    <Button
                      size="large"
                      isLoading={isStripeLoading}
                      bgColor="bg-[#6772E5]"
                      type="submit"
                      name="auth"
                      value="stripe"
                    >
                      <BsStripe fill="white" />
                      Iniciar con Stripe
                    </Button>
                    <Button
                      size="large"
                      type="button"
                      onClick={() => {
                        setLoginType("email");
                      }}
                    >
                      <AiFillMail />
                      Iniciar con Email
                    </Button>
                  </div>
                  <p className="text-center">
                    {SELECTED_STRINGS.actionQuestion}
                    <span
                      className="text-[#9870ED] cursor-pointer"
                      onClick={() => setIsLogin((prev) => !prev)}
                    >
                      {SELECTED_STRINGS.action}
                    </span>
                  </p>
                </motion.div>
              )}
              {loginType === "email" && (
                <motion.div
                  key="email"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                >
                  <p className="text-center text-3xl whitespace-pre-line mb-10">
                    {SELECTED_STRINGS.formTitle}
                  </p>
                  <div className="flex flex-col mb-8">
                    {/* inputs */}

                    <Input
                      label="Email"
                      type="email"
                      name="email"
                      placeholder="tucorreo@gmail.com"
                    />
                    <Input
                      label="Contraseña"
                      type="password"
                      name="password"
                      placeholder="Al menos 8 caracteres"
                    />
                    <Button
                      size="large"
                      bgColor="bg-[#9870ED]"
                      type="submit"
                      name="loginType"
                      value="email-pass"
                    >
                      {SELECTED_STRINGS.formSubmit}
                    </Button>
                  </div>
                  <p className="text-center">
                    <span
                      className="text-[#9870ED] cursor-pointer "
                      onClick={() => {
                        setLoginType("social");
                      }}
                    >
                      {SELECTED_STRINGS.formAction}
                    </span>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </fetcher.Form>
        </div>
      </main>
    </>
  );
}
