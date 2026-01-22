/**
 * Printspace/Creativehub API Integration
 *
 * Handles communication with the Creativehub API for print fulfillment.
 * https://api.creativehub.io
 *
 * Environment variables required:
 * - CREATIVEHUB_API_KEY: Your Creativehub API key
 * - CREATIVEHUB_API_URL: API URL (https://api.creativehub.io for production,
 *                        https://api.sandbox.tps-test.io for sandbox)
 */

// Map our print IDs to Creativehub product SKUs
// These need to be configured once you've set up products in Creativehub
const PRINT_PRODUCT_MAP = {
  'print-001': {
    name: 'Sarajevo Morning',
    sizes: {
      'Small': { sku: null, width: 10, height: 15 },   // Configure with Creativehub SKU
      'Medium': { sku: null, width: 16, height: 24 }
    }
  },
  'print-002': {
    name: 'Flower Seller',
    sizes: {
      'Small': { sku: null, width: 10, height: 15 },
      'Medium': { sku: null, width: 16, height: 24 }
    }
  },
  'print-003': {
    name: 'Mud Trials',
    sizes: {
      'Small': { sku: null, width: 10, height: 15 },
      'Medium': { sku: null, width: 16, height: 24 }
    }
  },
  'print-004': {
    name: 'Skater',
    sizes: {
      'Small': { sku: null, width: 10, height: 15 },
      'Medium': { sku: null, width: 16, height: 24 }
    }
  },
  'print-005': {
    name: 'Portrait Study I',
    sizes: {
      'Small': { sku: null, width: 10, height: 15 },
      'Medium': { sku: null, width: 16, height: 24 }
    }
  },
  'print-006': {
    name: 'Heroes Within',
    sizes: {
      'Small': { sku: null, width: 10, height: 15 },
      'Medium': { sku: null, width: 16, height: 24 }
    }
  },
  'print-007': {
    name: 'Bright Days',
    sizes: {
      'Small': { sku: null, width: 10, height: 15 },
      'Medium': { sku: null, width: 16, height: 24 }
    }
  },
  'print-008': {
    name: 'Under The Elms',
    sizes: {
      'Small': { sku: null, width: 10, height: 15 },
      'Medium': { sku: null, width: 16, height: 24 }
    }
  }
};

/**
 * Create an order with Creativehub/Printspace
 *
 * @param {Object} order - Order details from Stripe webhook
 * @param {Array} order.items - Array of { print_id, size, quantity }
 * @param {Object} order.shipping - Shipping address
 * @param {string} order.customerEmail - Customer email
 * @param {string} order.orderId - Our internal order reference (Stripe session ID)
 * @returns {Object} - Creativehub order response
 */
export async function createPrintspaceOrder(order) {
  const apiKey = process.env.CREATIVEHUB_API_KEY;
  const apiUrl = process.env.CREATIVEHUB_API_URL || 'https://api.creativehub.io';

  if (!apiKey) {
    throw new Error('CREATIVEHUB_API_KEY environment variable not set');
  }

  // Build the order items for Creativehub
  const orderItems = [];

  for (const item of order.items) {
    const productConfig = PRINT_PRODUCT_MAP[item.print_id];

    if (!productConfig) {
      console.error(`Unknown print ID: ${item.print_id}`);
      continue;
    }

    const sizeConfig = productConfig.sizes[item.size];

    if (!sizeConfig) {
      console.error(`Unknown size ${item.size} for print ${item.print_id}`);
      continue;
    }

    if (!sizeConfig.sku) {
      console.error(`No Creativehub SKU configured for ${item.print_id} ${item.size}`);
      // In production, you'd want to alert/fail here
      continue;
    }

    orderItems.push({
      sku: sizeConfig.sku,
      quantity: item.quantity || 1,
      // Image URL - Creativehub will fetch the print file from here
      // This should be a high-res print-ready file
      imageUrl: getPrintFileUrl(item.print_id)
    });
  }

  if (orderItems.length === 0) {
    throw new Error('No valid items to order');
  }

  // Build the shipping address
  const shippingAddress = {
    name: order.shipping.name,
    address1: order.shipping.address.line1,
    address2: order.shipping.address.line2 || '',
    city: order.shipping.address.city,
    state: order.shipping.address.state || '',
    postcode: order.shipping.address.postal_code,
    country: order.shipping.address.country
  };

  // Create the order payload
  const orderPayload = {
    externalReference: order.orderId,
    email: order.customerEmail,
    shippingAddress: shippingAddress,
    items: orderItems,
    // Webhook URL for dispatch notifications
    webhookUrl: `${process.env.URL || 'https://jonathanclifford.com'}/.netlify/functions/printspace-webhook`
  };

  console.log('Creating Creativehub order:', JSON.stringify(orderPayload, null, 2));

  // Make the API request
  const response = await fetch(`${apiUrl}/v1/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `ApiKey ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(orderPayload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Creativehub API error:', response.status, errorText);
    throw new Error(`Creativehub API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('Creativehub order created:', result);

  return result;
}

/**
 * Get the print file URL for a given print ID
 * These should be high-resolution print-ready files hosted somewhere Creativehub can access
 *
 * @param {string} printId - The print ID
 * @returns {string} - URL to the print file
 */
function getPrintFileUrl(printId) {
  // TODO: Configure actual print file URLs
  // These should be high-res files (300 DPI minimum)
  // You might want to host these on a separate service or use Netlify Large Media
  const baseUrl = process.env.PRINT_FILES_URL || 'https://jonathanclifford.com/print-files';
  return `${baseUrl}/${printId}.jpg`;
}

/**
 * Get available products from Creativehub
 * Useful for mapping SKUs to your prints
 */
export async function getCreativehubProducts() {
  const apiKey = process.env.CREATIVEHUB_API_KEY;
  const apiUrl = process.env.CREATIVEHUB_API_URL || 'https://api.creativehub.io';

  if (!apiKey) {
    throw new Error('CREATIVEHUB_API_KEY environment variable not set');
  }

  const response = await fetch(`${apiUrl}/v1/products`, {
    headers: {
      'Authorization': `ApiKey ${apiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.status}`);
  }

  return response.json();
}

/**
 * Get order status from Creativehub
 */
export async function getOrderStatus(orderId) {
  const apiKey = process.env.CREATIVEHUB_API_KEY;
  const apiUrl = process.env.CREATIVEHUB_API_URL || 'https://api.creativehub.io';

  if (!apiKey) {
    throw new Error('CREATIVEHUB_API_KEY environment variable not set');
  }

  const response = await fetch(`${apiUrl}/v1/orders/${orderId}`, {
    headers: {
      'Authorization': `ApiKey ${apiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch order: ${response.status}`);
  }

  return response.json();
}
