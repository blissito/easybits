import { db } from "~/.server/db";
import type { Route } from "./+types/newsletters";
import { Effect } from "effect";

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create_newsletter") {
    const data = JSON.parse(formData.get("data") as string);
    const { userId, name, data: newsletterData } = data;
    if (!userId || !name || !newsletterData) {
      return new Response(null, {
        status: 400,
        statusText: "Faltan campos requeridos",
      });
    }

    return Effect.runPromise(
      Effect.tryPromise({
        try: async () =>
          await db.newsletter.create({
            data: {
              userId,
              name,
              data: newsletterData,
            },
          }),
        catch: (error) => error,
      }).pipe(
        Effect.map(
          (newsletter) =>
            new Response(JSON.stringify({ newsletter }), { status: 201 })
        ),
        Effect.catchAll((error) =>
          Effect.succeed(
            new Response(null, {
              status: 500,
              statusText: "Todo tronó",
            })
          )
        )
      )
    );
  }

  if (intent === "update_newsletter") {
    const data = JSON.parse(formData.get("data") as string);
    const { id, name, data: newsletterData } = data;
    if (!id || !name || !newsletterData) {
      return new Response(null, {
        status: 400,
        statusText: "Faltan campos requeridos",
      });
    }
    // @todo validation
    return Effect.runPromise(
      Effect.tryPromise({
        try: async () =>
          await db.newsletter.update({
            where: { id },
            data: {
              name,
              data: newsletterData,
            },
          }),
        catch: (error) => error,
      }).pipe(
        Effect.map(
          (newsletter) =>
            new Response(JSON.stringify({ newsletter }), { status: 200 })
        ),
        Effect.catchAll((error) =>
          Effect.succeed(
            new Response(null, {
              status: 500,
              statusText: "Todo tronó",
            })
          )
        )
      )
    );
  }

  if (intent === "get_newsletter") {
    const id = formData.get("id") as string;
    if (!id) {
      return new Response(null, {
        status: 400,
        statusText: "Falta el id del newsletter",
      });
    }
    return Effect.runPromise(
      Effect.tryPromise({
        try: async () => await db.newsletter.findUnique({ where: { id } }),
        catch: (error) => error,
      }).pipe(
        Effect.map(
          (newsletter) =>
            new Response(JSON.stringify({ newsletter }), { status: 200 })
        ),
        Effect.catchAll((error) => {
          console.error(error);
          return Effect.succeed(
            new Response(null, {
              status: 500,
              statusText: "Todo tronó",
            })
          );
        })
      )
    );
  }

  return new Response(null, { status: 405, statusText: "Método no permitido" });
};
