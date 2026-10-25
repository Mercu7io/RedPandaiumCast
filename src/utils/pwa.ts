/**
 * Utility functions for Progressive Web App (PWA) detection and lifecycle management.
 */

export function isPwaMode(): boolean {
  if (typeof window === 'undefined') return false;

  // 1. Standard W3C Display Mode Standalone (Chrome, Edge, Android PWA)
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }

  // 2. iOS Safari standalone mode
  if ((window.navigator as any)?.standalone === true) {
    return true;
  }

  // 3. Android Trusted Web Activity (TWA)
  if (typeof document !== 'undefined' && document.referrer?.includes('android-app://')) {
    return true;
  }

  // 4. URL query parameters (e.g., manifest start_url '?source=pwa' or '?pwa=1')
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('source') === 'pwa' || params.get('pwa') === '1' || params.get('pwa') === 'true') {
      return true;
    }
  } catch (_) {}

  // 5. Local storage persistence flag if installed
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('jwcast_is_pwa') === 'true') {
      return true;
    }
  } catch (_) {}

  return false;
}
