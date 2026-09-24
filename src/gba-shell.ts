import Phaser from 'phaser';
import { DEFAULT_KEYBINDS, GameAction, KEYBIND_CACHE_KEY } from '@poposafari/types';

const SCENE_KEY = 'GameScene';

type Direction = 'up' | 'down' | 'left' | 'right';

const ACTION_BUTTONS: Record<string, GameAction> = {
  a: GameAction.CONFIRM,
  b: GameAction.CANCEL,
  start: GameAction.MENU,
  select: GameAction.QUICKSLOT,
  map: GameAction.MAP,
  running: GameAction.RUNNING,
  chat: GameAction.CHAT,
};

/** Touch is the PRIMARY input (coarse pointer, no hover) — a touch-capable
 * laptop with a keyboard/mouse stays in plain desktop mode. Also used by
 * install-gate.ts to decide who gets gated behind the home-screen-install
 * screen. */
export function isTouchPrimary(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches &&
    window.matchMedia('(hover: none)').matches
  );
}

const DESIGN_HEIGHT = 1080;
const MIN_DESIGN_WIDTH = 1920; // never render narrower than the original 16:9 design
const MAX_DESIGN_WIDTH = 2700; // sanity ceiling for garbage aspect ratios only -- comfortably
// covers every real phone (even an extreme 21:9 needs ~2520 at height 1080)

/**
 * Touch mode is landscape-only, so #app's aspect ratio here is always the
 * device's actual screen aspect. Phaser.Scale.FIT holds a fixed 1920x1080
 * logical canvas and letterboxes anything wider in CSS, *outside* the
 * canvas element entirely — dead space Phaser can't draw into, and nearly
 * every modern phone in landscape is wider than 16:9 (19.5:9-21:9 typical).
 *
 * computeTouchGameSize() sizes the logical canvas to the device's real
 * aspect ratio instead, height pinned at 1080 so every screen's pixel-tuned
 * offsets/font sizes keep their exact visual scale — only the width grows.
 * Center-anchored UI (how every screen already positions things) doesn't
 * need to move, it just gets more breathing room; the overworld camera
 * shows more environment on the sides instead of black bars.
 *
 * Guarded against garbage viewport reads (0/NaN, seen transiently on iOS
 * Safari during layout churn) and clamped to a sane range -- this feeds
 * Phaser.Scale.NONE + setGameSize(), so a bad value here would resize the
 * actual WebGL canvas/context, not just misdraw a frame.
 */
export function computeTouchGameSize(): { width: number; height: number } {
  const fallback = { width: MIN_DESIGN_WIDTH, height: DESIGN_HEIGHT };
  const w = window.visualViewport?.width ?? window.innerWidth;
  const h = window.visualViewport?.height ?? window.innerHeight;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return fallback;

  const aspect = w / h;
  if (!Number.isFinite(aspect) || aspect <= 0) return fallback;

  const width = Math.round(
    Math.min(MAX_DESIGN_WIDTH, Math.max(MIN_DESIGN_WIDTH, DESIGN_HEIGHT * aspect)),
  );
  return { width, height: DESIGN_HEIGHT };
}

/** Reads the player's current keybind for an action (respecting any rebind
 * made in the Options screen), falling back to the default if unset. */
