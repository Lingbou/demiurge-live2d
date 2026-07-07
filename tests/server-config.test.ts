import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadDotEnvFile, resolveMiniMaxTTSOptions, resolveServerListenConfig } from "../src/server/serverConfig";

describe("server listen config", () => {
  it("binds to localhost by default", () => {
    expect(resolveServerListenConfig({})).toEqual({
      host: "127.0.0.1",
      port: 8787,
    });
  });

  it("allows host and port env overrides", () => {
    expect(resolveServerListenConfig({ HOST: "0.0.0.0", PORT: "9999" })).toEqual({
      host: "0.0.0.0",
      port: 9999,
    });
  });
});

describe("dotenv loading", () => {
  it("loads local .env values without overriding explicit environment values", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "demiurge-live2d-env-"));
    const env: Record<string, string | undefined> = {
      MINIMAX_MODEL: "speech-explicit",
    };

    try {
      const envPath = path.join(dir, ".env");
      writeFileSync(
        envPath,
        [
          "# local service config",
          "MINIMAX_API_KEY=secret-from-file",
          "MINIMAX_MODEL=speech-from-file",
          "MINIMAX_VOICE_ID=\"voice-from-file\"",
          "",
        ].join("\n"),
        "utf8",
      );

      loadDotEnvFile(envPath, env);

      expect(env.MINIMAX_API_KEY).toBe("secret-from-file");
      expect(env.MINIMAX_MODEL).toBe("speech-explicit");
      expect(env.MINIMAX_VOICE_ID).toBe("voice-from-file");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("MiniMax TTS config", () => {
  it("passes through endpoint overrides for regional MiniMax accounts", () => {
    expect(resolveMiniMaxTTSOptions({
      MINIMAX_API_KEY: "secret",
      MINIMAX_MODEL: "speech-2.8-hd",
      MINIMAX_VOICE_ID: "voice-id",
      MINIMAX_ENDPOINT: "https://api.minimaxi.com/v1/t2a_v2",
    })).toEqual({
      apiKey: "secret",
      model: "speech-2.8-hd",
      voiceId: "voice-id",
      endpoint: "https://api.minimaxi.com/v1/t2a_v2",
    });
  });
});
