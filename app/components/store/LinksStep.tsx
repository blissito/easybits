import { Input } from "../forms/Input";
import { Controller, useForm, useWatch } from "react-hook-form";
import { AnimatePresence, motion } from 'motion/react';
import { Switch } from "../forms/Switch";
import {
  FaFacebookF,
  FaInstagram,
  FaLink,
  FaLinkedin,
  FaTiktok,
  FaYoutube,
  FaXTwitter,
} from "react-icons/fa6";

export default function LinksStep({ control, register }) {
  const showSocialNetworks = useWatch({ control, name: 'socialNetworks' });
  return (
    <div>
      <div className="mt-2">
        <Controller
          name="socialNetworks"
          control={control}
          render={({ field }) => (
            <Switch
              onChange={field.onChange}
              value={field.value}
              label="Redes Sociales"
              holderClassName=""
              className="flex-row-reverse justify-between w-full"
            />
          )}
        />
      </div>
      <AnimatePresence initial={false} mode="wait">
        {
          showSocialNetworks ? (
            <motion.div
              key="social-networks"
              initial={{ opacity: 0, height: 0, y: -20 }}
              animate={{ 
                opacity: 1, 
                height: "auto", 
                y: 0,
                transition: {
                  duration: 0.4,
                  ease: "easeOut",
                  staggerChildren: 0.1
                }
              }}
              exit={{ 
                opacity: 0, 
                height: 0, 
                y: -20,
                transition: {
                  duration: 0.3,
                  ease: "easeIn"
                }
              }}
              className="overflow-hidden"
            >
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                className="mt-2"
              >
                <Input
                  {...register("instagram")}
                  placeholder="https://www.instagram.com/Bitor"
                  label={
                    <span className="flex gap-1 items-center">
                      <FaInstagram />
                      <span className="font-light"> Instagram</span>
                    </span>
                  }
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                <Input
                  {...register("x")}
                  placeholder="https://www.x.com/Bitor"
                  label={
                    <span className="flex gap-1 items-center">
                      <FaXTwitter />

                      <span className="font-light">X (antes twitter)</span>
                    </span>
                  }
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3, duration: 0.3 }}
              >
                <Input
                  {...register("facebook")}
                  placeholder="https://www.facebook.com/Bitor"
                  label={
                    <span className="flex gap-1 items-center">
                      <FaFacebookF />
                      <span className="font-light">Facebook</span>
                    </span>
                  }
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4, duration: 0.3 }}
              >
                <Input
                  {...register("tiktok")}
                  placeholder="https://www.tiktok.com/Bitor"
                  label={
                    <span className="flex gap-1 items-center">
                      <FaTiktok />
                      <span className="font-light"> Tiktok</span>
                    </span>
                  }
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5, duration: 0.3 }}
              >
                <Input
                  {...register("youtube")}
                  placeholder="https://www.youtube.com/Bitor"
                  label={
                    <span className="flex gap-1 items-center">
                      <FaYoutube />
                      <span className="font-light"> Youtube</span>
                    </span>
                  }
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6, duration: 0.3 }}
              >
                <Input
                  {...register("linkedin")}
                  placeholder="https://www.linkedin.com/Bitor"
                  label={
                    <span className="flex gap-1 items-center">
                      <FaLinkedin />
                      <span className="font-light"> Linkedin</span>
                    </span>
                  }
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7, duration: 0.3 }}
              >
                <Input
                  {...register("website")}
                  placeholder="https://www.bitor.com"
                  label={
                    <span className="flex gap-1 items-center">
                      <FaLink />
                      <span className="font-light"> Otro Website</span>
                    </span>
                  }
                />
              </motion.div>
            </motion.div>
          ) : null
        }
      </AnimatePresence>
      <div className="mt-4">
        <Controller
          name="showProducts"
          control={control}
          render={({ field }) => (
            <Switch
              onChange={field.onChange}
              value={field.value}
              label="Mostrar Productos"
              holderClassName=""
              className="flex-row-reverse justify-between w-full"
            />
          )}
        />
      </div>
    </div>
  );
}
