import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createRoutes } from "../src/server/routes";
import { Live2DModel } from "../src/server/live2dModel";
import { createDisabledTTSProvider } from "../src/server/tts/disabled";
import { SurfaceEventHub } from "../src/server/events";
import type { TTSProvider } from "../src/server/tts/types";

function createTestApp(ttsProvider: TTSProvider = createDisabledTTSProvider()) {
  const model = new Live2DModel({
    name: "mao_pro",
    url: "/live2d-models/mao_pro/runtime/mao_pro.model3.json",
    defaultEmotion: "neutral",
    emotionMap: {
      neutral: 0,
      joy: 3,
    },
  });
  const eventHub = new SurfaceEventHub();
  const app = express();
  app.use(express.json());
  app.use(
    createRoutes({
      version: "0.1.0",
      model,
      eventHub,
      ttsProvider,
    }),
  );
  return { app, eventHub };
}

describe("companion API", () => {
  it("returns health", async () => {
    const { app } = createTestApp();
    const response = await request(app).get("/health").expect(200);

    expect(response.body).toMatchObject({
      ok: true,
      service: "demiurge-live2d",
      modelId: "mao_pro",
      surfaceConnected: false,
      surfaceModelLoaded: false,
      audioUnlocked: false,
      ttsProvider: "disabled",
    });
  });

  it("updates surface readiness from browser status reports", async () => {
    const { app } = createTestApp();

    await request(app)
      .post("/v1/surface-status")
      .send({ modelLoaded: true, audioUnlocked: true, latestError: null })
      .expect(204);

    const response = await request(app).get("/health").expect(200);
    expect(response.body).toMatchObject({
      surfaceModelLoaded: true,
      audioUnlocked: true,
      surfaceLatestError: null,
    });
  });

  it("returns emotion tags", async () => {
    const { app } = createTestApp();
    const response = await request(app).get("/v1/emotion-tags").expect(200);

    expect(response.body).toEqual({
      modelId: "mao_pro",
      tags: ["neutral", "joy"],
    });
  });

  it("accepts speak requests immediately without waiting for TTS", async () => {
    const neverFinishesTTS: TTSProvider = {
      id: "slow",
      synthesize: vi.fn(() => new Promise<null>(() => undefined)),
    };
    const { app } = createTestApp(neverFinishesTTS);

    const response = await Promise.race([
      request(app).post("/v1/speak").send({ turnId: "turn_slow", text: "hello", source: "demiurge" }),
      new Promise<"timed-out">((resolve) => setTimeout(() => resolve("timed-out"), 75)),
    ]);

    expect(response).not.toBe("timed-out");
    if (response === "timed-out") {
      throw new Error("speak request timed out");
    }
    expect(response.body).toEqual({
      accepted: true,
      turnId: "turn_slow",
      queued: true,
      queueDepth: 1,
    });
  });

  it("publishes queued speak requests in FIFO order", async () => {
    const { app, eventHub } = createTestApp();
    const writes: string[] = [];
    eventHub.addClient({
      writeHead: vi.fn(),
      write: vi.fn((chunk: string) => writes.push(chunk)),
      on: vi.fn(),
    } as never);

    await request(app).post("/v1/speak").send({ turnId: "turn_1", text: "first [joy]" }).expect(202);
    await request(app).post("/v1/speak").send({ turnId: "turn_2", text: "second" }).expect(202);

    await waitFor(() => audioFrames(writes).length >= 2);
    expect(audioFrames(writes).map((frame) => frame.display_text.text)).toEqual(["first ", "second"]);
  });

  it("falls back to a silent payload when TTS fails", async () => {
    const failingTTS: TTSProvider = {
      id: "failing",
      synthesize: vi.fn(async () => {
        throw new Error("provider down");
      }),
    };
    const { app, eventHub } = createTestApp(failingTTS);
    const writes: string[] = [];
    eventHub.addClient({
      writeHead: vi.fn(),
      write: vi.fn((chunk: string) => writes.push(chunk)),
      on: vi.fn(),
    } as never);

    const response = await request(app)
      .post("/v1/speak")
      .send({ turnId: "turn_fail", text: "hello [joy]", source: "demiurge" })
      .expect(202);

    expect(response.body).toMatchObject({ accepted: true, queued: true });
    await waitFor(() => audioFrames(writes).length >= 1);
    expect(audioFrames(writes)[0]).toMatchObject({
      audio: null,
      display_text: { text: "hello " },
      actions: { expressions: [3] },
      warning: { code: "tts_failed" },
    });
  });

  it("falls back to a silent payload with warning when TTS returns empty audio", async () => {
    const emptyTTS: TTSProvider = {
      id: "empty",
      synthesize: vi.fn(async () => ({
        audioBytes: Buffer.alloc(0),
        mediaType: "audio/wav",
      })),
    };
    const { app, eventHub } = createTestApp(emptyTTS);
    const writes: string[] = [];
    eventHub.addClient({
      writeHead: vi.fn(),
      write: vi.fn((chunk: string) => writes.push(chunk)),
      on: vi.fn(),
    } as never);

    await request(app)
      .post("/v1/speak")
      .send({ turnId: "turn_empty", text: "empty [joy]" })
      .expect(202);

    await waitFor(() => audioFrames(writes).length >= 1);
    expect(audioFrames(writes)[0]).toMatchObject({
      audio: null,
      volumes: [],
      display_text: { text: "empty " },
      actions: { expressions: [3] },
      warning: { code: "tts_failed", message: "TTS provider returned empty audio" },
    });
  });

  it("accepts compatibility fields for controlled mode through the queue", async () => {
    const { app, eventHub } = createTestApp();
    const writes: string[] = [];
    eventHub.addClient({
      writeHead: vi.fn(),
      write: vi.fn((chunk: string) => writes.push(chunk)),
      on: vi.fn(),
    } as never);

    await request(app)
      .post("/v1/speak")
      .send({
        text: "raw text",
        speechText: "speak this",
        displayText: "show this",
        emotionTag: "joy",
      })
      .expect(202);

    await waitFor(() => audioFrames(writes).length >= 1);
    expect(audioFrames(writes)[0].actions.expressions).toEqual([3]);
    expect(audioFrames(writes)[0].display_text.text).toBe("show this");
  });

  it("rejects unknown explicit emotion tags before enqueueing", async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .post("/v1/speak")
      .send({ text: "raw text", emotionTag: "missing" })
      .expect(400);

    expect(response.body).toEqual({ error: "unknown emotion tag: missing" });
  });
});

function audioFrames(writes: string[]) {
  return writes
    .filter((frame) => frame.includes("event: audio"))
    .map((frame) => JSON.parse(frame.split("data: ")[1] ?? "{}"));
}

async function waitFor(assertion: () => boolean, timeoutMs = 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (assertion()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for condition");
}
