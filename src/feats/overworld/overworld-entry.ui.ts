import { BaseUi } from '@poposafari/core';
import i18next from '@poposafari/i18n';
import { GameScene } from '@poposafari/scenes';
import { DEPTH, TEXTSHADOW, TEXTSTYLE, TEXTURE } from '@poposafari/types';
import { addBackground, addImage, addText } from '@poposafari/utils';
import { ExpBarContainer } from '@poposafari/containers/exp-bar.container';
import type { LoadingProgressUi } from '../loading/loading.ui';

const BAR_WIDTH = 700;
const BAR_HEIGHT = 56;
const BAR_SCALE = 2;
const FILL_COLOR = 0x9945ff; // Solana purple, in progress
const FILL_COLOR_DONE = 0x14f195; // Solana green, once the bar reaches 100%

export class OverworldEntryUi extends BaseUi implements LoadingProgressUi {
  scene: GameScene;

  private bg!: GImage;
  private logo!: GImage;
  private bar!: ExpBarContainer;
  private percentText!: GText;
  private statusText!: GText;

  constructor(scene: GameScene) {
    super(scene, scene.getInputManager(), DEPTH.MESSAGE + 1);
    this.scene = scene;
    this.createLayout();
  }

  onInput(_key: string): void {}

  errorEffect(_errorMsg: string): void {}

  waitForInput(): Promise<never> {
    return new Promise(() => {});
  }

  createLayout(): void {
    this.bg = addBackground(this.scene, TEXTURE.BG_BLACK);
    this.logo = addImage(this.scene, TEXTURE.LOGO_0, undefined, 0, -180).setScale(0.375);

    this.bar = new ExpBarContainer(this.scene, 0, 0, {
      width: BAR_WIDTH,
      height: BAR_HEIGHT,
      scale: BAR_SCALE,
      fillColor: FILL_COLOR,
      maxFillColor: FILL_COLOR_DONE,
    });

    this.percentText = addText(
      this.scene,
      0,
      +80,
      '0%',
      50,
      '100',
      'center',
      TEXTSTYLE.WHITE,
      TEXTSHADOW.GRAY,
    );
    this.statusText = addText(
      this.scene,
      0,
      +140,
      i18next.t('etc:loading'),
      40,
      '100',
      'center',
      TEXTSTYLE.WHITE,
      TEXTSHADOW.GRAY,
    );

    this.add([this.bg, this.logo, this.bar, this.percentText, this.statusText]);
  }

  /** Driven directly by loadDeferredPokemonAssets()'s Phaser loader 'progress'
   * event (see game.scene.ts's ensurePokemonAssets()) -- this is real
   * asset-load progress, not a simulated/timed bar. Socket connect + the
   * change_map/init round trip that happens around it aren't part of this
   * number (they're single request/response pairs with nothing to measure
   * in stages), so the bar sits at 0% with the "Processing..." status until
   * the Pokemon asset load actually starts. */
  setPercentText(value: number): void {
    const ratio = Math.max(0, Math.min(1, value));
    this.bar.setRatio(ratio, ratio >= 1);
    this.percentText.setText(`${Math.round(ratio * 100)}%`);
    if (ratio > 0) this.statusText.setText(i18next.t('etc:loadingPokemon'));
  }

  /** loadDeferredPokemonAssets() also reports the raw asset key being
   * fetched (e.g. "pokemon.front") via this hook -- LoadingUi shows that
   * directly, but it's an internal cache key, not player-facing copy, so
   * this UI just keeps the localized statusText from setPercentText()
   * instead of surfacing it. */
  setAssetText(_value: string): void {}

  setMessage(_msgKey: string): void {}
}
