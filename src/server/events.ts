import type { AudioPayload } from "./audioPayload";

interface WritableSseResponse {
  writeHead(statusCode: number, headers?: Record<string, string>): void;
  write(chunk: string): void;
  on(event: "close" | "error", listener: () => void): void;
}

export interface SurfaceStatus {
  modelLoaded: boolean;
  audioUnlocked: boolean;
  latestError: string | null;
}

export class SurfaceEventHub {
  private readonly clients = new Set<WritableSseResponse>();
  private surfaceStatus: SurfaceStatus = {
    modelLoaded: false,
    audioUnlocked: false,
    latestError: null,
  };

  addClient(response: WritableSseResponse): () => void {
    response.writeHead(200, {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    });

    const disconnect = () => {
      this.clients.delete(response);
      if (this.clients.size === 0) {
        this.surfaceStatus = {
          modelLoaded: false,
          audioUnlocked: false,
          latestError: null,
        };
      }
    };

    this.clients.add(response);
    try {
      response.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    } catch {
      this.clients.delete(response);
    }
    response.on("close", disconnect);
    response.on("error", disconnect);

    return disconnect;
  }

  connected(): boolean {
    return this.clients.size > 0;
  }

  count(): number {
    return this.clients.size;
  }

  updateSurfaceStatus(status: Partial<SurfaceStatus>): void {
    this.surfaceStatus = {
      ...this.surfaceStatus,
      ...status,
    };
  }

  status(): SurfaceStatus {
    return this.surfaceStatus;
  }

  publishAudio(payload: Partial<AudioPayload> & { type: "audio" }): void {
    const frame = `event: audio\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(frame);
      } catch {
        this.clients.delete(client);
      }
    }
  }
}
