export interface Live2DLayoutInput {
  stageWidth: number;
  stageHeight: number;
  modelWidth: number;
  modelHeight: number;
  kScale?: number;
  initialXshift?: number;
  initialYshift?: number;
}

export interface Live2DLayout {
  scale: number;
  x: number;
  y: number;
  renderedWidth: number;
  renderedHeight: number;
}

export function computeLive2DLayout(input: Live2DLayoutInput): Live2DLayout {
  const stageWidth = Math.max(1, input.stageWidth);
  const stageHeight = Math.max(1, input.stageHeight);
  const modelWidth = Math.max(1, input.modelWidth);
  const modelHeight = Math.max(1, input.modelHeight);
  const heightRatio = clamp((input.kScale ?? 0.5) * 1.8, 0.25, 0.95);
  const targetHeightScale = (stageHeight * heightRatio) / modelHeight;
  const targetWidthScale = (stageWidth * 0.9) / modelWidth;
  const scale = Math.min(targetHeightScale, targetWidthScale);

  return {
    scale,
    x: stageWidth / 2 + (input.initialXshift ?? 0),
    y: stageHeight / 2 + (input.initialYshift ?? 0),
    renderedWidth: modelWidth * scale,
    renderedHeight: modelHeight * scale,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
