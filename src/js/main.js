/**
 * Main Entry Point
 * Jonathan Clifford Portfolio
 */

import { initSlideshow } from './slideshow.js';
import { initLightbox } from './lightbox.js';
import { initNavigation } from './navigation.js';
import { initLazyLoad } from './lazyload.js';
import { initVideoModal } from './video-modal.js';
import { initDarkMode } from './dark-mode.js';

/**
 * Register Service Worker for caching and offline support
 * Only registers in production (not on localhost)
 */
function registerServiceWorker() {
  // Check if service workers are supported
  if (!('serviceWorker' in navigator)) {
    return;
  }

  // Only register in production (skip localhost/dev)
  const isLocalhost = Boolean(
    window.location.hostname === 'localhost' ||
    window.location.hostname === '[::1]' ||
    window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
  );

  if (isLocalhost) {
    return;
  }

  // Register the service worker
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;

        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available - auto-activate via skipWaiting in SW
            }
          });
        }
      });

    } catch (error) {
      console.error('[SW] Service worker registration failed:', error);
    }
  });
}

function init() {
  // Register service worker first
  registerServiceWorker();

  // Always initialize
  initDarkMode();
  initNavigation();
  initLazyLoad();

  // Conditionally initialize based on page elements
  if (document.querySelector('[data-slideshow]')) {
    initSlideshow();
  }

  if (document.querySelector('[data-lightbox]')) {
    initLightbox();
  }

  if (document.querySelector('[data-video]')) {
    initVideoModal();
  }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
