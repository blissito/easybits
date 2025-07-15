import { db } from "~/.server/db";
import type { Route } from "./+types/newsletters";
import { Effect } from "effect";
import React from "react";
import { NewsletterSubscribeForm } from "~/components/newsletters/NewsletterSubscribeForm";
import { scheduleNewsletterDeliveries } from "~/.server/newsletters/utils";

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

  if (intent === "subscribe_newsletter") {
    const newsletterId = formData.get("newsletterId") as string;
    const email = formData.get("email") as string;
    if (!newsletterId || !email) {
      return new Response(null, {
        status: 400,
        statusText: "Faltan campos requeridos",
      });
    }
    return Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          const newsletter = await db.newsletter.findUnique({
            where: { id: newsletterId },
          });
          if (!newsletter) throw new Error("Newsletter no encontrado");
          // Evitar duplicados
          const existing = await db.newsletterSubscriber.findFirst({
            where: { newsletterId, email },
          });
          if (existing) return existing;
          const subscriber = await db.newsletterSubscriber.create({
            data: {
              newsletterId,
              email,
            },
          });
          await scheduleNewsletterDeliveries({ newsletter, subscriber });
          return subscriber;
        },
        catch: (error) => error,
      }).pipe(
        Effect.map(
          (subscriber) =>
            new Response(JSON.stringify({ subscriber }), { status: 201 })
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

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const newsletterId = url.searchParams.get("newsletterId");

  if (!newsletterId) {
    return new Response(null, {
      status: 400,
      statusText: "Falta newsletterId",
    });
  }
  return Effect.runPromise(
    Effect.tryPromise(async () => {
      return await db.newsletter.findUnique({
        where: { id: newsletterId! },
      });
    }).pipe(
      Effect.flatMap((newsletter) => {
        return Effect.succeed({ newsletter }); // remember not to use Response here.
      }),
      Effect.catchAll((error) =>
        Effect.succeed(
          new Response(null, {
            status: 500,
            statusText: "Error en la base de datos",
          })
        )
      )
    )
  );
};

export default function NewsletterSubscribePage({
  loaderData,
}: Route.ComponentProps) {
  const { newsletter } = loaderData;

  if (!newsletter) {
    return (
      <div className="p-8 text-center text-red-600">
        Newsletter no encontrado
      </div>
    );
  }
  return <NewsletterSubscribeForm newsletter={newsletter} />;
}
