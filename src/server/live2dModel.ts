import fs from "node:fs";

export type EmotionMap = Record<string, number>;

export interface Live2DModelConfig {
  name: string;
  url: string;
  description?: string;
  kScale?: number;
  initialXshift?: number;
  initialYshift?: number;
  kXOffset?: number;
  idleMotionGroupName?: string;
  defaultEmotion?: string;
  emotionMap: EmotionMap;
  tapMotions?: unknown;
}

export interface Live2DServiceConfig {
  defaultModel: string;
  defaultEmotion: string;
  models: Live2DModelConfig[];
}

export class Live2DModel {
  readonly name: string;
  readonly url: string;
  readonly defaultEmotion: string;
  readonly emotionMap: EmotionMap;
  readonly rawConfig: Live2DModelConfig;

  constructor(config: Live2DModelConfig) {
    if (!config.name) {
      throw new Error("Live2D model name is required");
    }
    if (!config.url) {
      throw new Error(`Live2D model ${config.name} url is required`);
    }

    const emotionMap = normalizeEmotionMap(config.emotionMap);
    const defaultEmotion = (config.defaultEmotion ?? "neutral").toLowerCase();
    if (!(defaultEmotion in emotionMap)) {
      throw new Error(`default emotion ${defaultEmotion} is not defined for model ${config.name}`);
    }

    this.name = config.name;
    this.url = config.url;
    this.defaultEmotion = defaultEmotion;
    this.emotionMap = emotionMap;
    this.rawConfig = { ...config, defaultEmotion, emotionMap };
  }

  get tags(): string[] {
    return Object.keys(this.emotionMap);
  }

  extractEmotion(text: string): number[] {
    const lowerText = text.toLowerCase();
    const expressions: number[] = [];

    let cursor = 0;
    while (cursor < lowerText.length) {
      if (lowerText[cursor] !== "[") {
        cursor += 1;
        continue;
      }

      let matched = false;
      for (const [tag, expressionId] of Object.entries(this.emotionMap)) {
        const token = `[${tag}]`;
        if (lowerText.slice(cursor, cursor + token.length) === token) {
          expressions.push(expressionId);
          cursor += token.length;
          matched = true;
          break;
        }
      }

      if (!matched) {
        cursor += 1;
      }
    }

    return expressions;
  }

  removeEmotionKeywords(text: string): string {
    let displayText = text;
    let lowerText = text.toLowerCase();

    for (const tag of this.tags) {
      const token = `[${tag}]`;
      let index = lowerText.indexOf(token);
      while (index >= 0) {
        displayText = displayText.slice(0, index) + displayText.slice(index + token.length);
        lowerText = lowerText.slice(0, index) + lowerText.slice(index + token.length);
        index = lowerText.indexOf(token);
      }
    }

    return displayText;
  }

  resolveExpressions(text: string, explicitTag?: string): number[] {
    if (explicitTag) {
      const tag = explicitTag.toLowerCase();
      const expressionId = this.emotionMap[tag];
      if (expressionId === undefined) {
        throw new Error(`unknown emotion tag: ${explicitTag}`);
      }
      return [expressionId];
    }

    const expressions = this.extractEmotion(text);
    if (expressions.length > 0) {
      return expressions;
    }

    return [this.emotionMap[this.defaultEmotion]];
  }
}

export function loadLive2DConfigFromFile(path: string): Live2DServiceConfig {
  return loadLive2DConfigFromObject(JSON.parse(fs.readFileSync(path, "utf8")));
}

export function loadLive2DConfigFromObject(input: unknown): Live2DServiceConfig {
  const source = normalizeConfigShape(input);
  if (source.models.length === 0) {
    throw new Error("at least one Live2D model is required");
  }

  const defaultModel = source.defaultModel ?? source.models[0]?.name;
  if (!defaultModel) {
    throw new Error("defaultModel is required");
  }

  const defaultEmotion = (source.defaultEmotion ?? "neutral").toLowerCase();
  const models = source.models.map((model) => {
    const resolvedDefaultEmotion = (model.defaultEmotion ?? defaultEmotion).toLowerCase();
    return new Live2DModel({ ...model, defaultEmotion: resolvedDefaultEmotion }).rawConfig;
  });

  if (!models.some((model) => model.name === defaultModel)) {
    throw new Error(`default model ${defaultModel} is not defined`);
  }

  return {
    defaultModel,
    defaultEmotion,
    models,
  };
}

function normalizeConfigShape(input: unknown): {
  defaultModel?: string;
  defaultEmotion?: string;
  models: Live2DModelConfig[];
} {
  if (Array.isArray(input)) {
    return { models: input as Live2DModelConfig[] };
  }

  if (!input || typeof input !== "object") {
    throw new Error("Live2D config must be an object or model array");
  }

  const config = input as {
    defaultModel?: string;
    defaultEmotion?: string;
    models?: Live2DModelConfig[];
  };
  if (!Array.isArray(config.models)) {
    throw new Error("Live2D config models must be an array");
  }

  return {
    defaultModel: config.defaultModel,
    defaultEmotion: config.defaultEmotion,
    models: config.models,
  };
}

function normalizeEmotionMap(input: unknown): EmotionMap {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("emotionMap must be an object");
  }

  const normalized: EmotionMap = {};
  for (const [rawTag, rawExpressionId] of Object.entries(input as EmotionMap)) {
    const tag = rawTag.toLowerCase();
    if (tag in normalized) {
      throw new Error(`duplicate emotion tag: ${tag}`);
    }

    if (!Number.isInteger(rawExpressionId) || rawExpressionId < 0) {
      throw new Error(`invalid expression id for emotion tag: ${rawTag}`);
    }

    normalized[tag] = rawExpressionId;
  }

  if (Object.keys(normalized).length === 0) {
    throw new Error("emotionMap must define at least one tag");
  }

  return normalized;
}
