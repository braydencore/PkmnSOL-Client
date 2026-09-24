import { BGM } from '@poposafari/types';

const SOLARA_OST_STORAGE_KEY = 'solara_ost';
/** Read once as a migration fallback -- players who picked a track before
 * the Popo Town -> Solara rename have their preference under this old key. */
const LEGACY_POPOTOWN_OST_STORAGE_KEY = 'popotown_ost';

export const SOLARA_OST_TRACKS: BGM[] = [
  BGM.P001_0,
  BGM.P001_1,
  BGM.P001_2,
  BGM.P001_3,
  BGM.P001_4,
  BGM.P001_5,
  BGM.P001_6,
  BGM.P001_7,
  BGM.P001_8,
  BGM.P001_9,
  BGM.P001_10,
  BGM.P001_11,
  BGM.P001_12,
  BGM.P001_13,
  BGM.P001_14,
  BGM.P001_15,
];

export const DEFAULT_SOLARA_OST: BGM = BGM.P001_0;

const VALID_TRACKS = new Set<string>(SOLARA_OST_TRACKS);

export function isSolaraOstTrack(value: string): boolean {
  return VALID_TRACKS.has(value);
}

export function getSolaraOst(): BGM {
  const raw = localStorage.getItem(SOLARA_OST_STORAGE_KEY);
  if (raw !== null && VALID_TRACKS.has(raw)) return raw as BGM;
  if (raw !== null) {
    // 잘못된 값이 저장돼 있었다면(수동 조작 등) Track 1로 덮어써 정정한다.
    setSolaraOst(DEFAULT_SOLARA_OST);
    return DEFAULT_SOLARA_OST;
  }

  // One-time migration: carry over a pre-rename selection instead of
  // silently resetting everyone back to Track 1.
  const legacy = localStorage.getItem(LEGACY_POPOTOWN_OST_STORAGE_KEY);
  if (legacy !== null && VALID_TRACKS.has(legacy)) {
    setSolaraOst(legacy as BGM);
    return legacy as BGM;
  }

  return DEFAULT_SOLARA_OST;
}

export function setSolaraOst(bgm: BGM): void {
  localStorage.setItem(SOLARA_OST_STORAGE_KEY, bgm);
}

export function isSolaraOstMap(mapKey: string): boolean {
  return mapKey.startsWith('p') && mapKey !== 'p003' && mapKey !== 'p009';
}

export function resolveMapBgm(mapKey: string, configBgm: BGM | undefined): BGM | undefined {
  if (isSolaraOstMap(mapKey)) return getSolaraOst();
  return configBgm;
}
