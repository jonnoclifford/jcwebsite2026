/**
 * Lightbox Module
 * Fullscreen image viewer with keyboard nav and accessibility
 */

export function initLightbox() {
  const triggers = document.querySelectorAll('[data-lightbox]');
  if (!triggers.length) return;

  let lightbox = null;
  let currentIndex = 0;
  let images = [];
  let previousFocus = null;

  function createLightbox() {
    const el = document.createElement('div');
    el.className = 'lightbox';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Image viewer');
    el.innerHTML = `
      <div class="lightbox__backdrop" data-lightbox-close></div>
      <div class="lightbox__content">
        <img class="lightbox__image" src="" alt="" />
      </div>
      <button class="lightbox__close" data-lightbox-close aria-label="Close lightbox">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      <button class="lightbox__nav lightbox__nav--prev" data-lightbox-prev aria-label="Previous image">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <button class="lightbox__nav lightbox__nav--next" data-lightbox-next aria-label="Next image">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
      <div class="lightbox__announce visually-hidden" aria-live="polite" aria-atomic="true"></div>
    `;
    document.body.appendChild(el);
    return el;
  }

  function open(index, triggerEl) {
    if (!lightbox) {
      lightbox = createLightbox();
      bindLightboxEvents();
    }

    previousFocus = document.activeElement;
    currentIndex = index;

    const img = lightbox.querySelector('.lightbox__image');
    const triggerRect = triggerEl.getBoundingClientRect();

    // Set transform origin for scale animation
    lightbox.style.setProperty('--origin-x', `${triggerRect.left + triggerRect.width / 2}px`);
    lightbox.style.setProperty('--origin-y', `${triggerRect.top + triggerRect.height / 2}px`);

    updateImage();

    lightbox.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    // Focus trap
    lightbox.querySelector('.lightbox__close').focus();
  }

  function close() {
    if (!lightbox) return;

    lightbox.classList.remove('is-open');
    document.body.style.overflow = '';

    if (previousFocus) {
      previousFocus.focus();
    }
  }

  function updateImage() {
    const img = lightbox.querySelector('.lightbox__image');
    const announce = lightbox.querySelector('.lightbox__announce');
    const data = images[currentIndex];

    img.src = data.src;
    img.alt = data.alt || '';

    announce.textContent = `Image ${currentIndex + 1} of ${images.length}: ${data.alt || 'Image'}`;

    // Show/hide nav based on image count
    const prevBtn = lightbox.querySelector('[data-lightbox-prev]');
    const nextBtn = lightbox.querySelector('[data-lightbox-next]');

    if (images.length <= 1) {
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
    } else {
      prevBtn.style.display = '';
      nextBtn.style.display = '';
    }
  }

  function next() {
    if (images.length <= 1) return;
    currentIndex = (currentIndex + 1) % images.length;
    updateImage();
  }

  function prev() {
    if (images.length <= 1) return;
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    updateImage();
  }

  function bindLightboxEvents() {
    lightbox.addEventListener('click', (e) => {
      if (e.target.closest('[data-lightbox-close]')) {
        close();
      } else if (e.target.closest('[data-lightbox-prev]')) {
        prev();
      } else if (e.target.closest('[data-lightbox-next]')) {
        next();
      }
    });

    // Keyboard navigation on document level for reliable arrow key handling
    document.addEventListener('keydown', (e) => {
      if (!lightbox.classList.contains('is-open')) return;

      if (e.key === 'Escape') {
        close();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key === 'Tab') {
        trapFocus(e);
      }
    });
  }

  function trapFocus(e) {
    const focusable = lightbox.querySelectorAll('button:not([style*="display: none"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Build image array and bind triggers
  triggers.forEach((trigger, i) => {
    const img = trigger.querySelector('img') || trigger;
    images.push({
      src: trigger.dataset.lightbox || img.src,
      alt: img.alt || ''
    });

    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      open(i, trigger);
    });

    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(i, trigger);
      }
    });
  });
}

// Auto-initialize when loaded as part of a bundle
// Only init if lightbox triggers exist on page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('[data-lightbox]')) initLightbox();
  });
} else {
  if (document.querySelector('[data-lightbox]')) initLightbox();
}
