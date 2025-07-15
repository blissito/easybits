import type { EmailNode } from "~/components/newsletters/EmailNodeCard";
import { Agenda } from "agenda";
import { sendNewsletterDelivery } from "../emails/sendNewsletterDelivery";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { db } from "../db";

const agenda = new Agenda({
  db: {
    address: process.env.DATABASE_URL || "mongodb://localhost:27017/your-db",
  },
  processEvery: "30 seconds",
});

async function renderMarkdown(md: string) {
  return sanitizeHtml(await marked(md));
}

agenda.define("send_newsletter_delivery", async (job: any) => {
  const { email, title, content, newsletterId, subscriberId, deliveryIndex } =
    job.attrs.data as any;
  // Renderiza el contenido markdown a HTML
  const htmlContent = await renderMarkdown(content);
  await sendNewsletterDelivery({
    email,
    subject: title,
    content: htmlContent,
    newsletterName: newsletterId, // Puedes buscar el nombre real si lo necesitas
    deliveryIndex,
  });
  // Actualizar el progreso del suscriptor
  const subscriber = await db.newsletterSubscriber.update({
    where: { id: subscriberId },
    data: {
      currentStep: deliveryIndex + 1,
      lastSentAt: new Date(),
    },
  });
  // Programar la siguiente entrega si existe
  const newsletter = await db.newsletter.findUnique({
    where: { id: newsletterId },
  });
  if (!newsletter) return;
  const deliveries: EmailNode[] = newsletter.data as unknown as EmailNode[];
  if (subscriber.currentStep < deliveries.length) {
    const nextEntrega = deliveries[subscriber.currentStep];
    const when = nextEntrega.delay || "in 1 day";
    await agenda.schedule(when, "send_newsletter_delivery", {
      email: subscriber.email,
      newsletterId,
      subscriberId,
      deliveryIndex: subscriber.currentStep,
      title: nextEntrega.title,
      content: nextEntrega.content,
    });
  }
  // Elimina el job ejecutado
  await job.remove();
});

export async function scheduleNewsletterDeliveries({
  newsletter,
  subscriber,
}: {
  newsletter: any;
  subscriber: any;
}) {
  // Solo programa la primera entrega
  const deliveries: EmailNode[] = newsletter.data as unknown as EmailNode[];
  if (deliveries.length === 0) return;
  const entrega = deliveries[0];
  const when = entrega.delay || "in 1 day";
  await agenda.start(); // Asegura que el worker esté corriendo
  await agenda.schedule(when, "send_newsletter_delivery", {
    email: subscriber.email,
    newsletterId: newsletter.id,
    subscriberId: subscriber.id,
    deliveryIndex: 0,
    title: entrega.title,
    content: entrega.content,
  });
}
