/**
 * Stripe Webhook Handler
 *
 * Receives events from Stripe when payments complete.
 * This is the critical automation trigger - when a payment succeeds,
 * we create the order record and send it to the print lab.
 */

import Stripe from 'stripe';
import { createPrintspaceOrder } from './printspace.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;

  // Verify webhook signature
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`
    };
  }

  // Handle the event
  switch (stripeEvent.type) {
    case 'checkout.session.completed': {
      const session = stripeEvent.data.object;

      // Only process paid sessions
      if (session.payment_status === 'paid') {
        await handleSuccessfulPayment(session);
      }
      break;
    }

    case 'checkout.session.async_payment_succeeded': {
      // For delayed payment methods (bank transfers, etc.)
      const session = stripeEvent.data.object;
      await handleSuccessfulPayment(session);
      break;
    }

    case 'checkout.session.async_payment_failed': {
      const session = stripeEvent.data.object;
      console.log('Payment failed for session:', session.id);
      // Could notify admin here
      break;
    }

    default:
      console.log(`Unhandled event type: ${stripeEvent.type}`);
  }

  // Return 200 to acknowledge receipt
  return {
    statusCode: 200,
    body: JSON.stringify({ received: true })
  };
};

/**
 * Handle a successful payment
 * Creates order record and triggers fulfillment
 */
async function handleSuccessfulPayment(session) {
  console.log('Processing successful payment:', session.id);

  // Parse order items from metadata
  let orderItems = [];
  try {
    orderItems = JSON.parse(session.metadata?.order_items || '[]');
  } catch (e) {
    console.error('Failed to parse order items:', e);
  }

  // Extract order details from session
  const order = {
    stripe_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent,
    customer_email: session.customer_details?.email,
    shipping: {
      name: session.shipping_details?.name,
      address: session.shipping_details?.address
    },
    items: orderItems.map(item => ({
      print_id: item.print_id,
      title: item.title,
      size: item.size,
      dimensions: item.dimensions,
      quantity: item.quantity || 1
    })),
    amount_total: session.amount_total,
    currency: session.currency,
    created_at: new Date().toISOString()
  };

  console.log('Order details:', JSON.stringify(order, null, 2));

  // TODO: Save to Supabase database
  // const { data, error } = await supabase
  //   .from('orders')
  //   .insert([order]);

  // Send order to Printspace/Creativehub
  if (process.env.CREATIVEHUB_API_KEY) {
    try {
      const printspaceOrder = await createPrintspaceOrder({
        orderId: session.id,
        customerEmail: order.customer_email,
        shipping: order.shipping,
        items: order.items
      });
      console.log('Printspace order created:', printspaceOrder.id || printspaceOrder);
    } catch (error) {
      console.error('Failed to create Printspace order:', error.message);
      // Don't throw - payment succeeded, we can manually fulfill if needed
      // In production, you'd want to alert/notify here
    }
  } else {
    console.log('CREATIVEHUB_API_KEY not set - skipping Printspace order');
  }

  // TODO: Send confirmation email
  // await sendConfirmationEmail(order);

  console.log('Order processed successfully:', order.stripe_session_id);

  return order;
}
