import { Input } from "../forms/Input";
import { Controller, useForm } from "react-hook-form";
import { Switch } from "../forms/Switch";
import {
  FaFacebook,
  FaInstagram,
  FaGlobe,
  FaLinkedin,
  FaTiktok,
  FaYoutube,
  FaXTwitter,
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
          {...register("x")}
          placeholder="https://www.x.com/Bitor"
          label={
            <span className="flex gap-1 items-center">
              <FaXTwitter />X
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
          {...register("website")}
          placeholder="https://www.bitor.com"
          label={
            <span className="flex gap-1 items-center">
              <FaGlobe />
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
