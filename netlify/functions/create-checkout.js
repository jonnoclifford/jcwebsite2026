/**
 * Create Stripe Checkout Session
 *
 * Accepts a cart of items and creates a checkout session
 * Returns a Stripe Checkout URL to redirect to
 */

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Print catalog - must match prints.json
// In production, this could come from a database
const PRINT_CATALOG = {
  'print-001': {
    title: 'Sarajevo Morning',
    sizes: {
      'Small': { dimensions: '10 × 15 in', price: 15000 },
      'Medium': { dimensions: '16 × 24 in', price: 27500 }
    }
  },
  'print-002': {
    title: 'Flower Seller',
    sizes: {
      'Small': { dimensions: '10 × 15 in', price: 15000 },
      'Medium': { dimensions: '16 × 24 in', price: 27500 }
    }
  },
  'print-003': {
    title: 'Mud Trials',
    sizes: {
      'Small': { dimensions: '10 × 15 in', price: 15000 },
      'Medium': { dimensions: '16 × 24 in', price: 27500 }
    }
  },
  'print-004': {
    title: 'Skater',
    sizes: {
      'Small': { dimensions: '10 × 15 in', price: 15000 },
      'Medium': { dimensions: '16 × 24 in', price: 27500 }
    }
  },
  'print-005': {
    title: 'Portrait Study I',
    sizes: {
      'Small': { dimensions: '10 × 15 in', price: 15000 },
      'Medium': { dimensions: '16 × 24 in', price: 27500 }
    }
  },
  'print-006': {
    title: 'Heroes Within',
    sizes: {
      'Small': { dimensions: '10 × 15 in', price: 15000 },
      'Medium': { dimensions: '16 × 24 in', price: 27500 }
    }
  },
  'print-007': {
    title: 'Bright Days',
    sizes: {
      'Small': { dimensions: '10 × 15 in', price: 15000 },
      'Medium': { dimensions: '16 × 24 in', price: 27500 }
    }
  },
  'print-008': {
    title: 'Under The Elms',
    sizes: {
      'Small': { dimensions: '10 × 15 in', price: 15000 },
      'Medium': { dimensions: '16 × 24 in', price: 27500 }
    }
  }
};

export const handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);

    // Support both old single-item format and new cart format
    let items = [];

    if (body.items && Array.isArray(body.items)) {
      // New cart format: { items: [{ printId, size, quantity }] }
      items = body.items;
    } else if (body.printId && body.size) {
      // Old single-item format: { printId, size }
      items = [{ printId: body.printId, size: body.size, quantity: 1 }];
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid request format' })
      };
    }

    // Validate and build line items
    const lineItems = [];
    const orderMetadata = [];

    for (const item of items) {
      const { printId, size, quantity = 1 } = item;

      // Validate print exists
      const print = PRINT_CATALOG[printId];
      if (!print) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: `Invalid print ID: ${printId}` })
        };
      }

      // Validate size exists
      const sizeData = print.sizes[size];
      if (!sizeData) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: `Invalid size "${size}" for print "${print.title}"` })
        };
      }

      // Add to line items
      lineItems.push({
        price_data: {
          currency: 'gbp',
          product_data: {
            name: `${print.title} - Fine Art Print`,
            description: `${size} (${sizeData.dimensions}) - Hahnemühle Photo Rag 308gsm`,
            metadata: {
              print_id: printId,
              size: size
            }
          },
          unit_amount: sizeData.price
        },
        quantity: quantity
      });

      // Store metadata for webhook
      orderMetadata.push({
        print_id: printId,
        title: print.title,
        size: size,
        dimensions: sizeData.dimensions,
        quantity: quantity
      });
    }

    // Get the origin for redirect URLs
    const origin = event.headers.origin || 'https://jonathanclifford.com';

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      shipping_address_collection: {
        allowed_countries: ['GB', 'US', 'CA', 'AU', 'NZ', 'IE', 'FR', 'DE', 'NL', 'BE', 'AT', 'CH', 'IT', 'ES', 'PT', 'SE', 'NO', 'DK', 'FI']
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: 0,
              currency: 'gbp'
            },
            display_name: 'Free UK Shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 5 },
              maximum: { unit: 'business_day', value: 10 }
            }
          }
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: 2500,
              currency: 'gbp'
            },
            display_name: 'International Shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 10 },
              maximum: { unit: 'business_day', value: 20 }
            }
          }
        }
      ],
      metadata: {
        order_items: JSON.stringify(orderMetadata),
        item_count: items.length.toString()
      },
      success_url: `${origin}/prints/success/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/prints/`
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: session.url })
    };

  } catch (error) {
    console.error('Stripe checkout error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to create checkout session' })
    };
  }
};
