import { data } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { createPackCheckout } from "~/.server/stripe";
import { GENERATION_PACKS, LLM_TOKEN_PACKS, getUserPlan } from "~/lib/plans";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUserOrRedirect(request);
  const plan = getUserPlan(user);

  const packs = GENERATION_PACKS.map((pack) => ({
    id: pack.id,
    generations: pack.generations,
    price: pack.prices[plan],
  }));

  return data({ packs, plan });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await getUserOrRedirect(request);
  const plan = getUserPlan(user);

  const body = await request.json();
  const { packId, packType = "credits", autoTopup = false } = body;

  // Look up in the right pack array
  if (packType === "tokens") {
    const pack = LLM_TOKEN_PACKS.find((p) => p.id === packId);
    if (!pack) {
      return data({ error: "Pack de tokens no encontrado" }, { status: 400 });
    }

    const url = await createPackCheckout({
      userId: user.id,
      email: user.email,
      packId: pack.id,
      tokens: pack.tokens,
      priceMxn: pack.price,
      type: "llm_token_pack",
      autoTopup: !!autoTopup,
    });

    return data({ url });
  }

  // Default: credit packs (backward compatible)
  const pack = GENERATION_PACKS.find((p) => p.id === packId);
  if (!pack) {
    return data({ error: "Pack no encontrado" }, { status: 400 });
  }

  const url = await createPackCheckout({
    userId: user.id,
    email: user.email,
    packId: pack.id,
    generations: pack.generations,
    priceMxn: pack.promoPrice ?? pack.prices[plan],
    autoTopup: !!autoTopup,
  });

  return data({ url });
}
