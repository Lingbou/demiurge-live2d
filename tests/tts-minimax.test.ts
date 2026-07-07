import { afterEach, describe, expect, it, vi } from "vitest";
import { createMiniMaxTTSProvider } from "../src/server/tts/minimax";

describe("MiniMax TTS provider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("posts a non-streaming wav request and decodes hex audio", async () => {
    const wav = Buffer.from("RIFFtestWAVE");
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: { audio: wav.toString("hex") },
        base_resp: { status_code: 0, status_msg: "success" },
      }),
    }));
    const provider = createMiniMaxTTSProvider({
      apiKey: "key",
      fetchImpl: fetchImpl as never,
    });

    const result = await provider.synthesize({
      text: "hello [joy]",
      eventId: "evt_test",
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.minimax.io/v1/t2a_v2");
    expect(JSON.parse(String(init.body))).toMatchObject({
      stream: false,
      output_format: "hex",
      audio_setting: { format: "wav" },
    });
    expect(result).toEqual({
      audioBytes: wav,
      mediaType: "audio/wav",
    });
  });

  it("aborts requests after the configured timeout", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_url: URL, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const provider = createMiniMaxTTSProvider({
      apiKey: "key",
      timeoutMs: 10,
      fetchImpl: fetchImpl as never,
    });

    const result = provider.synthesize({ text: "hello", eventId: "evt_timeout" });
    const assertion = expect(result).rejects.toMatchObject({ code: "tts_timeout" });
    await vi.advanceTimersByTimeAsync(11);
    await assertion;
  });
});
