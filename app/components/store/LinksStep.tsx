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
      <AnimatePresence initial={false}>
        {
          showSocialNetworks ? (
            <motion.div
              key="box"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
            >
              <div className="mt-2">
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
              </div>
              <div>
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
              </div>
              <div>
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
              </div>
              <div>
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
              </div>
              <div>
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
              </div>
              <div>
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
              </div>
              <div>
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
              </div>
            </motion.div>
          ) : null
        }
      </AnimatePresence>
      <div className="mt-2">
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
