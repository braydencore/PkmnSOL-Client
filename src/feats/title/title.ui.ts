import { AudioManager, BaseUi, IInputHandler, IRefreshableLanguage } from '@poposafari/core';
import { GameScene } from '@poposafari/scenes';
import {
  DEPTH,
  GameAction,
  KEY,
  SFX,
  TEXTCOLOR,
  TEXTSHADOW,
  TEXTSTYLE,
  TEXTURE,
  TitleUiInput,
} from '@poposafari/types';
import {
  addBackground,
  addContainer,
  addImage,
  addText,
  getSessionBackgroundKey,
  getTextShadow,
} from '@poposafari/utils';
import i18next from '@poposafari/i18n';
import { TalkMessageUi } from '../message';
import {
  KeyGuideBarContainer,
  type KeyGuideBarOptions,
} from '@poposafari/containers/key-guide-bar.container';
import { isTouchPrimary } from '@poposafari/gba-shell';

export class TitleUi extends BaseUi implements IInputHandler, IRefreshableLanguage {
  scene: GameScene;
  private audio: AudioManager;
  private talk!: TalkMessageUi;

  private currentCursor: number = 0;
  private inputResolver: ((result: { input: TitleUiInput; cursorIndex: number }) => void) | null =
    null;

  private topContainer!: GContainer;
  private bg!: GImage;
  private title!: GImage;

  private static readonly MAIN_TITLE_KEYS = ['etc:play', 'etc:option', 'etc:logout'] as const;
  private static readonly MAIN_TITLE_INPUTS: TitleUiInput[] = ['play', 'option', 'logout'];

  private mainContainer!: GContainer;
  private mainTexts: GText[] = [];
  private mainTitles: string[] = TitleUi.MAIN_TITLE_KEYS.map((k) => i18next.t(k));

  private versionText?: GText;
  private playersOnline: number = 0;
  private playerOnlineContainer!: GContainer;
  private playerOnlineDot!: Phaser.GameObjects.Graphics;
  private playersOnlineText!: GText;
  private inputGuide: KeyGuideBarContainer | null = null;

  private socialContainer!: GContainer;
  private discordBg!: Phaser.GameObjects.Graphics;
  private discordLogo!: GImage;
  private discordOverlay!: Phaser.GameObjects.Graphics;

  constructor(scene: GameScene) {
    super(scene, scene.getInputManager(), DEPTH.DEFAULT);
    this.scene = scene;
    this.audio = scene.getAudio();
    this.talk = scene.getMessage('talk');

    this.createLayout();
    this.updateCursor();
  }

  onInput(key: string, action: GameAction | null): void {
    if (action === GameAction.CONFIRM) {
      this.audio.playEffect(SFX.CURSOR_0);
      this.confirmSelection(this.currentCursor);
      return;
    }
    switch (key) {
      case KEY.UP:
        this.audio.playEffect(SFX.CURSOR_0);
        this.moveCursor(-1);
        break;
      case KEY.DOWN:
        this.audio.playEffect(SFX.CURSOR_0);
        this.moveCursor(1);
        break;
    }
  }

  private confirmSelection(index: number): void {
    if (!this.inputResolver) return;

    const input = TitleUi.MAIN_TITLE_INPUTS[index] ?? 'logout';
    this.inputResolver({ input, cursorIndex: index });
    this.inputResolver = null;
  }

  errorEffect(errorMsg: string): void {
    throw new Error('Method not implemented.');
  }

  private moveCursor(step: number): void {
    const len = this.mainTexts.length;
    this.currentCursor = (this.currentCursor + step + len) % len;
    this.updateCursor();
  }

  waitForInput(initialCursorIndex?: number): Promise<{ input: TitleUiInput; cursorIndex: number }> {
    if (initialCursorIndex !== undefined) {
      this.currentCursor = Math.max(0, Math.min(this.mainTitles.length - 1, initialCursorIndex));
      this.updateCursor();
    }
    return new Promise((resolve) => {
      this.inputResolver = resolve;
    });
  }

  async waitForError(error: any) {
    await this.talk.showMessage(error, { name: '' });
  }

  async waitForServerBusy(cooldownSec: number): Promise<void> {
    await this.scene.getMessage('cooldown').showCooldown(i18next.t('etc:serverBusy'), cooldownSec);
  }

  createLayout(): void {
    this.bg = addBackground(this.scene, TEXTURE.BG_1);

    this.createTopLayout();
    this.createMainLayout();
    this.createPlayerOnlineLayout();
    this.createSocialLinks();

    // The keyboard-hint bar ("arrow keys to move / confirm") is meaningless
    // on a touch device -- title.ui.ts's PLAY/OPTION/LOGOUT entries are
    // directly tappable there, and the guide would just be confusing
    // leftover text with no keyboard in sight. Skip it entirely for touch;
    // desktop players still get it since the menu stays keyboard-navigated.
    const children: Phaser.GameObjects.GameObject[] = [
      this.bg,
      this.topContainer,
      this.mainContainer,
      this.playerOnlineContainer,
      this.socialContainer,
    ];
    if (!isTouchPrimary()) {
      this.inputGuide = this.createInputGuide();
      children.push(this.inputGuide);
    }
    this.add(children);
  }

