import type { TTSSynthesizeInput, TTSProvider } from "./types";

type FetchLike = (input: URL, init: RequestInit) => Promise<{
  ok: boolean;
  status?: number;
  statusText?: string;
  json(): Promise<unknown>;
  text?: () => Promise<string>;
}>;

export interface MiniMaxTTSOptions {
  apiKey: string;
  model?: string;
  voiceId?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

export function createMiniMaxTTSProvider(options: MiniMaxTTSOptions): TTSProvider {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("MiniMax TTS requires fetch support");
  }

  return {
    id: "minimax",
    async synthesize(input: TTSSynthesizeInput) {
      const abortController = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        abortController.abort();
      }, options.timeoutMs ?? 10_000);
      const url = new URL(options.endpoint ?? "https://api.minimax.io/v1/t2a_v2");

      const body = {
        model: options.model ?? "speech-2.8-hd",
        text: input.text,
        stream: false,
        output_format: "hex",
        voice_setting: {
          voice_id: options.voiceId ?? "male-qn-qingse",
          speed: 1,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: "wav",
          channel: 1,
        },
      };

      try {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: {
            accept: "application/json, text/plain, */*",
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
            "x-demiurge-event-id": input.eventId,
          },
          signal: abortController.signal,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(`MiniMax TTS request failed with status ${response.status ?? "unknown"}`);
        }

        const json = await response.json() as {
          data?: { audio?: string };
          base_resp?: { status_code?: number; status_msg?: string };
        };
        if (json.base_resp && json.base_resp.status_code && json.base_resp.status_code !== 0) {
          throw new Error(`MiniMax TTS failed: ${json.base_resp.status_msg ?? json.base_resp.status_code}`);
        }
        if (!json.data?.audio) {
          throw new Error("MiniMax TTS response did not include audio");
        }

        return {
          audioBytes: Buffer.from(json.data.audio, "hex"),
          mediaType: "audio/wav",
        };
      } catch (error) {
        if (timedOut || abortController.signal.aborted) {
          throw createTtsTimeoutError(options.timeoutMs ?? 10_000);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function createTtsTimeoutError(timeoutMs: number): Error & { code: "tts_timeout" } {
  const error = new Error(`MiniMax TTS timed out after ${timeoutMs}ms`) as Error & { code: "tts_timeout" };
  error.code = "tts_timeout";
  return error;
}
