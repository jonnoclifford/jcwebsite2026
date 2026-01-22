/**
 * Slideshow Module
 * Homepage hero slideshow with auto-advance, keyboard nav, and touch support
 */

export function initSlideshow() {
  const slideshow = document.querySelector('[data-slideshow]');
  if (!slideshow) return;

  const slides = slideshow.querySelectorAll('[data-slide]');
  if (slides.length < 2) return;

  // Check if slideshow was already initialized by inline script (e.g., homepage)
  // If any slide already has is-active class, skip initialization to avoid conflicts
  const alreadyInitialized = Array.from(slides).some(slide => slide.classList.contains('is-active'));
  if (alreadyInitialized) return;

  let currentIndex = 0;
  let autoplayInterval = null;
  let isPaused = false;
  let touchStartX = 0;
  let touchEndX = 0;

  const AUTOPLAY_DELAY = 6000;
  const SWIPE_THRESHOLD = 50;

  // Set initial state
  slides.forEach((slide, i) => {
    slide.setAttribute('aria-hidden', i !== 0);
    if (i === 0) slide.classList.add('is-active');
  });

  function goToSlide(index) {
    if (index === currentIndex) return;

    const prevSlide = slides[currentIndex];
    const nextSlide = slides[index];

    prevSlide.classList.remove('is-active');
    prevSlide.setAttribute('aria-hidden', 'true');

    nextSlide.classList.add('is-active');
    nextSlide.setAttribute('aria-hidden', 'false');

    currentIndex = index;
    preloadAdjacent();
  }

  function nextSlide() {
    const next = (currentIndex + 1) % slides.length;
    goToSlide(next);
  }

  function prevSlide() {
    const prev = (currentIndex - 1 + slides.length) % slides.length;
    goToSlide(prev);
  }

  function preloadAdjacent() {
    const nextIndex = (currentIndex + 1) % slides.length;
    const prevIndex = (currentIndex - 1 + slides.length) % slides.length;

    [nextIndex, prevIndex].forEach(i => {
      const img = slides[i].querySelector('img[data-src]');
      if (img && img.dataset.src) {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
      }
    });
  }

  function startAutoplay() {
    if (autoplayInterval) return;
    autoplayInterval = setInterval(() => {
      if (!isPaused) nextSlide();
    }, AUTOPLAY_DELAY);
  }

  function stopAutoplay() {
    if (autoplayInterval) {
      clearInterval(autoplayInterval);
      autoplayInterval = null;
    }
  }

  // Pause on hover/focus
  slideshow.addEventListener('mouseenter', () => { isPaused = true; });
  slideshow.addEventListener('mouseleave', () => { isPaused = false; });
  slideshow.addEventListener('focusin', () => { isPaused = true; });
  slideshow.addEventListener('focusout', () => { isPaused = false; });

  // Keyboard navigation
  slideshow.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextSlide();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevSlide();
    }
  });

  // Touch/swipe support
  slideshow.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  slideshow.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;

    if (Math.abs(diff) > SWIPE_THRESHOLD) {
      if (diff > 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }
  }, { passive: true });

  // Navigation buttons
  const prevBtn = slideshow.querySelector('[data-slideshow-prev]');
  const nextBtn = slideshow.querySelector('[data-slideshow-next]');

  if (prevBtn) {
    prevBtn.addEventListener('click', prevSlide);
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', nextSlide);
  }

  // Start
  preloadAdjacent();
  startAutoplay();

  // Cleanup on page hide
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAutoplay();
    } else {
      startAutoplay();
    }
  });
}

// Auto-initialize when loaded as part of a bundle
// Only init if slideshow element exists on page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('[data-slideshow]')) initSlideshow();
  });
} else {
  if (document.querySelector('[data-slideshow]')) initSlideshow();
}
