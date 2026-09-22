import { IGamePhase } from '@poposafari/core';
import { GameScene } from '@poposafari/scenes';
import { TitleUi } from './title.ui';
import { LoginPhase } from '../login';
import { OptionPhase } from '../option/option.phase';
import { CreateAvatarPhase } from '../tutorial';
import { OverworldEntryPhase } from '../overworld/overworld-entry.phase';
import { ApiError, ErrorCode } from '@poposafari/types';

const ONLINE_REFRESH_MS = 30_000;
const SERVER_BUSY_COOLDOWN_SEC = 5;

export class TitlePhase implements IGamePhase {
  private ui!: TitleUi;

  private savedCursorIndex: number | undefined = undefined;
  private onlineRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private scene: GameScene,
    private opts: { forceContinueEnabled?: boolean } = {},
  ) {}

  async enter(): Promise<void> {
    this.ui = new TitleUi(this.scene);

    this.ui.show();
    this.startOnlineRefresh();
    // Warm the deferred asset cache (Pokemon sprites, costumes, item icons, maps'
    // tile images, etc.) in the background while the player looks at the menu, so
    // by the time they pick Play it's often already done.
    void this.scene.ensureDeferredAssets();
    await this.runMenuOnce();
  }

  private async runMenuOnce(): Promise<void> {
    const result = await this.ui.waitForInput(this.savedCursorIndex);
    this.savedCursorIndex = result.cursorIndex;

    try {
      if (result.input === 'play') {
        if (!this.scene.getUser()) {
          try {
            const me = await this.scene.getApi().getMe();
            if (me) this.scene.createUserManager(me);
          } catch (error: any) {
            const errorCode = error instanceof ApiError ? error.code : error?.response?.data?.code;
            // No character yet is expected here (PLAY is the only entry
            // point now) — fall through to CreateAvatarPhase below. Anything
            // else (session expired, server error, ...) is a real failure.
            if (errorCode !== ErrorCode.USER_NOT_FOUND) throw error;
          }
        }
        if (this.scene.getUser() || this.opts.forceContinueEnabled) {
          const res = await this.scene.getApi().gameConnect();
          if (res.ready) {
            await this.scene.ensureDeferredAssets();
            this.scene.switchPhase(new OverworldEntryPhase(this.scene, undefined, res.token));
            return;
          }
          // 슬롯 가득 — 쿨다운 동안 메시지 닫기 잠금 후 메뉴 복귀
          await this.ui.waitForServerBusy(SERVER_BUSY_COOLDOWN_SEC);
          await this.runMenuOnce();
          return;
        }
        // No character yet — the one thing PLAY can do is start creating one.
        await this.scene.ensureDeferredAssets();
        this.scene.switchPhase(new CreateAvatarPhase(this.scene));
        return;
      }
      if (result.input === 'option') {
        this.scene.pushPhase(new OptionPhase(this.scene));
        return;
      }
      // logout
      await this.scene.getApi().logout();
      this.scene.resetSessionState();
      this.scene.switchPhase(new LoginPhase(this.scene));
    } catch (error: any) {
      await this.ui.waitForError(error);
      await this.runMenuOnce();
    }
  }

  exit(): void {
    this.stopOnlineRefresh();
    this.ui.hide();
    this.ui.destroy();
  }

  onPause(): void {
    this.stopOnlineRefresh();
  }

  onResume(): void {
    this.ui.updateBg();
    this.startOnlineRefresh();
    this.runMenuOnce();
  }

  onRefreshLanguage(): void {
    this.ui.onRefreshLanguage();
  }

  private startOnlineRefresh(): void {
    this.stopOnlineRefresh();
    void this.refreshOnlineCount();
    this.onlineRefreshTimer = setInterval(() => {
      void this.refreshOnlineCount();
    }, ONLINE_REFRESH_MS);
  }

  private stopOnlineRefresh(): void {
    if (this.onlineRefreshTimer !== null) {
      clearInterval(this.onlineRefreshTimer);
      this.onlineRefreshTimer = null;
    }
  }

  private async refreshOnlineCount(): Promise<void> {
    try {
      const { count } = await this.scene.getApi().getOnlineCount();
      this.ui.setPlayersOnline(count);
    } catch {
      // fail-silent: 부수 정보라 에러 노출 안 함
    }
  }
}
