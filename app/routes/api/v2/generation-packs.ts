import { data } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { createPackCheckout } from "~/.server/stripe";
import { GENERATION_PACKS, type PlanKey } from "~/lib/plans";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUserOrRedirect(request);
  const plan = ((user.metadata as any)?.plan || "Spark") as PlanKey;

  const packs = GENERATION_PACKS.map((pack) => ({
    id: pack.id,
    generations: pack.generations,
    price: pack.prices[plan],
  }));

  return data({ packs, plan });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await getUserOrRedirect(request);
  const plan = ((user.metadata as any)?.plan || "Spark") as PlanKey;

  const body = await request.json();
  const { packId } = body;

  const pack = GENERATION_PACKS.find((p) => p.id === packId);
  if (!pack) {
    return data({ error: "Pack no encontrado" }, { status: 400 });
  }

  const url = await createPackCheckout({
    userId: user.id,
    email: user.email,
    packId: pack.id,
    generations: pack.generations,
    priceMxn: pack.prices[plan],
  });

  return data({ url });
}
