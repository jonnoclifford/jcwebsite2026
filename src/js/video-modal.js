/**
 * Video Modal Module
 * Vimeo video player modal with dynamic iframe creation
 */

export function initVideoModal() {
  const triggers = document.querySelectorAll('[data-video]');
  if (!triggers.length) return;

  let modal = null;
  let previousFocus = null;

  function createModal() {
    const el = document.createElement('div');
    el.className = 'video-modal';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Video player');
    el.innerHTML = `
      <div class="video-modal__backdrop" data-video-close></div>
      <div class="video-modal__content">
        <div class="video-modal__player"></div>
        <button class="video-modal__close" data-video-close aria-label="Close video">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
    document.body.appendChild(el);
    return el;
  }

  function getVimeoId(url) {
    // Handle various Vimeo URL formats
    const patterns = [
      /vimeo\.com\/(\d+)/,
      /player\.vimeo\.com\/video\/(\d+)/,
      /vimeo\.com\/video\/(\d+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    // If it's just a number, return it
    if (/^\d+$/.test(url)) return url;

    return null;
  }

  function createIframe(videoId) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://player.vimeo.com/video/${videoId}?autoplay=1&title=0&byline=0&portrait=0&dnt=1`;
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('title', 'Video player');
    iframe.setAttribute('loading', 'lazy');
    return iframe;
  }

  function open(videoUrl) {
    if (!modal) {
      modal = createModal();
      bindModalEvents();
    }

    const videoId = getVimeoId(videoUrl);
    if (!videoId) {
      console.error('Invalid Vimeo URL:', videoUrl);
      return;
    }

    previousFocus = document.activeElement;

    const player = modal.querySelector('.video-modal__player');
    const iframe = createIframe(videoId);
    player.appendChild(iframe);

    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    modal.querySelector('.video-modal__close').focus();
  }

  function close() {
    if (!modal) return;

    modal.classList.remove('is-open');
    document.body.style.overflow = '';

    // Destroy iframe to stop video
    const player = modal.querySelector('.video-modal__player');
    player.innerHTML = '';

    if (previousFocus) {
      previousFocus.focus();
    }
  }

  function bindModalEvents() {
    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-video-close]')) {
        close();
      }
    });

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        close();
      }
    });
  }

  // Bind triggers
  triggers.forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const videoUrl = trigger.dataset.video;
      if (videoUrl) {
        open(videoUrl);
      }
    });

    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const videoUrl = trigger.dataset.video;
        if (videoUrl) {
          open(videoUrl);
        }
      }
    });
  });
}

// Auto-initialize when loaded as part of a bundle
// Only init if video triggers exist on page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('[data-video]')) initVideoModal();
  });
} else {
  if (document.querySelector('[data-video]')) initVideoModal();
}
