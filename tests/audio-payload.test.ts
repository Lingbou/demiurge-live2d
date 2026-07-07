import { describe, expect, it } from "vitest";
import { createAudioPayload, createSilentAudioPayload, createTestWav } from "../src/server/audioPayload";

describe("Open-LLM-VTuber style audio payload", () => {
  it("creates a silent payload with display text and expressions", () => {
    const payload = createSilentAudioPayload({
      displayText: "hello",
      expressions: [3],
    });

    expect(payload).toMatchObject({
      type: "audio",
      audio: null,
      volumes: [],
      slice_length: 20,
      display_text: { text: "hello" },
      actions: { expressions: [3] },
      forwarded: false,
    });
  });

  it("encodes wav audio and normalized volume chunks", () => {
    const wav = createTestWav([0, 1000, -1000, 2000, -2000, 0, 0, 0], 8000);
    const payload = createAudioPayload({
      audioBytes: wav,
      mediaType: "audio/wav",
      displayText: "hello",
      expressions: [3],
      chunkLengthMs: 1,
    });

    expect(payload.audio).toBe(Buffer.from(wav).toString("base64"));
    expect(payload.volumes.length).toBeGreaterThan(0);
    expect(Math.max(...payload.volumes)).toBe(1);
  });
});
