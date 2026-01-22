/**
 * Lazy Load Module
 * IntersectionObserver-based image lazy loading with blur-up effect
 */

export function initLazyLoad() {
  const images = document.querySelectorAll('[data-src]');
  if (!images.length) return;

  // Check for native lazy loading support as enhancement
  const supportsNative = 'loading' in HTMLImageElement.prototype;

  const options = {
    root: null,
    rootMargin: '50px 0px',
    threshold: 0.01
  };

  function loadImage(img) {
    const src = img.dataset.src;
    const srcset = img.dataset.srcset;

    if (!src) return;

    // Create a temporary image to preload
    const tempImg = new Image();

    tempImg.onload = () => {
      img.src = src;
      if (srcset) {
        img.srcset = srcset;
      }
      img.removeAttribute('data-src');
      img.removeAttribute('data-srcset');

      // Remove loading class for blur-up transition
      requestAnimationFrame(() => {
        img.classList.remove('img-loading');
        img.classList.add('img-loaded');
      });
    };

    tempImg.onerror = () => {
      img.classList.remove('img-loading');
      img.classList.add('img-error');
    };

    tempImg.src = src;
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          loadImage(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, options);

    images.forEach(img => {
      img.classList.add('img-loading');
      observer.observe(img);
    });
  } else {
    // Fallback: load all images immediately
    images.forEach(img => {
      loadImage(img);
    });
  }
}

// Auto-initialize when loaded as part of a bundle
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLazyLoad);
} else {
  initLazyLoad();
}
