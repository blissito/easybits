import Stripe from 'stripe';

// Configura tu clave secreta de Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-08-16',
});

async function createTestEvent() {
  try {
    // Crea un webhook endpoint de prueba
    const webhook = await stripe.webhookEndpoints.create({
      url: 'http://localhost:3000/api/stripe/webhook/merchant',
      enabled_events: ['account.updated'],
      metadata: {
        assetId: 'asset_test_123',
        billing_details: { email: 'test@example.com' }
      }
    });

    console.log('Evento creado:', event);
  } catch (error) {
    console.error('Error al crear evento:', error);
  }
}

// Ejecuta la función
createTestEvent();
