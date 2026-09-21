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

  // A/B/Start/Select live in #touch-controls; the shoulder buttons (Map,
  // Running) are direct children of #gba-console instead — this covers both.
  document.querySelectorAll<HTMLElement>('#gba-console [data-action]').forEach((btn) => {
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

const GAME_ASPECT = 16 / 9;
// How much taller than the pure width-critical fit #screen is allowed to
// grow on a narrow phone, before the extra height is left as console
// padding instead. The excess becomes letterbox INSIDE the screen glass
// (Phaser centers the 16:9 content and bars the rest) — a real, deliberate
// bezel is a normal look for a handheld's screen; this just caps how much
// of one there is, since going further stops reading as "glass" and starts
// reading as "mostly dead space with a small game in the middle."
const SCREEN_HEIGHT_TOLERANCE = 1.3;

/**
 * Sizes #screen in real pixels to whichever of width/height is the binding
 * constraint for the CURRENT viewport — portrait binds on width (the game
 * itself is a fixed 16:9 landscape shape, so its rendered size can never
 * exceed viewport-width * 9/16 no matter how much taller the screen box
 * gets); landscape binds on height instead (screen would otherwise overflow
 * taller than the viewport). Plain CSS (flex/aspect-ratio) can't express
 * "pick the smaller of these two, with a capped tolerance on one side"
 * without either wasted letterbox or overflow, so this does the one bit of
 * real math the shell needs. #touch-controls and #gba-console handle
 * everything else (natural sizing + centering) via flex/CSS alone.
 */
function layoutScreen(): void {
  const consoleEl = document.getElementById('gba-console');
  const shellTop = document.getElementById('shell-top');
  const controls = document.getElementById('touch-controls');
  const screenEl = document.getElementById('screen');
  if (!consoleEl || !shellTop || !controls || !screenEl) return;

  const vv = window.visualViewport;
  const vw = vv ? vv.width : window.innerWidth;
  const vh = vv ? vv.height : window.innerHeight;

  const cs = getComputedStyle(consoleEl);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const gapPx = parseFloat(cs.rowGap || cs.gap || '0');

  const availW = Math.max(1, vw - padX);
  const shellTopH = shellTop.offsetHeight;
  const controlsH = controls.offsetHeight;
  // Two gaps: between shell-top/screen and screen/touch-controls.
  const availH = Math.max(1, vh - padY - gapPx * 2 - shellTopH - controlsH);

  const wCritical = availW;
  const hCritical = wCritical / GAME_ASPECT;

  let w = wCritical;
  let h = Math.min(availH, hCritical * SCREEN_HEIGHT_TOLERANCE);
  if (h < hCritical) {
    // Landscape: height is the tighter constraint even at the critical
    // (no-tolerance) size, so bind on it and shrink width to match instead.
    h = availH;
    w = h * GAME_ASPECT;
  }
  screenEl.style.width = `${w}px`;
  screenEl.style.height = `${h}px`;
}

/**
 * Phaser's Scale.FIT watches its parent via a ResizeObserver, so changing
 * #screen/#app's real box size (above) should already make it re-fit on its
 * own — but iOS Safari's orientation-change timing is flaky enough that an
 * explicit refresh (after layout has actually settled) is cheap, safe
 * insurance on top of that.
 */
function setupFit(game: Phaser.Game): void {
  const relayout = (): void => {
    layoutScreen();
    game.scale.refresh();
  };

  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', () => setTimeout(relayout, 250));
  window.visualViewport?.addEventListener('resize', relayout);

  // iOS Safari ignores the viewport meta's user-scalable=no for pinch-zoom
  // (an intentional accessibility override) — block it explicitly so a
  // stray two-finger touch doesn't zoom the page instead of the game.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
}

/**
 * Must run BEFORE `new Phaser.Game(...)` — Phaser reads its parent element's
 * current CSS size once, synchronously, at construction, so #app needs to
 * already be inside the shell's flex-sized #screen (not the default
 * full-window layout) the moment the game boots. Returns whether the shell
 * was activated, so callers can skip the post-construction wiring below.
 */
export function prepareGbaShell(): boolean {
  if (!isTouchPrimary()) return false;
  document.body.classList.add('gba-touch');
  layoutScreen();
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
