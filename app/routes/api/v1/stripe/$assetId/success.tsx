import { BrutalButton } from "~/components/common/BrutalButton";
import type { Route } from "./+types/success";
import { useNavigate } from "react-router";
import { BrendisConfetti, EmojiConfetti } from "~/components/Confetti";
import { db } from "~/.server/db";

export async function loader({ params }: { params: { assetId: string } }) {
  const asset = await db.asset.findUnique({ where: { id: params.assetId } });
  
  return {
    component: (
      <article className="pt-20 px-20 text-center ">
        <img
          className="mx-auto mb-10"
          src="/images/success.svg"
          alt="turbo charged radio"
        />
        <h1 className="text-2xl">¡Gracias por tu compra! 🥳</h1>
        <p className="text-lg text-iron">
          Tu asset <strong>«{asset?.title || 'UI Design'}»</strong> está esperándote.
        </p>
      </article>
    ),
  };
}

export default function Page({ loaderData }: Route.ComponentProps) {
  const { component } = loaderData;
  const navigate = useNavigate();
  const handleClick = () => navigate("/dash/perfil");
  return (
    <article className="h-svh w-full grid bg-center place-content-center bg-coverSuccessMobile lg:bg-coverSuccess bg-cover overflow-hidden relative">
      {component}
      <BrutalButton
        containerClassName="mx-auto block my-10"
        onClick={handleClick}
      >
        Ver contenido
      </BrutalButton>
      <BrendisConfetti />
    </article>
  );
}
