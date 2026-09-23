import { GameScene } from '@poposafari/scenes';
import { TEXTSHADOW, TEXTSTYLE, TEXTURE } from '@poposafari/types';
import { addImage, addText, addWindow } from '@poposafari/utils';

export class SelectBoxContainer extends Phaser.GameObjects.Container {
  scene: GameScene;

  private window!: GWindow;
  private title!: GText;
  private arrowLeft!: GImage;
  private arrowRight!: GImage;
  private contentText!: GText;

  private options: string[] = [];
  private optionIds: string[] = [];
  private currentIdx: number = 0;

  public onChange?: (selectedId: string) => void;

  constructor(scene: GameScene) {
    super(scene, 0, 0);
    this.scene = scene;
    this.setScrollFactor(0);
    this.setVisible(true);
    scene.add.existing(this);
  }

  create(width: number, height: number, strTitle: string) {
    this.window = addWindow(
      this.scene,
      this.scene.getOption().getWindow(),
      0,
      0,
      width,
      height,
      3,
      16,
      16,
      16,
      16,
    );

    this.title = addText(
      this.scene,
      0,
      -40,
      strTitle,
      70,
      '100',
      'center',
      TEXTSTYLE.YELLOW,
      TEXTSHADOW.GRAY,
    );

    this.arrowLeft = addImage(this.scene, TEXTURE.CURSOR_WHITE, undefined, -180, 30)
      .setScale(2.4)
      .setFlipX(true);
    this.arrowRight = addImage(this.scene, TEXTURE.CURSOR_WHITE, undefined, 180, 30).setScale(2.4);

    this.contentText = addText(
      this.scene,
      0,
      30,
      '',
      50,
      '100',
      'center',
      TEXTSTYLE.WHITE,
      TEXTSHADOW.GRAY,
    ).setOrigin(0.5);

    this.add([this.window, this.title, this.arrowLeft, this.arrowRight, this.contentText]);

    this.setupInteractions();
  }

  public setOptions(options: string[], triggerChange: boolean = false) {
    this.options = options;
    this.currentIdx = 0;
    this.updateDisplay();

    if (triggerChange && this.options.length > 0 && this.onChange) {
      this.onChange(this.optionIds[0]);
    }
  }

  public setOptionsWithIds(ids: string[], texts: string[], triggerChange: boolean = false) {
    this.optionIds = ids;
    this.options = texts;
    this.currentIdx = 0;
    this.updateDisplay();

    if (triggerChange && this.options.length > 0 && this.onChange) {
      this.onChange(this.optionIds[0]);
    }
  }

  private setupInteractions() {
    this.addArrowEvent(this.arrowLeft, -1);
    this.addArrowEvent(this.arrowRight, 1);
  }

  private addArrowEvent(target: GImage, direction: number) {
    // The arrow glyph itself is tiny (12x28 native px) -- way too small a
    // tap target on a real phone screen. Pad the hit area well beyond the
    // visible sprite (in frame-local units, so it scales with it) without
    // changing how it looks.
    const padX = 20;
    const padY = 10;
    const baseScale = target.scale;
    const pressUp = () => {
      this.scene.tweens.add({
        targets: target,
        scale: baseScale,
        duration: 100,
        ease: 'Back.easeOut',
      });
    };
    target
      .setInteractive({
        hitArea: new Phaser.Geom.Rectangle(-padX, -padY, target.width + padX * 2, target.height + padY * 2),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        cursor: 'pointer',
      })
      .on('pointerdown', () => {
        target.setTint(0xcccccc);
        this.scene.tweens.add({
          targets: target,
          scale: baseScale * 0.85,
          duration: 60,
          ease: 'Quad.easeOut',
        });
      })
      .on('pointerout', () => {
        target.clearTint();
        pressUp();
      })
      .on('pointerup', () => {
        target.clearTint();
        pressUp();
        if (this.options.length <= 1) return;

        this.currentIdx = (this.currentIdx + direction + this.options.length) % this.options.length;
        this.updateDisplay();

        if (this.onChange) {
          this.onChange(this.optionIds[this.currentIdx]);
        }
      });
  }

  private updateDisplay() {
    if (this.options.length === 0) {
      this.contentText.setText('');
      this.arrowLeft.setTint(0x999999).disableInteractive();
      this.arrowRight.setTint(0x999999).disableInteractive();
    } else {
      const currentId = this.options[this.currentIdx];
      this.contentText.setText(currentId);

      const tint = this.options.length > 1 ? 0xffffff : 0x999999;
      this.arrowLeft.setTint(tint).setInteractive();
      this.arrowRight.setTint(tint).setInteractive();

      if (this.options.length <= 1) {
        this.arrowLeft.disableInteractive();
        this.arrowRight.disableInteractive();
      }
    }
  }

  public getSelectedId(): string | null {
    return this.optionIds.length > 0 ? this.optionIds[this.currentIdx] : null;
  }
}
