import { describe, expect, it } from "vitest";
import { computeLive2DLayout } from "../src/client/live2dLayout";

describe("Live2D surface layout", () => {
  it("fits a large model inside the visible stage", () => {
    const layout = computeLive2DLayout({
      stageWidth: 1280,
      stageHeight: 676,
      modelWidth: 2200,
      modelHeight: 2600,
      kScale: 0.5,
      initialXshift: 0,
      initialYshift: 0,
    });

    expect(layout.scale).toBeCloseTo((676 * 0.9) / 2600, 4);
    expect(layout.x).toBe(640);
    expect(layout.y).toBe(338);
    expect(layout.renderedHeight).toBeLessThanOrEqual(676);
  });

  it("keeps configured offsets after fitting", () => {
    const layout = computeLive2DLayout({
      stageWidth: 800,
      stageHeight: 600,
      modelWidth: 400,
      modelHeight: 1000,
      kScale: 0.5,
      initialXshift: 20,
      initialYshift: -30,
    });

    expect(layout.x).toBe(420);
    expect(layout.y).toBe(270);
  });
});
