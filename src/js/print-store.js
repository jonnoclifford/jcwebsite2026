/**
 * Print Store Module
 * Handles product selection, cart management, and checkout flow
 */

const printData = window.PRINT_STORE_DATA || [];

// Cart state
let cart = [];
let currentPrint = null;
let selectedSize = null;

// DOM Elements
const modal = document.getElementById('print-modal');
const modalImage = document.getElementById('modal-image');
const modalTitle = document.getElementById('modal-title');
const modalProject = document.getElementById('modal-project');
const modalDescription = document.getElementById('modal-description');
const sizeButtons = document.getElementById('size-buttons');
const summaryPrice = document.getElementById('summary-price');
const addToCartButton = document.getElementById('buy-button');
const orderForm = document.getElementById('print-order-form');

// Cart Elements (will be created dynamically or exist in DOM)
let cartSidebar = null;
let cartToggle = null;
let cartCount = null;
let cartItems = null;
let cartTotal = null;
let checkoutButton = null;

/**
 * Load cart from localStorage
 */
function loadCart() {
  try {
    const saved = localStorage.getItem('jc-print-cart');
    cart = saved ? JSON.parse(saved) : [];
  } catch (e) {
    cart = [];
  }
  updateCartUI();
}

/**
 * Save cart to localStorage
 */
function saveCart() {
  localStorage.setItem('jc-print-cart', JSON.stringify(cart));
  updateCartUI();
}

/**
 * Add item to cart
 */
function addToCart(print, size) {
  // Check if same item already in cart
  const existingIndex = cart.findIndex(
    item => item.printId === print.id && item.sizeName === size.name
  );

  if (existingIndex >= 0) {
    // Increase quantity
    cart[existingIndex].quantity += 1;
  } else {
    // Add new item
    cart.push({
      printId: print.id,
      title: print.title,
      project: print.project,
      image: print.image,
      sizeName: size.name,
      dimensions: size.dimensions,
      price: size.price,
      quantity: 1
    });
  }

  saveCart();
  showCartNotification(`Added "${print.title}" to cart`);
}

/**
 * Remove item from cart
 */
function removeFromCart(index) {
  cart.splice(index, 1);
  saveCart();
}

/**
 * Update item quantity
 */
function updateQuantity(index, delta) {
  cart[index].quantity += delta;
  if (cart[index].quantity <= 0) {
    removeFromCart(index);
  } else {
    saveCart();
  }
}

/**
 * Get cart total
 */
function getCartTotal() {
  return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
}

/**
 * Get cart item count
 */
function getCartItemCount() {
  return cart.reduce((count, item) => count + item.quantity, 0);
}

/**
 * Update all cart UI elements
 */
function updateCartUI() {
  // Update cart count badge
  if (cartCount) {
    const count = getCartItemCount();
    cartCount.textContent = count;
    cartCount.hidden = count === 0;
  }

  // Update cart items list
  if (cartItems) {
    if (cart.length === 0) {
      cartItems.innerHTML = '<p class="cart-empty">Your cart is empty</p>';
    } else {
      cartItems.innerHTML = cart.map((item, index) => `
        <div class="cart-item" data-index="${index}">
          <img src="${item.image}/400.jpg" alt="${item.title}" class="cart-item-image">
          <div class="cart-item-details">
            <h4 class="cart-item-title">${item.title}</h4>
            <p class="cart-item-size">${item.sizeName} (${item.dimensions})</p>
            <p class="cart-item-price">£${item.price}</p>
          </div>
          <div class="cart-item-quantity">
            <button type="button" class="cart-qty-btn" data-action="decrease" data-index="${index}" aria-label="Decrease quantity">-</button>
            <span class="cart-qty-value">${item.quantity}</span>
            <button type="button" class="cart-qty-btn" data-action="increase" data-index="${index}" aria-label="Increase quantity">+</button>
          </div>
          <button type="button" class="cart-item-remove" data-action="remove" data-index="${index}" aria-label="Remove item">&times;</button>
        </div>
      `).join('');
    }
  }

  // Update cart total
  if (cartTotal) {
    cartTotal.textContent = `£${getCartTotal()}`;
  }

  // Update checkout button state
  if (checkoutButton) {
    checkoutButton.disabled = cart.length === 0;
  }
}

