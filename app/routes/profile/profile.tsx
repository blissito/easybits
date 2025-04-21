// import type { User } from "@prisma/client";
import { createPortalSessionURL, retrieveCustomer } from "~/.server/stripe";
import type { Route } from "./+types/profile";
import { ProfileCard, SuscriptionCard } from "./profileComponents";
import { getUserOrRedirect } from "~/.server/getters";
import { redirect } from "react-router";

export const loader = async ({ request }: Route.ClientLoaderArgs) => {
  const user = await getUserOrRedirect(request);
  let customer;
  if (user.customer) customer = await retrieveCustomer(user.customer);
  return {
    user,
    customer,
  };
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "redirect_to_portal") {
    const user = await getUserOrRedirect(request);
    const url = await createPortalSessionURL(user.customer);
    if (!url) {
      throw redirect("/planes");
    }
    throw redirect(url);
  }
};

export function HydrateFallback() {
  return <ProfileSkeleton />;
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const { user, customer } = loaderData;
  return (
    <article className=" min-h-screen w-full relative box-border inline-block md:py-10 pt-16 pb-6 px-4 md:pl-28 md:pr-8 2xl:px-0">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-semibold pt-1 md:pt-1">
          Perfil
        </h2>
        <ProfileCard user={user} />
        <SuscriptionCard customer={customer} />
      </div>
    </article>
  );
}

// leave it for yutu 🍋‍🟩🍺
const ProfileSkeleton = () => {
  return (
    <article className="h-screen flex flex-col gap-6 place-content-center w-full animate-pulse p-4">
      <section className="flex border p-4 rounded-md ">
        <div className="">
          <svg
            className="w-10 h-10 me-3 text-gray-400"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M10 0a10 10 0 1 0 10 10A10.011 10.011 0 0 0 10 0Zm0 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm0 13a8.949 8.949 0 0 1-4.951-1.488A3.987 3.987 0 0 1 9 13h2a3.987 3.987 0 0 1 3.951 3.512A8.949 8.949 0 0 1 10 18Z" />
          </svg>
        </div>
        <div className="gap-2 grid">
          <div className="w-40 h-3 bg-gray-400 rounded-full" />
          <div className="w-60 h-2 bg-gray-400 rounded-full" />
        </div>
      </section>
      <section className="border p-4 rounded-md grid gap-8">
        <div className="h-2 bg-gray-400 rounded-full" />
        <div className="h-2 bg-gray-400 rounded-full" />
        <div className="w-80 h-2 bg-gray-400 rounded-full" />
        <div className="w-60 h-2 bg-gray-400 rounded-full" />
        <div className="h-2 bg-gray-400 rounded-full" />
        <div className="w-80 h-2 bg-gray-400 rounded-full" />
        <div className="w-60 h-2 bg-gray-400 rounded-full" />
      </section>
      <section className="border rounded-md p-4 flex justify-between items-center">
        <div className="grid gap-4">
          <div className="w-60 h-2 bg-gray-400 rounded-full" />
          <div className="w-60 h-2 bg-gray-400 rounded-full" />
        </div>
        <div className="w-40 h-10 bg-gray-400 rounded-full" />
      </section>
    </article>
  );
};
