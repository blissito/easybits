import { getStripe } from "~/.server/stripe";

async function testWebhook() {
  try {
    const stripe = getStripe();
    
    // Crear un evento de prueba
    const event = await stripe.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
    });

    // Aquí puedes ver la metadata en el evento
    console.log("Test event created:", event);

    // Si quieres enviar un evento específico, puedes usar:
    // const event = await stripe.events.create({
    //   type: "account.updated",
    //   data: {
    //     object: {
    //       id: "test_account",
    //       metadata: { test: "metadata" }
    //     }
    //   }
    // });

    console.log("Test completed successfully!");
  } catch (error) {
    console.error("Error testing webhook:", error);
  }
}

testWebhook();
