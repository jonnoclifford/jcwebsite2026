/**
 * Printspace/Creativehub Webhook Handler
 *
 * Receives notifications from Creativehub when orders are dispatched
 * or have tracking information available.
 *
 * Webhook events include:
 * - order.dispatched - Order has been shipped
 * - order.delivered - Order has been delivered (if tracking available)
 */

export const handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Optional: Verify webhook signature if Creativehub provides one
  // const signature = event.headers['x-creativehub-signature'];
  // if (!verifySignature(event.body, signature)) {
  //   return { statusCode: 401, body: 'Invalid signature' };
  // }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    console.error('Failed to parse webhook payload:', e);
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  console.log('Received Printspace webhook:', JSON.stringify(payload, null, 2));

  const eventType = payload.event || payload.type;
  const orderData = payload.data || payload.order || payload;

  switch (eventType) {
    case 'order.dispatched':
    case 'dispatched':
      await handleOrderDispatched(orderData);
      break;

    case 'order.delivered':
    case 'delivered':
      await handleOrderDelivered(orderData);
      break;

    case 'order.failed':
    case 'failed':
      await handleOrderFailed(orderData);
      break;

    default:
      console.log(`Unhandled Printspace event: ${eventType}`);
  }

  // Return 200 to acknowledge receipt
  return {
    statusCode: 200,
    body: JSON.stringify({ received: true })
  };
};

/**
 * Handle order dispatched notification
 * Send tracking info to customer
 */
async function handleOrderDispatched(orderData) {
  const {
    externalReference,  // Our Stripe session ID
    trackingNumber,
    trackingUrl,
    carrier,
    dispatchedAt
  } = orderData;

  console.log('Order dispatched:', {
    orderId: externalReference,
    trackingNumber,
    trackingUrl,
    carrier,
    dispatchedAt
  });

  // TODO: Look up customer email from our order records
  // const order = await getOrderByStripeSessionId(externalReference);

  // TODO: Send dispatch notification email to customer
  // await sendDispatchEmail({
  //   to: order.customer_email,
  //   orderId: externalReference,
  //   trackingNumber,
  //   trackingUrl,
  //   carrier
  // });

  // TODO: Update order status in database
  // await updateOrderStatus(externalReference, 'dispatched', {
  //   tracking_number: trackingNumber,
  //   tracking_url: trackingUrl,
  //   carrier,
  //   dispatched_at: dispatchedAt
  // });

  console.log('Dispatch notification processed for order:', externalReference);
}

/**
 * Handle order delivered notification
 */
async function handleOrderDelivered(orderData) {
  const { externalReference, deliveredAt } = orderData;

  console.log('Order delivered:', {
    orderId: externalReference,
    deliveredAt
  });

  // TODO: Update order status in database
  // await updateOrderStatus(externalReference, 'delivered', {
  //   delivered_at: deliveredAt
  // });

  console.log('Delivery notification processed for order:', externalReference);
}

/**
 * Handle order failed notification
 * This could happen if there's an issue with the print file or fulfillment
 */
async function handleOrderFailed(orderData) {
  const { externalReference, reason, failedAt } = orderData;

  console.error('Order failed:', {
    orderId: externalReference,
    reason,
    failedAt
  });

  // TODO: Notify admin of failed order
  // await sendAdminAlert({
  //   subject: `Print order failed: ${externalReference}`,
  //   body: `Order ${externalReference} failed. Reason: ${reason}`
  // });

  // TODO: Update order status in database
  // await updateOrderStatus(externalReference, 'failed', {
  //   failure_reason: reason,
  //   failed_at: failedAt
  // });

  console.log('Failure notification processed for order:', externalReference);
}
