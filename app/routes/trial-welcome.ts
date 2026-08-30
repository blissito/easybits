import { redirect } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Route } from "./+types/trial-welcome";

// GET /trial-welcome — aterrizaje del checkout del trial.
//
// El dash exige perfil completo (customer_type + asset_types) y manda al
// onboarding a quien no lo tiene. Quien acaba de pagar un trial de developer
// no viene a decirnos qué tipo de assets vende: viene por su API key. Le
// sembramos un perfil mínimo para que el gate no lo intercepte —queda editable
// en su perfil— y lo dejamos en el panel con la bienvenida.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);

  const needsProfile =
    !user.metadata?.customer_type ||
    (user.metadata?.asset_types.length || 0) < 1;

  if (needsProfile) {
    await db.user.update({
      where: { id: user.id },
      data: {
        metadata: {
          ...(user.metadata || {}),
          customer_type: user.metadata?.customer_type || "developer",
          asset_types: user.metadata?.asset_types?.length
            ? user.metadata.asset_types
            : ["archivo"],
        },
      },
    });
  }

  return redirect("/dash/developer?welcome=trial");
};
