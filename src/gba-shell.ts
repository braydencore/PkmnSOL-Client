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
 * pixel math needed here at all, so Phaser's own Scale.FIT (which watches
 * its parent via a ResizeObserver) just works. This is only a defensive
 * nudge on top of that: iOS Safari's orientation-change/chrome-resize
 * timing is occasionally flaky enough that an explicit refresh (after
 * layout has actually settled) is cheap, safe insurance.
 */
function setupFit(game: Phaser.Game): void {
  const refresh = (): void => {
    game.scale.refresh();
  };

  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', () => setTimeout(refresh, 250));
  window.visualViewport?.addEventListener('resize', refresh);

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
  // scale manager has nothing to correct.
  [100, 400, 1000].forEach((ms) => setTimeout(refresh, ms));

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
function watchPhaseForControlsVisibility(): void {
  window.addEventListener('poposafari:phase', (e) => {
    const hide = (e as CustomEvent<{ hideControls?: boolean }>).detail?.hideControls;
    document.body.classList.toggle('controls-hidden', !!hide);
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
