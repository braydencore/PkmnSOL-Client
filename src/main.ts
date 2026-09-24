import Phaser from 'phaser';
import InputTextPlugin from 'phaser3-rex-plugins/plugins/inputtext-plugin.js';
import BBCodeTextPlugin from 'phaser3-rex-plugins/plugins/bbcodetext-plugin.js';
import UIPlugin from 'phaser3-rex-plugins/templates/ui/ui-plugin.js';
import { GameScene } from './scenes/game.scene';
import { initI18n } from './i18n';
import { initGbaShell, prepareGbaShell, computeTouchGameSize } from './gba-shell';
import { renderInstallGate, shouldGateForInstall } from './install-gate';

const start = async () => {
  console.info(`[poposafari] ${__BUILD_VERSION__} (build ${__BUILD_SHA__}) @ ${__BUILD_AT__}`);

  // Touch devices that haven't been added to the Home Screen get a
  // blocking install screen instead of the game — bailing out here, before
  // i18n or Phaser even start, skips the ~150MB asset load entirely for
  // anyone who hasn't installed yet.
  if (shouldGateForInstall()) {
    renderInstallGate();
    return;
  }

  await initI18n();

  const touchPrimary = prepareGbaShell();

  // Desktop keeps a fixed 1920x1080 canvas letterboxed to fit (Scale.FIT):
  // the game's UI is built with elements placed at literal absolute pixel
  // offsets from center (e.g. login's OAuth row is `oauthContainer.setY(+500)`,
  // the overworld party list is `setPosition(+905, 0)`) rather than computed
  // from screen size, and a desktop browser window's aspect ratio is
  // arbitrary -- ENVELOP (cover/crop) was tried here once and cropped the
  // login screen's Google/Discord buttons off the bottom on a perfectly
  // ordinary window size.
  //
  // Touch mode doesn't have that problem in practice: it's landscape-only,
  // and every real phone in landscape is *wider* than 16:9, never narrower
  // -- so instead of letterboxing that extra width away, computeTouchGameSize()
  // (gba-shell.ts) sizes the canvas to the device's actual aspect ratio with
  // height still pinned at 1080, so nothing about existing screens' offsets
  // or font sizes needs to change; the world camera just shows more
  // environment on the sides instead of black bars. Scale.NONE because
  // Scale Manager doesn't need to do any fitting of its own here -- the
  // logical canvas already matches the device aspect by construction, and
  // gba-shell.ts's setupFit() recomputes it (+ forces the canvas to fill
  // #app via CSS) only at a few controlled checkpoints, not on every resize
  // -- see that function's comment for why.
  const initialSize = touchPrimary ? computeTouchGameSize() : { width: 1920, height: 1080 };

  const config: Phaser.Types.Core.GameConfig = {
    // WebGL(GPU 가속)을 우선 시도하고, 사용 불가 환경(드라이버 블랙리스트,
    // 하드웨어 가속 비활성화 등)에서는 Canvas 2D로 자동 폴백한다.
    // WEBGL로 고정하면 해당 환경에서 게임이 아예 뜨지 않으므로 AUTO를 사용한다.
    type: Phaser.AUTO,
    parent: 'app',
    scale: {
      width: initialSize.width,
      height: initialSize.height,
      mode: touchPrimary ? Phaser.Scale.NONE : Phaser.Scale.FIT,
    },
    input: {
      keyboard: true,
    },
    plugins: {
      global: [
        {
          key: 'rexInputTextPlugin',
          plugin: InputTextPlugin,
          start: true,
        },
        {
          key: 'rexBBCodeTextPlugin',
          plugin: BBCodeTextPlugin,
          start: true,
        },
      ],
      scene: [
        {
          key: 'rexUI',
          plugin: UIPlugin,
          mapping: 'rexUI',
        },
      ],
    },
    dom: {
      createContainer: true,
    },
    pixelArt: true,
    scene: [GameScene],
  };

  const game = new Phaser.Game(config);
  initGbaShell(game);
};

start();