/**
 * Show cart notification
 */
function showCartNotification(message) {
  // Create notification element if it doesn't exist
  let notification = document.querySelector('.cart-notification');
  if (!notification) {
    notification = document.createElement('div');
    notification.className = 'cart-notification';
    document.body.appendChild(notification);
  }

  notification.textContent = message;
  notification.classList.add('is-visible');

  setTimeout(() => {
    notification.classList.remove('is-visible');
  }, 2500);
}

/**
 * Toggle cart sidebar
 */
function toggleCart() {
  if (cartSidebar) {
    cartSidebar.classList.toggle('is-open');
    document.body.classList.toggle('cart-open');
  }
}

/**
 * Close cart sidebar
 */
function closeCart() {
  if (cartSidebar) {
    cartSidebar.classList.remove('is-open');
    document.body.classList.remove('cart-open');
  }
}

/**
 * Open the print detail modal
 */
function openModal(printId) {
  const print = printData.find(p => p.id === printId);
  if (!print) return;

  currentPrint = print;
  selectedSize = null;

  // Populate modal content
  modalImage.src = `${print.image}/1200.jpg`;
  modalImage.alt = print.title;
  modalTitle.textContent = print.title;
  modalProject.textContent = print.project;
  modalDescription.textContent = print.description;

  // Generate size buttons
  sizeButtons.innerHTML = print.sizes.map((size, index) => `
    <label class="print-size-option">
      <input
        type="radio"
        name="print-size"
        value="${index}"
        class="print-size-radio"
      >
      <span class="print-size-label">
        <span class="print-size-name">${size.name}</span>
        <span class="print-size-dimensions">${size.dimensions}</span>
        <span class="print-size-price">£${size.price}</span>
      </span>
    </label>
  `).join('');

  // Reset state
  summaryPrice.textContent = '£0';
  if (addToCartButton) {
    addToCartButton.disabled = true;
    addToCartButton.textContent = 'Add to Cart';
  }

  // Show modal
  modal.hidden = false;
  document.body.style.overflow = 'hidden';

  // Focus management
  modal.querySelector('.print-modal-close').focus();

  // Listen for size selection
  sizeButtons.querySelectorAll('.print-size-radio').forEach(radio => {
    radio.addEventListener('change', handleSizeChange);
  });
}

/**
 * Close the modal
 */
function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = '';
  currentPrint = null;
  selectedSize = null;
}

/**
 * Handle size selection
 */
function handleSizeChange(e) {
  const sizeIndex = parseInt(e.target.value, 10);
  selectedSize = currentPrint.sizes[sizeIndex];

  // Update UI
  summaryPrice.textContent = `£${selectedSize.price}`;
  if (addToCartButton) {
    addToCartButton.disabled = false;
  }

  // Update active state
  sizeButtons.querySelectorAll('.print-size-option').forEach(opt => {
    opt.classList.remove('is-selected');
  });
  e.target.closest('.print-size-option').classList.add('is-selected');
}

/**
 * Handle add to cart (form submission)
 */
function handleAddToCart(e) {
  e.preventDefault();

  if (!currentPrint || !selectedSize) return;

  addToCart(currentPrint, selectedSize);
  closeModal();
}

/**
 * Handle checkout - redirect to Stripe with all cart items
 */
