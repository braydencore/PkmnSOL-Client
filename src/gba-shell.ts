import Phaser from 'phaser';
import { DEFAULT_KEYBINDS, GameAction, KEYBIND_CACHE_KEY } from '@poposafari/types';

const SCENE_KEY = 'GameScene';

type Direction = 'up' | 'down' | 'left' | 'right';

const ACTION_BUTTONS: Record<string, GameAction> = {
  a: GameAction.CONFIRM,
  b: GameAction.CANCEL,
  start: GameAction.MENU,
  select: GameAction.QUICKSLOT,
};

/** Touch is the PRIMARY input (coarse pointer, no hover) — a touch-capable
 * laptop with a keyboard/mouse stays in plain desktop mode. */
function isTouchPrimary(): boolean {
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

/** Scales the whole console (as one proportional unit, like zooming a photo
 * of a real device) to fit the viewport in either orientation. #screen keeps
 * a fixed 16:9 design size — Phaser's own Scale.FIT handles fitting the
 * canvas inside it, so this never needs to touch Phaser directly. */
function setupFit(): void {
  const consoleEl = document.getElementById('gba-console');
  if (!consoleEl) return;

  const fit = (): void => {
    const vv = window.visualViewport;
    const vw = vv ? vv.width : window.innerWidth;
    const vh = vv ? vv.height : window.innerHeight;
    const s = Math.max(0.3, Math.min(vw / consoleEl.offsetWidth, vh / consoleEl.offsetHeight));
    consoleEl.style.transform = `scale(${s})`;
  };

  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 200));
  window.visualViewport?.addEventListener('resize', fit);

  // iOS Safari ignores the viewport meta's user-scalable=no for pinch-zoom
  // (an intentional accessibility override) — block it explicitly so a
  // stray two-finger touch doesn't zoom the page instead of the game.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
}

/**
 * Must run BEFORE `new Phaser.Game(...)` — Phaser reads its parent element's
 * current CSS size once, synchronously, at construction, so #app needs to
 * already be inside the shell's fixed-size #screen (not the default
 * full-window layout) the moment the game boots. Returns whether the shell
 * was activated, so callers can skip the post-construction wiring below.
 */
export function prepareGbaShell(): boolean {
  if (!isTouchPrimary()) return false;
  document.body.classList.add('gba-touch');
  return true;
}

export function initGbaShell(game: Phaser.Game): void {
  if (!document.body.classList.contains('gba-touch')) return;

  // Deliberately deferred until AFTER Phaser exists: Phaser's Scale.FIT
  // reads #app's on-screen bounding rect once at construction to compute
  // its own internal canvas fit, and that read is transform-aware — if the
  // console's viewport-fit transform (below) were already applied, Phaser
  // would fit itself against the ALREADY-shrunk apparent size and end up
  // double-scaled (a much smaller canvas than #screen actually has room
  // for). Measuring first, transforming second, avoids that entirely.
  setupFit();

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
