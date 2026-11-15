import { Scene } from "phaser";

/** First scene: proves Phaser renders inside React and loads art from public/assets. */
export class BootScene extends Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    this.load.image("nova", "/assets/common/nova-l1-idle-01.png");
  }

  create(): void {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, 480, 320, 0x9c8fd6).setStrokeStyle(8, 0x2a1e3d);
    this.add.image(width / 2, height / 2 + 20, "nova").setScale(1.5);
  }
}