async function handleCheckout() {
  if (cart.length === 0) return;

  // Update button state
  const originalText = checkoutButton.textContent;
  checkoutButton.textContent = 'Redirecting...';
  checkoutButton.disabled = true;

  try {
    const response = await fetch('/.netlify/functions/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: cart.map(item => ({
          printId: item.printId,
          size: item.sizeName,
          quantity: item.quantity
        }))
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to create checkout');
    }

    // Clear cart on successful redirect
    if (data.url) {
      localStorage.removeItem('jc-print-cart');
      window.location.href = data.url;
    } else {
      throw new Error('No checkout URL returned');
    }

  } catch (error) {
    console.error('Checkout error:', error);
    alert('Sorry, there was an error processing your order. Please try again.');
    checkoutButton.textContent = originalText;
    checkoutButton.disabled = false;
  }
}

/**
 * Handle cart item actions (quantity, remove)
 */
function handleCartAction(e) {
  const button = e.target.closest('[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const index = parseInt(button.dataset.index, 10);

  switch (action) {
    case 'increase':
      updateQuantity(index, 1);
      break;
    case 'decrease':
      updateQuantity(index, -1);
      break;
    case 'remove':
      removeFromCart(index);
      break;
  }
}

/**
 * Handle keyboard navigation
 */
function handleKeydown(e) {
  if (e.key === 'Escape') {
    if (!modal.hidden) {
      closeModal();
    } else if (cartSidebar?.classList.contains('is-open')) {
      closeCart();
    }
  }
}

/**
 * Create cart sidebar HTML
 */
function createCartSidebar() {
  const sidebar = document.createElement('aside');
  sidebar.id = 'cart-sidebar';
  sidebar.className = 'cart-sidebar';
  sidebar.setAttribute('aria-label', 'Shopping cart');
  sidebar.innerHTML = `
    <div class="cart-sidebar-header">
      <h2 class="cart-sidebar-title">Your Cart</h2>
      <button type="button" class="cart-sidebar-close" aria-label="Close cart">&times;</button>
    </div>
    <div class="cart-items" id="cart-items"></div>
    <div class="cart-footer">
      <div class="cart-total-row">
        <span>Total</span>
        <span class="cart-total" id="cart-total">£0</span>
      </div>
      <button type="button" class="cart-checkout-btn" id="cart-checkout-btn" disabled>
        Checkout
      </button>
    </div>
  `;
  document.body.appendChild(sidebar);

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'cart-overlay';
  overlay.addEventListener('click', closeCart);
  document.body.appendChild(overlay);

  return sidebar;
}

/**
 * Initialize print store
 */
function init() {
  // Create cart sidebar
  cartSidebar = createCartSidebar();
  cartItems = document.getElementById('cart-items');
  cartTotal = document.getElementById('cart-total');
  checkoutButton = document.getElementById('cart-checkout-btn');

  // Get cart toggle button (in header)
  cartToggle = document.getElementById('cart-toggle');
  cartCount = document.getElementById('cart-count');

  // Load saved cart
  loadCart();

  // Cart toggle click
  if (cartToggle) {
    cartToggle.addEventListener('click', toggleCart);
  }

  // Cart sidebar close button
  cartSidebar.querySelector('.cart-sidebar-close').addEventListener('click', closeCart);

  // Cart item actions
  cartItems.addEventListener('click', handleCartAction);

  // Checkout button
  checkoutButton.addEventListener('click', handleCheckout);

  // Modal functionality (only if modal exists on page)
  if (modal) {
    // Card click handlers
    document.querySelectorAll('[data-print-trigger]').forEach(trigger => {
      trigger.addEventListener('click', () => {
        const printId = trigger.dataset.printTrigger;
        openModal(printId);
      });
    });

    // Modal close handlers
    document.querySelectorAll('[data-modal-close]').forEach(closer => {
      closer.addEventListener('click', closeModal);
    });

    // Form submission (now adds to cart instead of checkout)
    if (orderForm) {
      orderForm.addEventListener('submit', handleAddToCart);
    }

    // Prevent modal content clicks from closing
    modal.querySelector('.print-modal-container').addEventListener('click', e => {
      e.stopPropagation();
    });
  }

  // Keyboard handling
  document.addEventListener('keydown', handleKeydown);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
