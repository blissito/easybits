import { getUserOrNull } from "~/.server/getters";
import type { User } from "@prisma/client";

/**
 * Loader compartido de las páginas de pilar. Igual que la home: si la sesión
 * falla no se tira la página, solo se pinta el nav de invitado.
 */
export const productLoader = async ({ request }: { request: Request }) => {
  try {
    return { user: (await getUserOrNull(request)) as User | null };
  } catch {
    return { user: null as User | null };
  }
};
