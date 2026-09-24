const RELOAD_GUARD_KEY = 'pkmnsol:stale-chunk-reload';

function isStaleChunkError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return /dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(
    e.message,
  );
}

/**
 * Wraps a dynamic import() so a stale chunk reference (from a tab left open
 * across a deploy that replaced the hashed chunk files) triggers a one-time
 * reload to fetch the current bundle, instead of silently failing to open
 * the feature.
 */
export async function lazyImport<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch (e) {
    if (isStaleChunkError(e) && !sessionStorage.getItem(RELOAD_GUARD_KEY)) {
      sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
      window.location.reload();
      return new Promise<T>(() => {});
    }
    throw e;
  }
}