  createTopLayout() {
    this.topContainer = addContainer(this.scene, DEPTH.DEFAULT);
    this.title = addImage(this.scene, TEXTURE.LOGO_0, undefined, 0, 0).setScale(0.4625);

    this.topContainer.setY(-400);
    this.topContainer.add([this.title]);

    // __BUILD_VERSION__ falls back to the literal string "dev" whenever the
    // repo has no git tag checked out (true for every non-release build) --
    // showing that to players reads as a stray debug leftover, so only
    // surface it once real release tags exist.
    if (__BUILD_VERSION__ !== 'dev' && __BUILD_VERSION__ !== 'unknown') {
      this.versionText = addText(
        this.scene,
        this.title.displayWidth / 2,
        this.title.displayHeight / 2,
        __BUILD_VERSION__,
        60,
        '100',
        'right',
        TEXTSTYLE.YELLOW,
        TEXTSHADOW.GRAY,
      ).setOrigin(1, 0);
      this.topContainer.add(this.versionText);
    }
  }

  private createPlayerOnlineLayout() {
    const DOT_RADIUS = 14;
    const DOT_COLOR = 0x22c55e;
    const GAP = 18;
    const ANCHOR_LEFT_X = -940;
    const ANCHOR_TOP_Y = -500;

    this.playerOnlineContainer = addContainer(this.scene, DEPTH.DEFAULT);

    this.playerOnlineDot = this.scene.add.graphics();
    this.playerOnlineDot.fillStyle(DOT_COLOR, 1);
    this.playerOnlineDot.fillCircle(0, 0, DOT_RADIUS);

    this.playersOnlineText = addText(
      this.scene,
      DOT_RADIUS + GAP,
      0,
      i18next.t('etc:playersOnline', { value: this.playersOnline }),
      50,
      '100',
      'left',
      TEXTSTYLE.WHITE,
      TEXTSHADOW.GRAY,
    ).setOrigin(0, 0.5);

    this.playerOnlineContainer.setPosition(ANCHOR_LEFT_X + DOT_RADIUS, ANCHOR_TOP_Y);
    this.playerOnlineContainer.add([this.playerOnlineDot, this.playersOnlineText]);
  }

  setPlayersOnline(value: number): void {
    this.playersOnline = value;
    this.playersOnlineText.setText(i18next.t('etc:playersOnline', { value }));
  }

  private static readonly HIT_PAD_X = 80;
  private static readonly HIT_PAD_Y = 30;

  // Text width changes with language (Korean/Japanese glyphs run narrower
  // or wider than English), so the tap hit area is recomputed here rather
  // than baked in once -- called on creation and again after every
  // onRefreshLanguage() setText().
  private syncMainTextHitArea(text: GText): void {
    text.input!.hitArea = new Phaser.Geom.Rectangle(
      -text.width / 2 - TitleUi.HIT_PAD_X,
      -text.height / 2 - TitleUi.HIT_PAD_Y,
      text.width + TitleUi.HIT_PAD_X * 2,
      text.height + TitleUi.HIT_PAD_Y * 2,
    );
  }

  createMainLayout() {
    const contentHeight = 80;
    const contentSpacing = 20;

    let currentY = -110;

    this.mainContainer = addContainer(this.scene, DEPTH.DEFAULT);

    this.mainTitles.forEach((title, index) => {
      const text = addText(
        this.scene,
        0,
        currentY,
        title,
        80,
        '100',
        'center',
        TEXTSTYLE.WHITE,
        TEXTSHADOW.GRAY,
      );

      // Directly tappable: touch players have no keyboard, so tapping an
      // entry both selects and confirms it in one motion. Hit area is
      // padded well past the glyphs themselves for a comfortable finger
      // target, same idea as the login screen's button windows.
      text.setInteractive({
        hitArea: new Phaser.Geom.Rectangle(0, 0, text.width, text.height),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      });
      this.syncMainTextHitArea(text);
      text.on('pointerover', () => {
        this.currentCursor = index;
        this.updateCursor();
      });
      text.on('pointerup', () => {
        this.audio.playEffect(SFX.CURSOR_0);
        this.currentCursor = index;
        this.updateCursor();
        this.confirmSelection(index);
      });

      this.mainTexts.push(text);
      currentY += contentHeight + contentSpacing;
    });
    this.mainContainer.add(this.mainTexts);
  }

  private createInputGuide(): KeyGuideBarContainer {
    const guide = new KeyGuideBarContainer(this.scene);
    guide.create(this.buildInputGuideOptions());
    guide.setPosition(+930, +500);
    return guide;
  }

