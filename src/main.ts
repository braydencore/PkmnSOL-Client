import Phaser from 'phaser';
import InputTextPlugin from 'phaser3-rex-plugins/plugins/inputtext-plugin.js';
import BBCodeTextPlugin from 'phaser3-rex-plugins/plugins/bbcodetext-plugin.js';
import UIPlugin from 'phaser3-rex-plugins/templates/ui/ui-plugin.js';
import { GameScene } from './scenes/game.scene';
import { initI18n } from './i18n';
import { initGbaShell, prepareGbaShell } from './gba-shell';
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

  prepareGbaShell();

  const config: Phaser.Types.Core.GameConfig = {
    // WebGL(GPU 가속)을 우선 시도하고, 사용 불가 환경(드라이버 블랙리스트,
    // 하드웨어 가속 비활성화 등)에서는 Canvas 2D로 자동 폴백한다.
    // WEBGL로 고정하면 해당 환경에서 게임이 아예 뜨지 않으므로 AUTO를 사용한다.
    type: Phaser.AUTO,
    parent: 'app',
    scale: {
      width: 1920,
      height: 1080,
      // FIT (letterbox) everywhere, not ENVELOP (cover/crop): the game's UI
      // is built for a fixed 1920x1080 canvas with elements placed at
      // literal absolute pixel offsets from center (e.g. login's OAuth row
      // is `oauthContainer.setY(+500)`, the overworld party list is
      // `setPosition(+905, 0)`) rather than computed from screen size — so
      // cropping the canvas to cover a non-16:9 screen doesn't just show a
      // bit more/less world, it pushes edge-anchored UI off-screen
      // entirely. Confirmed by testing: ENVELOP cropped the login screen's
      // Google/Discord buttons off the bottom on a perfectly ordinary
      // iPhone. Fixing this for real means auditing and reworking those
      // fixed offsets across every screen, not a Scale Manager setting.
      mode: Phaser.Scale.FIT,
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
