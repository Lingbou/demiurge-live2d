import { Router } from "express";
import { z } from "zod";
import type { SurfaceEventHub } from "./events";
import type { Live2DModel } from "./live2dModel";
import { SpeakQueue } from "./speakQueue";
import type { TTSProvider } from "./tts/types";

const speakRequestSchema = z.object({
  turnId: z.string().optional(),
  text: z.string().min(1),
  source: z.string().optional(),
  speechText: z.string().optional(),
  displayText: z.string().optional(),
  emotionTag: z.string().optional(),
});

export function createRoutes(input: {
  version: string;
  model: Live2DModel;
  eventHub: SurfaceEventHub;
  ttsProvider: TTSProvider;
}): Router {
  const router = Router();
  const speakQueue = new SpeakQueue(input);

  router.get("/health", (_request, response) => {
    const surfaceStatus = input.eventHub.status();
    response.json({
      ok: true,
      service: "demiurge-live2d",
      version: input.version,
      modelId: input.model.name,
      surfaceConnected: input.eventHub.connected(),
      surfaceModelLoaded: surfaceStatus.modelLoaded,
      audioUnlocked: surfaceStatus.audioUnlocked,
      surfaceLatestError: surfaceStatus.latestError,
      ttsProvider: input.ttsProvider.id,
    });
  });

  router.get("/v1/emotion-tags", (_request, response) => {
    response.json({
      modelId: input.model.name,
      tags: input.model.tags,
    });
  });

  router.get("/v1/surface-config", (_request, response) => {
    response.json({
      model: input.model.rawConfig,
      emotionTags: input.model.tags,
    });
  });

  router.get("/v1/events", (_request, response) => {
    input.eventHub.addClient(response);
  });

  router.post("/v1/surface-status", (request, response) => {
    const status = surfaceStatusSchema.parse(request.body);
    input.eventHub.updateSurfaceStatus(status);
    response.status(204).end();
  });

  router.post("/v1/speak", async (request, response, next) => {
    try {
      const body = speakRequestSchema.parse(request.body);
      const turnId = body.turnId ?? crypto.randomUUID();
      if (body.emotionTag) {
        input.model.resolveExpressions(body.text, body.emotionTag);
      }
      const queued = speakQueue.enqueue({
        ...body,
        turnId,
      });

      response.status(202).json({
        accepted: true,
        turnId: queued.turnId,
        queued: true,
        queueDepth: queued.queueDepth,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        response.status(400).json({ error: "invalid speak request", issues: error.issues });
        return;
      }
      if (error instanceof Error && error.message.startsWith("unknown emotion tag")) {
        response.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  return router;
}

const surfaceStatusSchema = z.object({
  modelLoaded: z.boolean().optional(),
  audioUnlocked: z.boolean().optional(),
  latestError: z.string().nullable().optional(),
});
