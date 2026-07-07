import { describe, expect, it, vi } from "vitest";
import { SurfaceEventHub } from "../src/server/events";

describe("SurfaceEventHub", () => {
  it("tracks surface connections and publishes payloads", () => {
    const hub = new SurfaceEventHub();
    const response = {
      writeHead: vi.fn(),
      write: vi.fn(),
      on: vi.fn(),
    };

    const disconnect = hub.addClient(response as never);
    expect(hub.connected()).toBe(true);

    hub.publishAudio({ type: "audio", audio: null, volumes: [], slice_length: 20 });
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining("event: audio"));
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining("\"type\":\"audio\""));

    disconnect();
    expect(hub.connected()).toBe(false);
  });

  it("removes a broken client without blocking healthy clients", () => {
    const hub = new SurfaceEventHub();
    let brokenWriteCount = 0;
    const broken = {
      writeHead: vi.fn(),
      write: vi.fn(() => {
        brokenWriteCount += 1;
        if (brokenWriteCount > 1) {
          throw new Error("socket closed");
        }
      }),
      on: vi.fn(),
    };
    const healthy = {
      writeHead: vi.fn(),
      write: vi.fn(),
      on: vi.fn(),
    };

    hub.addClient(broken as never);
    hub.addClient(healthy as never);
    hub.publishAudio({ type: "audio", audio: null, volumes: [], slice_length: 20 });

    expect(healthy.write).toHaveBeenCalledWith(expect.stringContaining("event: audio"));
    expect(hub.count()).toBe(1);
  });

  it("resets surface readiness when the last client disconnects", () => {
    const hub = new SurfaceEventHub();
    const response = {
      writeHead: vi.fn(),
      write: vi.fn(),
      on: vi.fn(),
    };

    const disconnect = hub.addClient(response as never);
    hub.updateSurfaceStatus({ modelLoaded: true, audioUnlocked: true, latestError: null });
    disconnect();

    expect(hub.status()).toMatchObject({
      modelLoaded: false,
      audioUnlocked: false,
    });
  });
});
