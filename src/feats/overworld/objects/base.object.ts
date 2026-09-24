import { GameScene } from '@poposafari/scenes';
import { calcOverworldTilePos } from '../overworld.constants';
import { addObjText, addSprite, addText } from '@poposafari/utils';
import { DEPTH, TEXTCOLOR, TEXTSHADOW, TEXTSTROKE, TEXTSTYLE, TEXTURE } from '@poposafari/types';
import i18next from '@poposafari/i18n';

/** How far above the nametag a chat bubble floats. */
const CHAT_BUBBLE_EXTRA_OFFSET_Y = 40;
/** How long a chat bubble stays up before fading away on its own. */
const CHAT_BUBBLE_DURATION_MS = 5000;

export interface BaseObjectOptions {
  scale?: number;
}

export interface ObjectName {
  text: string;
  color?: TEXTCOLOR;
  /** true면 text를 이미 번역된 문자열로 취급하여 object: i18 번역을 스킵한다 */
  raw?: boolean;
}

export class BaseObject {
  protected scene: GameScene;
  protected sprite: GSprite;
  protected shadow: GSprite;
  protected name: GText;
  protected tileX: number;
  protected tileY: number;
  protected nameKey: string;
  protected nameRaw: boolean;
  protected nameColor: TEXTCOLOR;
  private chatBubble: GText | null = null;
  private chatBubbleTimer: Phaser.Time.TimerEvent | null = null;

  nameOffsetY: number = 100;

  constructor(
    scene: GameScene,
    texture: string,
    tileX: number,
    tileY: number,
    name: ObjectName,
    nameOffsetY: number,
    options?: BaseObjectOptions,
  ) {
    this.scene = scene;
    this.tileX = Math.floor(tileX);
    this.tileY = Math.floor(tileY);
    this.nameKey = name.text;
    this.nameRaw = name.raw ?? false;
    this.nameColor = name.color ?? TEXTCOLOR.WHITE;
    this.nameOffsetY = nameOffsetY;

    const scale = options?.scale ?? 1;
    this.shadow = addSprite(scene, TEXTURE.OVERWORLD_SHADOW, undefined, tileX, tileY)
      .setOrigin(0.5, 1)
      .setScale(scale);
    this.sprite = addSprite(scene, texture, undefined, tileX, tileY)
      .setOrigin(0.5, 1)
      .setScale(scale);
    const displayName = this.nameRaw ? name.text : i18next.t(`object:${name.text}`);
    this.name = addObjText(scene, tileX, tileY - this.nameOffsetY, displayName, 20, this.nameColor);

    this.name.setDepth(DEPTH.MESSAGE);

    this.refreshPosition();
  }

  refreshNameText(): void {
    if (!this.nameKey || !this.name?.active) return;
    this.name.setText(this.nameRaw ? this.nameKey : i18next.t(`object:${this.nameKey}`));
  }

  getScene(): GameScene {
    return this.scene;
  }

  getSprite(): Phaser.GameObjects.Sprite {
    return this.sprite;
  }

  getShadow(): Phaser.GameObjects.Sprite {
    return this.shadow;
  }

  getName(): GText {
    return this.name;
  }

  getTileX(): number {
    return this.tileX;
  }

  getTileY(): number {
    return this.tileY;
  }

  getTilePos(): { x: number; y: number } {
    return { x: this.tileX, y: this.tileY };
  }

  setTilePos(tileX: number, tileY: number): void {
    this.tileX = Math.floor(tileX);
    this.tileY = Math.floor(tileY);
  }

  step(dx: number, dy: number): void {
    this.setTilePos(this.tileX + dx, this.tileY + dy);
    this.refreshPosition();
  }

  getSpritePos(): { x: number; y: number } {
    const c = this.sprite.getBottomCenter();
    return { x: c.x, y: c.y };
  }

  setPosition(px: number, py: number): void {
    this.sprite.setPosition(px, py);
    this.shadow.setPosition(px, py);
    this.name.setPosition(px, py - this.nameOffsetY);
  }

  startSpriteAnimation(key: string): void {
    if (this.sprite.anims.isPlaying && this.sprite.anims.currentAnim?.key === key) return;
    this.sprite.play(key);
  }

  stopSpriteAnimation(frameIndex: number): void {
    this.sprite.anims.stop();
    const textureKey = this.sprite.texture.key;
    const frameKeys = this.scene.textures.get(textureKey).getFrameNames();
    if (frameKeys[frameIndex]) this.sprite.setFrame(frameKeys[frameIndex]);
  }

  setSpriteDepth(value: number): void {
    this.sprite.setDepth(value);
    this.shadow.setDepth(value - 0.1);
  }

  refreshPosition(): void {
    const [px, py] = calcOverworldTilePos(this.tileX, this.tileY);
    this.sprite.setPosition(px, py);
    this.shadow.setPosition(px, py);
    this.name.setPosition(px, py - this.nameOffsetY);
    this.sprite.setDepth(this.tileY);
    this.shadow.setDepth(this.tileY - 0.1);
    this.name.setDepth(this.tileY + 0.3);
  }

  /** Shows a translucent speech bubble above this object's nametag for a few
   * seconds, then removes it. Re-showing while one is already up just resets
   * the text and the timer, instead of stacking bubbles. */
  showChatBubble(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (this.chatBubbleTimer) {
      this.chatBubbleTimer.remove();
      this.chatBubbleTimer = null;
    }

    if (!this.chatBubble) {
      this.chatBubble = addObjText(this.scene, this.name.x, this.name.y, trimmed, 22, TEXTCOLOR.WHITE);
      this.chatBubble.setDepth(DEPTH.MESSAGE + 1);
      // The nametag lives inside OverworldUi's `nameContainer` (added there
      // externally, after construction), which applies its own
      // position/scale/depth on top of its children's LOCAL coordinates --
      // `this.name.x/y` are local to that container, not world/scene
      // coordinates. Reparent the bubble into the same container so its
      // coordinates are interpreted the same way; otherwise it renders at
      // whatever the container's own offset happens to put it, usually
      // off-screen.
      this.name.parentContainer?.add(this.chatBubble);
    } else {
      this.chatBubble.setText(trimmed);
      this.chatBubble.setVisible(true);
    }
    this.syncChatBubblePosition();

    this.chatBubbleTimer = this.scene.time.delayedCall(CHAT_BUBBLE_DURATION_MS, () => {
      this.chatBubble?.destroy();
      this.chatBubble = null;
      this.chatBubbleTimer = null;
    });
  }

  /** Keeps the chat bubble riding just above the nametag's CURRENT position
   * (tween-updated or not) — called every frame from subclasses' update()
   * rather than threaded through every place `name` gets moved. */
  protected syncChatBubblePosition(): void {
    if (!this.chatBubble) return;
    this.chatBubble.setPosition(this.name.x, this.name.y - CHAT_BUBBLE_EXTRA_OFFSET_Y);
  }

  destroy(): void {
    this.chatBubbleTimer?.remove();
    this.chatBubbleTimer = null;
    this.chatBubble?.destroy();
    this.chatBubble = null;
    this.shadow.destroy();
    this.sprite.destroy();
    this.name.destroy();
  }
}
