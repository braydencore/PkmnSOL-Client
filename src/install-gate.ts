import { isTouchPrimary } from './gba-shell';

/** True once this page is running as an installed home-screen app (its own
 * window, no browser chrome) rather than a regular browser tab. iOS Safari
 * doesn't support the standard `display-mode` media query for this — it
 * exposes the older, non-standard `navigator.standalone` instead. */
function isStandalone(): boolean {
  const viaMediaQuery =
    typeof window.matchMedia === 'function' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches);
  const viaIosFlag = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return viaMediaQuery || viaIosFlag;
}

function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as "MacIntel" in the UA string — multi-touch is
    // the only reliable way to tell it apart from an actual Mac.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent);
}

/** Touch devices only get the real game once they're running installed —
 * there's no way to lay the game out well while a browser's own URL bar
 * and tab strip are eating into the viewport on top of it. Desktop/mouse
 * players are never gated (isTouchPrimary excludes them). */
export function shouldGateForInstall(): boolean {
  return isTouchPrimary() && !isStandalone();
}

export function renderInstallGate(): void {
  document.body.classList.add('install-gate');

  const steps = isIOS()
    ? [
        'Tap the <strong>Share</strong> button in the toolbar.',
        'Scroll down and tap <strong>Add to Home Screen</strong>.',
        'Tap <strong>Add</strong> in the top-right corner.',
        'Close this tab, then open PopoSafari from your Home Screen.',
      ]
    : isAndroid()
      ? [
          'Tap the <strong>⋮ menu</strong> in your browser.',
          'Tap <strong>Add to Home Screen</strong> (or <strong>Install app</strong>).',
          'Confirm with <strong>Add</strong> / <strong>Install</strong>.',
          'Close this tab, then open PopoSafari from your Home Screen.',
        ]
      : [
          'Open this page in Safari (iPhone/iPad) or Chrome (Android).',
          'Use the browser menu to <strong>Add to Home Screen</strong>.',
          'Close this tab, then open PopoSafari from your Home Screen.',
        ];

  const list = document.getElementById('install-gate-steps');
  if (list) list.innerHTML = steps.map((step) => `<li>${step}</li>`).join('');
}
