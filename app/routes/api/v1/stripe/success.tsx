import { BrutalButton } from "~/components/common/BrutalButton";
import type { Route } from "./+types/success";
import { useNavigate } from "react-router";

export const loader = async () => {
  return {
    component: (
      <article className="pt-20 px-20 text-center ">
        <img
          className="mx-auto mb-10"
          src="/images/turbo.svg"
          alt="turbo charged radio"
        />
        <h1 className="text-2xl">¡Gracias por tu compra! 🥳</h1>
        <p className="text-lg text-gray-700">Tu Asset esta esperándote.</p>
      </article>
    ),
  };
};
export default function Page({ loaderData }: Route.ComponentProps) {
  const { component } = loaderData;
  const navigate = useNavigate();
  const handleClick = () => navigate("/dash/perfil");
  return (
    <article>
      {component}
      <BrutalButton
        mode="inverted"
        containerClassName="mx-auto block my-10"
        onClick={handleClick}
      >
        Ver contenido
      </BrutalButton>
    </article>
  );
}
