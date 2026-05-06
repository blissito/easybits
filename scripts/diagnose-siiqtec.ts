import { db } from "../app/.server/db";
import { getStripe } from "../app/.server/stripe";

async function main() {
  const email = "siiqtec@gmail.com";

  console.log(`\n=== USER DB STATE: ${email} ===`);
  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      displayName: true,
      roles: true,
      customer: true,
      stripeIds: true,
      createdAt: true,
      updatedAt: true,
      aiGenerationsBonus: true,
    },
  });
  console.log(JSON.stringify(user, null, 2));

  if (!user) {
    console.log("NO USER FOUND");
    return;
  }

  console.log(`\n=== STRIPE: customers by email ${email} ===`);
  const stripe = getStripe();
  const customers = await stripe.customers.list({ email, limit: 5 });
  for (const c of customers.data) {
    console.log(`- ${c.id} | created ${new Date(c.created * 1000).toISOString()} | name=${c.name}`);
  }

  console.log(`\n=== STRIPE: subscriptions for those customers ===`);
  for (const c of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 10 });
    for (const s of subs.data) {
      console.log(
        `- sub=${s.id} cust=${c.id} status=${s.status} created=${new Date(s.created * 1000).toISOString()} metadata=${JSON.stringify(s.metadata)}`
      );
      const items = s.items.data.map(
        (it) => `${it.price.unit_amount! / 100} ${it.price.currency} (${it.price.recurring?.interval})`
      );
      console.log(`    items: ${items.join(", ")}`);
    }
  }

  console.log(`\n=== STRIPE: recent checkout sessions in last 48h ===`);
  const sessions = await stripe.checkout.sessions.list({
    limit: 50,
    created: { gte: Math.floor(Date.now() / 1000) - 48 * 3600 },
  });
  for (const s of sessions.data) {
    const e = s.customer_details?.email || s.customer_email;
    if (e === email) {
      console.log(
        `- session=${s.id} status=${s.status} payment_status=${s.payment_status} mode=${s.mode} amount_total=${s.amount_total} metadata=${JSON.stringify(s.metadata)} subscription=${s.subscription} customer=${s.customer}`
      );
    }
  }

  console.log(`\n=== STRIPE: recent events touching this email/customer ===`);
  const events = await stripe.events.list({
    limit: 50,
    created: { gte: Math.floor(Date.now() / 1000) - 48 * 3600 },
  });
  for (const ev of events.data) {
    const obj: any = ev.data.object;
    const objEmail = obj?.customer_email || obj?.customer_details?.email;
    const matchesEmail = objEmail === email;
    const matchesCust = customers.data.some((c) => obj?.customer === c.id);
    if (matchesEmail || matchesCust) {
      console.log(
        `- ${ev.id} type=${ev.type} created=${new Date(ev.created * 1000).toISOString()}`
      );
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
