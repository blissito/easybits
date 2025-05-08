import { FileInput } from "../forms/FileInput";
import { Input } from "../forms/Input";
import { LuMoonStar, LuSun } from "react-icons/lu";
import ButtonGroupInput from "../forms/ButtonGroupInput";
import { cn } from "~/utils/cn";
import { Controller, useForm } from "react-hook-form";
import { Switch } from "../forms/Switch";
import {
  FaFacebook,
  FaInstagram,
  FaLink,
  FaLinkedin,
  FaTiktok,
  FaYoutube,
} from "react-icons/fa6";

export default function LinksStep({ control, register }) {
  return (
    <div className="mt-4">
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
      <div className="mt-2">
        <Input
          {...register("instagram")}
          placeholder="https://www.instagram.com/Bitor"
          label={
            <span className="flex gap-1 items-center">
              <FaInstagram />
              Instagram
            </span>
          }
        />
      </div>
      <div className="mt-2">
        <Input
          {...register("facebook")}
          placeholder="https://www.facebook.com/Bitor"
          label={
            <span className="flex gap-1 items-center">
              <FaFacebook />
              Facebook
            </span>
          }
        />
      </div>
      <div className="mt-2">
        <Input
          {...register("tiktok")}
          placeholder="https://www.tiktok.com/Bitor"
          label={
            <span className="flex gap-1 items-center">
              <FaTiktok />
              Tiktok
            </span>
          }
        />
      </div>
      <div className="mt-2">
        <Input
          {...register("youtube")}
          placeholder="https://www.youtube.com/Bitor"
          label={
            <span className="flex gap-1 items-center">
              <FaYoutube />
              Youtube
            </span>
          }
        />
      </div>
      <div className="mt-2">
        <Input
          {...register("linkedin")}
          placeholder="https://www.linkedin.com/Bitor"
          label={
            <span className="flex gap-1 items-center">
              <FaLinkedin />
              Linkedin
            </span>
          }
        />
      </div>
      <div className="mt-2">
        <Input
          {...register("other")}
          placeholder="https://www.bitor.com"
          label={
            <span className="flex gap-1 items-center">
              <FaLink />
              Otro Website
            </span>
          }
        />
      </div>
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
