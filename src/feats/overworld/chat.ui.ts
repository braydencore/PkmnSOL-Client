import InputText from 'phaser3-rex-plugins/plugins/inputtext';
import { BaseUi } from '@poposafari/core';
import { DEPTH, GameAction, SFX, TEXTSHADOW, TEXTSTYLE, TEXTURE } from '@poposafari/types';
import { addText, addTextInput, addWindow } from '@poposafari/utils';
import i18next from 'i18next';
import { GameScene } from '@poposafari/scenes';

export const CHAT_MESSAGE_MAX_LENGTH = 80;

export interface ChatInputResult {
  confirmed: boolean;
  value: string;
}

/** A small modal for typing a chat message -- modeled directly on
 * NameInputUi (same rexUI InputText + tap-friendly Confirm/Cancel window
 * buttons), since that pattern already works correctly on touch devices. */
export class ChatUi extends BaseUi {
  scene: GameScene;

  private modalWindow!: GWindow;
  private titleText!: GText;
  private inputField!: InputText;
  private inputWindow!: GWindow;
  private sendBtn!: GWindow;
  private sendBtnText!: GText;
  private cancelBtn!: GWindow;
  private cancelBtnText!: GText;

  private resolver: ((result: ChatInputResult) => void) | null = null;

  constructor(scene: GameScene) {
    super(scene, scene.getInputManager(), DEPTH.MESSAGE);
    this.scene = scene;
    this.createLayout();
  }

  // The floating D-pad/A/B touch-controls overlay sits on top of the whole
  // canvas and would otherwise float uselessly over this modal (and block
  // taps to its Send/Cancel buttons) since opening it doesn't switch phase
  // -- same class of bug as LoadingUi's over the background asset loads,
  // fixed the same way: signal independently so gba-shell.ts can hide the
  // overlay for exactly as long as this is open.
  show(): void {
    super.show();
    window.dispatchEvent(new CustomEvent('poposafari:modal', { detail: { active: true } }));
  }

  hide(): void {
    super.hide();
    window.dispatchEvent(new CustomEvent('poposafari:modal', { detail: { active: false } }));
  }

  onInput(key: string, action: GameAction | null): void {
    if (action === GameAction.CONFIRM) {
      this.confirm();
      return;
    }
    if (action === GameAction.CANCEL) {
      this.cancel();
      return;
    }
  }

  errorEffect(errorMsg: string): void {}

  waitForInput(): Promise<ChatInputResult> {
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  /** Opens the chat box and resolves with what the player typed (or
   * confirmed: false if they canceled). */
  open(): Promise<ChatInputResult> {
    this.inputField.setText('');
    this.show();
    this.inputField.setFocus();
    return this.waitForInput();
  }

  createLayout(): void {
    this.modalWindow = addWindow(this.scene, TEXTURE.WINDOW_0, 0, 0, 620, 260, 4, 16, 16, 16, 16);

    this.titleText = addText(
      this.scene,
      0,
      -70,
      i18next.t('etc:chatTitle'),
      45,
      '100',
      'center',
      TEXTSTYLE.WHITE,
      TEXTSHADOW.GRAY,
    );

    this.inputWindow = addWindow(this.scene, TEXTURE.WINDOW_0, 0, 0, 500, 70, 2, 16, 16, 16, 16);

    this.inputField = addTextInput(this.scene, -230, 0, 25, '100', 500, 70, TEXTSTYLE.WHITE, {
      type: 'text',
      placeholder: '',
      maxLength: CHAT_MESSAGE_MAX_LENGTH,
    });

    this.sendBtn = addWindow(
      this.scene,
      this.scene.getOption().getWindow(),
      -120,
      +90,
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

    this.sendBtnText = addText(
      this.scene,
      -120,
      +90,
      i18next.t('pc:confirm'),
      40,
      '100',
      'center',
      TEXTSTYLE.WHITE,
      TEXTSHADOW.GRAY,
    );

    this.cancelBtn = addWindow(
      this.scene,
      this.scene.getOption().getWindow(),
      +120,
      +90,
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

    this.cancelBtnText = addText(
      this.scene,
      +120,
      +90,
      i18next.t('pc:cancelAction'),
      40,
      '100',
      'center',
      TEXTSTYLE.WHITE,
      TEXTSHADOW.GRAY,
    );

    this.setupMouseEvents();

    this.add([
      this.modalWindow,
      this.titleText,
      this.inputWindow,
      this.inputField,
      this.sendBtn,
      this.sendBtnText,
      this.cancelBtn,
      this.cancelBtnText,
    ]);
  }

  private setupMouseEvents(): void {
    this.sendBtn.on('pointerover', () => {
      this.sendBtn.setTint(0xcccccc);
      this.sendBtnText.setTint(0xcccccc);
    });
    this.sendBtn.on('pointerout', () => {
      this.sendBtn.clearTint();
      this.sendBtnText.clearTint();
    });
    this.sendBtn.on('pointerup', () => this.confirm());

    this.cancelBtn.on('pointerover', () => {
      this.cancelBtn.setTint(0xcccccc);
      this.cancelBtnText.setTint(0xcccccc);
    });
    this.cancelBtn.on('pointerout', () => {
      this.cancelBtn.clearTint();
      this.cancelBtnText.clearTint();
    });
    this.cancelBtn.on('pointerup', () => this.cancel());
  }

  private confirm(): void {
    const value = this.inputField.text.trim();
    this.scene.getAudio().playEffect(SFX.CURSOR_0);
    this.hide();
    if (this.resolver) {
      this.resolver({ confirmed: value.length > 0, value });
      this.resolver = null;
    }
  }

  private cancel(): void {
    this.scene.getAudio().playEffect(SFX.CURSOR_0);
    this.hide();
    if (this.resolver) {
      this.resolver({ confirmed: false, value: '' });
      this.resolver = null;
    }
  }
}
