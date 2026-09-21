import { MapConfig, MapRegistry } from '@poposafari/core/map.registry';
import { GameScene } from '@poposafari/scenes';
import { MapView } from './map-view';

export class MapBuilder {
  constructor(
    private scene: GameScene,
    private registry: MapRegistry,
  ) {}

  /**
   * Tilemap JSON for a map's layout (~18MB total across all 55 maps) is no longer
   * preloaded for every map at boot — only the map actually being entered is fetched,
   * here, right before build() needs it.
   */
  ensureLoaded(config: MapConfig): Promise<void> {
    if (this.scene.cache.tilemap.exists(config.key)) return Promise.resolve();
    return new Promise((resolve) => {
      this.scene.load.once('complete', () => resolve());
      this.scene.loadMap(config.key, 'ui/maps', config.key);
      this.scene.load.start();
    });
  }

  build(config: MapConfig): MapView {
    const mapView = new MapView(this.scene);
    mapView.setup(config);
    return mapView;
  }
}
