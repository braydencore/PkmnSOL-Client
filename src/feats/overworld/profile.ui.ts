import { BaseUi } from '@poposafari/core';
import { DEPTH, GameAction, SFX, TEXTSHADOW, TEXTSTYLE, TEXTURE } from '@poposafari/types';
import { addText, addWindow } from '@poposafari/utils';
import type { PublicProfileRes } from '@poposafari/types/dto';
import i18next from 'i18next';
import { GameScene } from '@poposafari/scenes';

// i18next's language codes here are folder names ('jp', not the BCP-47 'ja'),
// which Intl.DateTimeFormat doesn't recognize -- it silently falls back to
// its own default rather than throwing, so this'd otherwise show an
// English-formatted date to every locale. Map to the real tags it needs.
const INTL_LOCALE: Record<string, string> = { en: 'en', ko: 'ko', jp: 'ja', fr: 'fr', es: 'es' };

function formatJoinDate(iso: string): string {
  const locale = INTL_LOCALE[i18next.language] ?? 'en';
  // year/month/day (no weekday/slash) -- the game's pixel font doesn't have
  // a clean glyph for '/', which toLocaleDateString's default format uses.
  return new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** A small read-only card showing another player's public info -- opened by
 * "talking" to them, same gesture used for NPCs. Modeled on NameInputUi's
 * modal shell (tap-friendly window buttons already proven on touch), minus
 * the input field since there's nothing to type here. */
export class ProfileUi extends BaseUi {
  scene: GameScene;

  private modalWindow!: GWindow;
  private nicknameText!: GText;
  private genderText!: GText;
  private sinceText!: GText;
  private pokedexText!: GText;
  private closeBtn!: GWindow;
  private closeBtnText!: GText;

  private resolver: (() => void) | null = null;

  constructor(scene: GameScene) {
    super(scene, scene.getInputManager(), DEPTH.MESSAGE);
    this.scene = scene;
    this.createLayout();
  }

  // Same reasoning as ChatUi: this opens on top of live gameplay without a
  // phase switch, so the floating D-pad/button overlay needs an explicit
  // signal to get out of the way while it's up.
  show(): void {
    super.show();
    window.dispatchEvent(new CustomEvent('poposafari:modal', { detail: { active: true } }));
  }

  hide(): void {
    super.hide();
    window.dispatchEvent(new CustomEvent('poposafari:modal', { detail: { active: false } }));
  }

  onInput(key: string, action: GameAction | null): void {
    if (action === GameAction.CONFIRM || action === GameAction.CANCEL) {
      this.close();
    }
  }

  errorEffect(errorMsg: string): void {}

  waitForInput(): Promise<void> {
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  open(data: PublicProfileRes): Promise<void> {
    this.nicknameText.setText(data.profile.nickname);
    this.genderText.setText(
      i18next.t(data.profile.gender === 2 ? 'etc:profileFemale' : 'etc:profileMale'),
    );
    this.sinceText.setText(
      i18next.t('etc:profileTrainerSince', { date: formatJoinDate(data.profile.createdAt) }),
    );
    this.pokedexText.setText(i18next.t('etc:profilePokedexCount', { count: data.pokedexCount }));

    this.show();
    return this.waitForInput();
  }

  createLayout(): void {
    this.modalWindow = addWindow(this.scene, TEXTURE.WINDOW_0, 0, 0, 560, 320, 4, 16, 16, 16, 16);

    this.nicknameText = addText(
      this.scene,
      0,
      -110,
      '',
      50,
      '100',
      'center',
      TEXTSTYLE.WHITE,
      TEXTSHADOW.GRAY,
    );
    this.genderText = addText(
      this.scene,
      0,
      -50,
      '',
      32,
      '100',
      'center',
      TEXTSTYLE.WHITE,
      TEXTSHADOW.GRAY,
    );
    this.sinceText = addText(
      this.scene,
      0,
      +10,
      '',
      30,
      '100',
      'center',
      TEXTSTYLE.WHITE,
      TEXTSHADOW.GRAY,
    );
    this.pokedexText = addText(
      this.scene,
      0,
      +55,
      '',
      30,
      '100',
      'center',
      TEXTSTYLE.WHITE,
      TEXTSHADOW.GRAY,
    );

    this.closeBtn = addWindow(
      this.scene,
      this.scene.getOption().getWindow(),
      0,
      +125,
      200,
      65,
      2,
      16,
      16,
      16,
      16,
    )
      .setScrollFactor(0)
      .setInteractive({ cursor: 'pointer' });

    this.closeBtnText = addText(
      this.scene,
      0,
      +125,
      i18next.t('etc:profileClose'),
      40,
      '100',
      'center',
      TEXTSTYLE.WHITE,
      TEXTSHADOW.GRAY,
    );

    this.setupMouseEvents();

    this.add([
      this.modalWindow,
      this.nicknameText,
      this.genderText,
      this.sinceText,
      this.pokedexText,
      this.closeBtn,
      this.closeBtnText,
    ]);
  }

  private setupMouseEvents(): void {
    this.closeBtn.on('pointerover', () => {
      this.closeBtn.setTint(0xcccccc);
      this.closeBtnText.setTint(0xcccccc);
    });
    this.closeBtn.on('pointerout', () => {
      this.closeBtn.clearTint();
      this.closeBtnText.clearTint();
    });
    this.closeBtn.on('pointerup', () => this.close());
  }

  private close(): void {
    this.scene.getAudio().playEffect(SFX.CURSOR_0);
    this.hide();
    if (this.resolver) {
      this.resolver();
      this.resolver = null;
    }
  }
}