function getBoundCode(action: GameAction): string {
  try {
    const raw = localStorage.getItem(KEYBIND_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<GameAction, string>>;
      const code = parsed[action];
      if (typeof code === 'string' && code) return code;
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_KEYBINDS[action];
}

// Matches KEY.UP/DOWN/LEFT/RIGHT in types/keyboard.ts (standard browser
// KeyboardEvent.code values for the arrow keys).
const DIR_CODES: Record<Direction, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

function wireDpad(scene: Phaser.Scene): void {
  const dpadEl = document.getElementById('dpad');
  if (!dpadEl) return;

  const keyboard = scene.input.keyboard!;
  const kc = Phaser.Input.Keyboard.KeyCodes;
  // Reusing the SAME Key instances OverworldUi's own createCursorKeys()
  // reads from (Phaser's addKey is idempotent per keyCode) — toggling
  // .isDown here drives movement exactly as if the arrow key were
  // physically held, no synthetic keyboard events needed.
  const dirKeys: Record<Direction, Phaser.Input.Keyboard.Key> = {
    up: keyboard.addKey(kc.UP),
    down: keyboard.addKey(kc.DOWN),
    left: keyboard.addKey(kc.LEFT),
    right: keyboard.addKey(kc.RIGHT),
  };

  const dirBtns = Array.from(dpadEl.querySelectorAll<HTMLElement>('[data-dir]'));
  let touchId: number | null = null;
  let curDir: Direction | null = null;

  const dirUnder = (x: number, y: number): Direction | null => {
    const el = document.elementFromPoint(x, y);
    const btn = el?.closest<HTMLElement>('#dpad [data-dir]');
    return (btn?.dataset.dir as Direction | undefined) ?? null;
  };

  const setDir = (dir: Direction | null): void => {
    if (dir === curDir) return;
    if (curDir) {
      dirKeys[curDir].isDown = false;
      dirBtns.find((b) => b.dataset.dir === curDir)?.classList.remove('on');
    }
    if (dir) {
      dirKeys[dir].isDown = true;
      dirBtns.find((b) => b.dataset.dir === dir)?.classList.add('on');
      navigator.vibrate?.(6);
      // Continuous overworld walking reads the isDown toggle above, same
      // as a physically-held arrow key — but discrete UI (the title
      // screen's menu cursor, InputManager's onInput handlers generally)
      // reacts to an actual 'keydown' EVENT, once per press, not to
      // isDown state. Without this, the D-pad silently does nothing on
      // any screen that isn't polling cursor keys every frame.
      keyboard.emit('keydown', { code: DIR_CODES[dir], repeat: false } as unknown as KeyboardEvent);
    }
    curDir = dir;
  };

  // A real virtual d-pad lets a thumb slide between directions without
  // lifting — the browser keeps routing touch events to whichever button a
  // touch *started* on, so track the one finger driving the pad ourselves
  // and re-check which quadrant it's over on every move.
  dpadEl.addEventListener(
    'touchstart',
    (e) => {
      if (touchId !== null) return;
      const t = e.changedTouches[0];
      touchId = t.identifier;
      e.preventDefault();
      setDir(dirUnder(t.clientX, t.clientY));
    },
    { passive: false },
  );
  dpadEl.addEventListener(
    'touchmove',
    (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== touchId) continue;
        e.preventDefault();
        setDir(dirUnder(t.clientX, t.clientY));
      }
    },
    { passive: false },
  );
  const endTouch = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== touchId) continue;
      setDir(null);
      touchId = null;
    }
  };
  dpadEl.addEventListener('touchend', endTouch, { passive: false });
  dpadEl.addEventListener('touchcancel', endTouch, { passive: false });

  // Releasing the whole shell (e.g. app backgrounded mid-press) shouldn't
  // leave a direction stuck held.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setDir(null);
  });
}

function wireActionButtons(scene: Phaser.Scene): void {
  const keyboard = scene.input.keyboard!;

  document.querySelectorAll<HTMLElement>('#touch-controls [data-action]').forEach((btn) => {
    const action = ACTION_BUTTONS[btn.dataset.action ?? ''];
    if (!action) return;

    const down = (e: Event): void => {
      e.preventDefault();
      btn.classList.add('on');
      // InputManager listens on this same emitter for a 'keydown' with a
      // `.code`; it only ever reads `.code`/`.repeat`, so a plain object is
      // enough — no need to fabricate a real (and largely unspoofable)
      // native KeyboardEvent.
      keyboard.emit('keydown', { code: getBoundCode(action), repeat: false } as unknown as KeyboardEvent);
      navigator.vibrate?.(8);
    };
    const up = (e: Event): void => {
      e.preventDefault();
      btn.classList.remove('on');
    };

    btn.addEventListener('touchstart', down, { passive: false });
    btn.addEventListener('touchend', up, { passive: false });
    btn.addEventListener('touchcancel', up, { passive: false });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}

/**
 * #app fills the viewport directly via CSS (dvw/dvh, see style.css) — no
 * pixel math needed here at all for Scale.FIT (desktop), which watches its
 * parent via a ResizeObserver and just works.
 *
 * Touch mode runs Scale.NONE instead, with computeTouchGameSize() sizing
 * the logical canvas by hand -- see that function's comment. Plain
 * 'resize'/visualViewport 'resize' events fire often and transiently on
 * iOS Safari (URL bar show/hide, keyboard toggle, mid-gesture layout
 * churn), so re-sizing the actual WebGL canvas/context on every single one
 * — especially while a scene transition is already in flight, e.g. right
 * as PLAY connects to the overworld — risks corrupting Phaser's render
 * state rather than just misdrawing a frame. Each of those calls refresh()
 * immediately (cheap; just re-syncs input-coordinate mapping against the
 * live CSS box) but only *debounces* a logical resize, so a burst of them
 * collapses into a single setGameSize() once things go quiet — see
 * debouncedApplySize() below. The staggered initial-settle checks and
 * orientationchange are deliberate single-shot events, not a continuous
 * stream, so those call setGameSize() immediately instead.
 */
function setupFit(game: Phaser.Game): void {
  const isTouchMode = document.body.classList.contains('gba-touch');

  const refresh = (): void => {
    game.scale.refresh();
  };

  const applySize = (): void => {
    if (!isTouchMode) return;
    try {
      const { width, height } = computeTouchGameSize();
      if (width !== game.scale.width || height !== game.scale.height) {
        game.scale.setGameSize(width, height);
        // Scale.NONE doesn't auto-propagate a game-size change to each
        // scene's camera viewport the way FIT's own resize handling does --
        // without this, the camera keeps its previous (now stale) width,
        // leaving the newly-added canvas area an unrendered black gap.
        const scene = game.scene.getScene(SCENE_KEY);
        scene?.cameras?.main?.setSize(width, height);
      }
    } catch {
      // Never let a bad viewport read here take the game down mid-session.
    }
  };

  // Plain resize/visualViewport events fire often and transiently on iOS
  // Safari (URL bar show/hide, keyboard toggle, mid-gesture layout churn) --
  // reacting to every single one by resizing the actual WebGL canvas/context
  // risks corrupting Phaser's render state mid-scene-transition rather than
  // just misdrawing a frame. Debounced instead of ignored: the CSS box
  // (#app is 100dvw/100dvh) already tracks the live viewport continuously,
  // so a burst of these just needs refresh() (cheap input-coordinate remap)
  // right away; only once they've gone quiet for a beat does the logical
  // canvas size get corrected to match, so a real settled change (like the
  // URL bar actually staying hidden) doesn't leave the canvas stretched to
  // a stale aspect ratio forever.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedApplySize = (): void => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      applySize();
      refresh();
    }, 400);
  };
  const onTransientResize = (): void => {
    refresh();
    debouncedApplySize();
  };

  window.addEventListener('resize', onTransientResize);
  window.addEventListener('orientationchange', () => setTimeout(() => {
    applySize();
    refresh();
  }, 250));
  window.visualViewport?.addEventListener('resize', onTransientResize);

  // A freshly-launched iOS standalone web app (opened from its Home Screen
  // icon, not a browser tab) settles its viewport a beat after Phaser's
  // canvas is already up — since nothing about a fullscreen standalone app
  // naturally fires a resize/orientationchange afterward, anything that
  // read the viewport before it settled (rex-plugins' InputText DOM
  // overlay is the known offender: it position-syncs its HTML <input>
  // against getBoundingClientRect() once, not continuously) can end up
  // stuck reading against a stale rect, showing typed text in the wrong
  // spot on the very first screen (the login form). These staggered
  // refreshes are cheap insurance against that race — they no-op once the
  // scale manager has nothing to correct. Also the only place besides
  // orientationchange that re-sizes the touch-mode logical canvas, since by
  // ~1s in, the viewport has reliably settled for the rest of the session.
  [100, 400, 1000].forEach((ms) =>
    setTimeout(() => {
      applySize();
      refresh();
    }, ms),
  );

  // iOS Safari ignores the viewport meta's user-scalable=no for pinch-zoom
  // (an intentional accessibility override) — block it explicitly so a
  // stray two-finger touch doesn't zoom the page instead of playing.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
}

