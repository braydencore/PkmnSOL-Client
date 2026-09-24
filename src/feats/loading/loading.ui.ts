import { BaseUi, InputManager } from '@poposafari/core';
import i18next from '@poposafari/i18n';
import { GameScene } from '@poposafari/scenes';
import { DEPTH, TEXTSHADOW, TEXTSTYLE, TEXTURE } from '@poposafari/types';
import {
  addBackground,
  addContainer,
  addImage,
  addText,
  getBackgroundKey,
} from '@poposafari/utils';

export class LoadingUi extends BaseUi {
  private bg!: GImage;
  private logo!: GImage;
  private percentText!: GText;
  private assetText!: GText;

  constructor(scene: GameScene) {
    super(scene, scene.getInputManager(), DEPTH.DEFAULT);
    this.createLayout();
  }

  onInput(key: string): void {}

  // LoadingUi covers the full screen (Stage 2's background asset load and
  // the Pokemon-asset load both show it without a phase switch, since the
  // underlying phase — Title, OverworldEntryPhase — doesn't change), so the
  // touch-controls overlay's phase-based hide logic never sees it. Signal
  // independently so gba-shell.ts can hide the D-pad/buttons for exactly as
  // long as this is on screen, regardless of what the current phase wants.
  public show(): void {
    super.show();
    window.dispatchEvent(new CustomEvent('poposafari:loading', { detail: { active: true } }));
  }

  public hide(): void {
    super.hide();
    window.dispatchEvent(new CustomEvent('poposafari:loading', { detail: { active: false } }));
  }

  errorEffect(errorMsg: string): void {
    throw new Error('Method not implemented.');
  }
  waitForInput(): Promise<any> {
    throw new Error('Method not implemented.');
  }

  setPercentText(value: number) {
    this.percentText.setText(`${parseInt(String(value * 100), 10)}%`);
  }

  setAssetText(value: string) {
    this.assetText.setText(`Loading asset: ${value}`);
  }

  async complete(): Promise<void> {
    this.percentText.setText('100%');
    this.assetText.setText('Complete!');

    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        duration: 500,
        delay: 200,
        onComplete: () => {
          this.setVisible(false);
          this.setAlpha(1);
          resolve();
        },
      });
    });
  }

  createLayout(): void {
    this.bg = addBackground(this.scene, TEXTURE.BG_0);
    this.logo = addImage(this.scene, TEXTURE.LOGO_0, undefined, 0, -100).setScale(0.425);
    this.percentText = addText(
      this.scene,
      0,
      +50,
      'NULL',
      100,
      '10',
      'center',
      TEXTSTYLE.WHITE,
      TEXTSHADOW.GRAY,
    );
    this.assetText = addText(
      this.scene,
      0,
      +150,
      'NULL',
      100,
      '10',
      'center',
      TEXTSTYLE.WHITE,
      TEXTSHADOW.GRAY,
    );

    this.add([this.bg, this.logo, this.percentText, this.assetText]);
  }

  onRefreshLanguage(): void {
    this.percentText.setText(i18next.t('loading:percent'));
    this.assetText.setText(i18next.t('loading:asset'));
  }
}
