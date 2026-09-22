import { IGamePhase } from '@poposafari/core';
import { GameEvent, GameScene } from '@poposafari/scenes';
import { OptionUi } from './option.ui';
import { DeleteAccountPhase } from '../delete-account/delete-account.phase';

export class OptionPhase implements IGamePhase {
  private ui: OptionUi | null = null;

  constructor(private scene: GameScene) {}

  async enter(): Promise<void> {
    this.ui = new OptionUi(this.scene);
    this.ui.show();
    await this.runLoop();
  }

  /**
   * Delete Account pushes DeleteAccountPhase on top without popping this
   * phase, so cancelling it returns here rather than all the way back out
   * (e.g. to Title, or the in-game pause menu). onResume() re-arms the wait
   * below for that return trip.
   */
  private async runLoop(): Promise<void> {
    if (!this.ui) return;
    const result = await this.ui.waitForExit();
    if (result === 'delete_account') {
      this.scene.pushPhase(new DeleteAccountPhase(this.scene));
      return;
    }
    this.scene.popPhase();
  }

  exit(): void {
    if (!this.ui) return;

    const { windowDirty, languageDirty, keybindDirty } = this.ui.getDirty();

    this.ui.hide();
    this.ui.destroy();
    this.ui = null;

    this.scene.getOption().saveToCache();

    if (windowDirty) this.scene.emitEvent(GameEvent.WINDOW_CHANGED);
    if (languageDirty) this.scene.emitEvent(GameEvent.LANGUAGE_CHANGED);
    if (keybindDirty) this.scene.emitEvent(GameEvent.KEYBIND_CHANGED);
  }

  onRefreshLanguage?(): void {
    this.ui?.onRefreshLanguage();
  }

  onPause(): void {
    this.ui?.stopBattleBgmPreview();
  }

  onResume(): void {
    void this.runLoop();
  }
}
