import { createAudioPayload, createSilentAudioPayload, type AudioPayload } from "./audioPayload";
import type { SurfaceEventHub } from "./events";
import type { Live2DModel } from "./live2dModel";
import type { TTSProvider } from "./tts/types";

export interface SpeakJobInput {
  turnId: string;
  text: string;
  source?: string;
  speechText?: string;
  displayText?: string;
  emotionTag?: string;
}

export interface SpeakQueueResult {
  turnId: string;
  queueDepth: number;
}

export class SpeakQueue {
  private readonly pending: SpeakJobInput[] = [];
  private active = false;

  constructor(private readonly input: {
    model: Live2DModel;
    eventHub: SurfaceEventHub;
    ttsProvider: TTSProvider;
  }) {}

  enqueue(job: SpeakJobInput): SpeakQueueResult {
    this.pending.push(job);
    const queueDepth = this.depth();
    if (!this.active) {
      queueMicrotask(() => void this.drain());
    }
    return { turnId: job.turnId, queueDepth };
  }

  depth(): number {
    return this.pending.length + (this.active ? 1 : 0);
  }

  private async drain(): Promise<void> {
    if (this.active) {
      return;
    }
    this.active = true;
    try {
      while (this.pending.length > 0) {
        const job = this.pending.shift();
        if (!job) {
          continue;
        }
        const payload = await this.createPayloadSafely(job);
        this.input.eventHub.publishAudio(payload);
      }
    } finally {
      this.active = false;
    }
  }

  private async createPayloadSafely(job: SpeakJobInput): Promise<AudioPayload> {
    try {
      return await this.createPayload(job);
    } catch (error) {
      return createSilentAudioPayload({
        displayText: this.input.model.removeEmotionKeywords(job.displayText ?? job.text),
        expressions: [this.input.model.emotionMap[this.input.model.defaultEmotion]],
        warning: {
          code: "tts_failed",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async createPayload(job: SpeakJobInput): Promise<AudioPayload> {
    const speechText = job.speechText ?? this.input.model.removeEmotionKeywords(job.text);
    const displayText = job.displayText ?? this.input.model.removeEmotionKeywords(job.text);
    const expressions = this.input.model.resolveExpressions(job.text, job.emotionTag);

    try {
      const ttsResult = await this.input.ttsProvider.synthesize({
        text: speechText,
        eventId: job.turnId,
      });

      if (!ttsResult) {
        return createSilentAudioPayload({ displayText, expressions });
      }

      if (ttsResult.audioBytes.byteLength === 0) {
        return createSilentAudioPayload({
          displayText,
          expressions,
          warning: {
            code: "tts_failed",
            message: "TTS provider returned empty audio",
          },
        });
      }

      return createAudioPayload({
        audioBytes: ttsResult.audioBytes,
        mediaType: ttsResult.mediaType,
        displayText,
        expressions,
      });
    } catch (error) {
      const code = isTtsTimeout(error) ? "tts_timeout" : "tts_failed";
      return createSilentAudioPayload({
        displayText,
        expressions,
        warning: {
          code,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}

function isTtsTimeout(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "tts_timeout");
}