  private drawSocialBg(
    g: Phaser.GameObjects.Graphics,
    centerX: number,
    width: number,
    height: number,
    radius: number,
    color: number,
    alpha: number,
  ): void {
    g.clear();
    g.fillStyle(color, alpha);
    g.fillRoundedRect(centerX - width / 2, -height / 2, width, height, radius);
  }

  private createSocialLinks() {
    const BG_PADDING_X = 18;
    const BG_PADDING_Y = 10;
    const BG_ALPHA = 0.8;
    const DISCORD_COLOR = 0x5865f2;
    const ANCHOR_LEFT_X = -940;
    const DISCORD_URL = 'https://discord.gg/uqt7cqqT23';
    const TINT_GRAY = 0xcccccc;

    this.socialContainer = addContainer(this.scene, DEPTH.DEFAULT);

    this.discordLogo = addImage(this.scene, TEXTURE.LOGO_DISCORD, undefined, 0, 0);

    const bgHeight = this.discordLogo.displayHeight + BG_PADDING_Y * 2;
    const discordBgW = this.discordLogo.displayWidth + BG_PADDING_X * 2;
    const bgRadius = bgHeight / 2;

    const discordX = 0;

    this.discordLogo.setPosition(discordX, 0);

    this.discordBg = this.scene.add.graphics();
    this.drawSocialBg(
      this.discordBg,
      discordX,
      discordBgW,
      bgHeight,
      bgRadius,
      DISCORD_COLOR,
      BG_ALPHA,
    );

    this.discordBg.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(
        discordX - discordBgW / 2,
        -bgHeight / 2,
        discordBgW,
        bgHeight,
      ),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    this.discordBg.on('pointerover', () => this.discordOverlay.setVisible(true));
    this.discordBg.on('pointerout', () => this.discordOverlay.setVisible(false));
    this.discordBg.on('pointerdown', () => {
      window.open(DISCORD_URL, '_blank', 'noopener,noreferrer');
    });

    this.discordOverlay = this.scene.add.graphics();
    this.discordOverlay.fillStyle(TINT_GRAY, 1);
    this.discordOverlay.fillRoundedRect(
      discordX - discordBgW / 2,
      -bgHeight / 2,
      discordBgW,
      bgHeight,
      bgRadius,
    );
    this.discordOverlay.setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.discordOverlay.setVisible(false);

    this.socialContainer.setPosition(ANCHOR_LEFT_X + discordBgW / 2, +500);
    this.socialContainer.add([this.discordBg, this.discordLogo, this.discordOverlay]);
  }

  /**
   * inputGuide 옵션 — 초기 빌드와 언어 변경 시 recreate 양쪽에서 사용.
   * i18next.t() 가 호출 시점의 현재 언어로 평가되므로 동일 함수가 양쪽에서 올바른 텍스트를 만든다.
   */
  private buildInputGuideOptions(): KeyGuideBarOptions {
    return {
      entries: [
        { keys: [i18next.t('etc:arrowKey')], description: i18next.t('etc:move') },
        { actions: [GameAction.CONFIRM], description: i18next.t('etc:confirm') },
      ],
      keycapTextSize: 36,
      keycapPaddingX: 50,
      keycapPaddingY: 40,
      keycapScale: 2,
      keycapTextYOffset: -5,
      descriptionTextSize: 50,
      gapKeyToDescription: 8,
      gapBetweenEntries: 30,
      gapInsideEntry: 4,
      align: 'right',
      maxWidth: this.scene.cameras.main.width - 60,
    };
  }

  private updateCursor() {
    this.mainTexts.forEach((text, index) => {
      const isSelected = index === this.currentCursor;
      text.setColor(isSelected ? TEXTCOLOR.YELLOW : TEXTCOLOR.WHITE);

      const [sx, sy, sc] = getTextShadow(TEXTSHADOW.GRAY);
      text.setShadow(sx, sy, sc);
    });
  }

  onRefreshLanguage(): void {
    for (let i = 0; i < TitleUi.MAIN_TITLE_KEYS.length; i++) {
      const key = TitleUi.MAIN_TITLE_KEYS[i];
      this.mainTitles[i] = i18next.t(key);
      this.mainTexts[i].setText(this.mainTitles[i]);
      this.syncMainTextHitArea(this.mainTexts[i]);
    }

    this.updateCursor();

    this.playersOnlineText.setText(i18next.t('etc:playersOnline', { value: this.playersOnline }));

    // 키캡(`방향키` 등)의 폭이 언어에 따라 달라지므로 전체 재빌드. transform(setPosition) 유지됨.
    // Only exists on desktop (isTouchPrimary() skips it entirely) -- see createLayout().
    this.inputGuide?.recreate(this.buildInputGuideOptions());
  }

  show(): void {
    this.bg.setTexture(getSessionBackgroundKey());
    super.show();
  }

  updateBg(): void {
    this.bg.setTexture(getSessionBackgroundKey());
  }
}