// game.scene.ts dispatches this on every phase transition — screens with
// no player movement and their own tappable canvas UI (login form, title
// menu, account forms, the loading spinner) report hideControls: true,
// since the floating D-pad/A/B/Start/Select overlay would otherwise sit on
// top of that UI's own buttons, blocking taps to them.
//
// LoadingUi (loading.ui.ts) additionally reports its own show()/hide() via
// 'poposafari:loading' — it covers the whole screen during Stage 2's
// background asset load and the Pokemon-asset load WITHOUT a phase switch
// (the underlying phase, e.g. Title, doesn't change), so those moments
// would otherwise slip past the phase-based check above and leave the
// joystick/buttons floating uselessly over the loading bar. Controls stay
// hidden if EITHER signal wants them hidden.
let phaseWantsHidden = false;
let loadingActive = false;
let modalActive = false;

function applyControlsVisibility(): void {
  document.body.classList.toggle('controls-hidden', phaseWantsHidden || loadingActive || modalActive);
}

function watchPhaseForControlsVisibility(): void {
  window.addEventListener('poposafari:phase', (e) => {
    phaseWantsHidden = !!(e as CustomEvent<{ hideControls?: boolean }>).detail?.hideControls;
    applyControlsVisibility();
  });
  window.addEventListener('poposafari:loading', (e) => {
    loadingActive = !!(e as CustomEvent<{ active?: boolean }>).detail?.active;
    applyControlsVisibility();
  });
  // Dispatched by in-overworld modals (ChatUi, ...) that open on top of live
  // gameplay without a phase switch -- see the comment on ChatUi.show().
  window.addEventListener('poposafari:modal', (e) => {
    modalActive = !!(e as CustomEvent<{ active?: boolean }>).detail?.active;
    applyControlsVisibility();
  });
}

export function prepareGbaShell(): boolean {
  if (!isTouchPrimary()) return false;
  document.body.classList.add('gba-touch', 'controls-hidden');
  watchPhaseForControlsVisibility();
  return true;
}

export function initGbaShell(game: Phaser.Game): void {
  if (!document.body.classList.contains('gba-touch')) return;

  setupFit(game);

  const wire = (): void => {
    const scene = game.scene.getScene(SCENE_KEY);
    if (!scene?.input?.keyboard) return;
    wireDpad(scene);
    wireActionButtons(scene);
  };

  if (game.scene.getScene(SCENE_KEY)?.input?.keyboard) {
    wire();
  } else {
    game.events.once(Phaser.Core.Events.READY, wire);
  }
}
