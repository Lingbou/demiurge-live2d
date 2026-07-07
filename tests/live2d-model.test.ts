import { describe, expect, it } from "vitest";
import { loadLive2DConfigFromObject, Live2DModel } from "../src/server/live2dModel";

describe("Live2D model config", () => {
  it("loads emotion tags from an Open-LLM-VTuber style model_dict", () => {
    const config = loadLive2DConfigFromObject({
      models: [
        {
          name: "mao_pro",
          url: "/live2d-models/mao_pro/runtime/mao_pro.model3.json",
          kScale: 0.5,
          initialXshift: 0,
          initialYshift: 0,
          kXOffset: 1150,
          idleMotionGroupName: "Idle",
          emotionMap: {
            neutral: 0,
            joy: 3,
            sadness: 1,
          },
        },
      ],
      defaultModel: "mao_pro",
      defaultEmotion: "neutral",
    });

    expect(config.defaultModel).toBe("mao_pro");
    expect(config.models[0]?.emotionMap.joy).toBe(3);
  });

  it("rejects duplicate emotion tags ignoring case", () => {
    expect(() =>
      loadLive2DConfigFromObject({
        models: [
          {
            name: "mao_pro",
            url: "/model.model3.json",
            emotionMap: {
              Joy: 1,
              joy: 2,
            },
          },
        ],
      }),
    ).toThrow("duplicate emotion tag: joy");
  });

  it("extracts bracketed tags and removes them from display text", () => {
    const model = new Live2DModel({
      name: "mao_pro",
      url: "/model.model3.json",
      emotionMap: {
        neutral: 0,
        joy: 3,
        sadness: 1,
      },
    });

    expect(model.extractEmotion("Hi [joy], good to see you [sadness].")).toEqual([3, 1]);
    expect(model.removeEmotionKeywords("Hi [joy], good to see you.")).toBe("Hi , good to see you.");
  });

  it("falls back to configured default emotion when text has no known tag", () => {
    const model = new Live2DModel({
      name: "mao_pro",
      url: "/model.model3.json",
      defaultEmotion: "neutral",
      emotionMap: {
        neutral: 0,
        joy: 3,
      },
    });

    expect(model.resolveExpressions("plain text")).toEqual([0]);
  });
});
