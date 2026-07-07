// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/client/App";

describe("Live2D companion surface UI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    FakeEventSource.instances = [];
    document.body.innerHTML = "";
  });

  it("does not render an audio unlock button", async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    vi.stubGlobal("EventSource", FakeEventSource);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).not.toContain("Enable sound");
    expect(container.textContent).not.toContain("Test sound");
  });

  it("reports surface status when SSE reconnects", async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "/v1/surface-status") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", FakeEventSource);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    await act(async () => {
      FakeEventSource.instances[0]?.dispatch("ready");
    });

    const statusCall = fetchMock.mock.calls.find(([url]) => String(url) === "/v1/surface-status");
    expect(statusCall?.[1]).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modelLoaded: false, audioUnlocked: false, latestError: null }),
    });
  });

  it("unlocks browser audio from a page click without rendering a button", async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (String(url) === "/v1/surface-status") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return new Promise<Response>(() => undefined);
    });
    const audioContext = new FakeAudioContext("suspended", "running");
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("AudioContext", vi.fn(() => audioContext));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });
    await act(async () => {
      document.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });

    expect(container.querySelector("button")).toBeNull();
    expect(statusBodies(fetchMock)).toContainEqual({
      modelLoaded: false,
      audioUnlocked: true,
      latestError: null,
    });
  });

  it("reports audio locked when an audio payload cannot resume the browser audio context", async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (String(url) === "/v1/surface-status") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("AudioContext", vi.fn(() => new FakeAudioContext("suspended", "suspended")));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });
    await act(async () => {
      FakeEventSource.instances[0]?.dispatch("audio", {
        data: JSON.stringify({
          type: "audio",
          audio: "AA==",
          volumes: [0.25],
          slice_length: 20,
          display_text: { text: "hello" },
          actions: { expressions: [0] },
          forwarded: false,
        }),
      });
    });

    expect(statusBodies(fetchMock)).toContainEqual({
      modelLoaded: false,
      audioUnlocked: false,
      latestError: "audio locked",
    });
    expect(container.textContent).toContain("audio locked");
  });
});

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onerror: (() => void) | null = null;
  private readonly listeners = new Map<string, Set<(event?: unknown) => void>>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(event: string, listener: (event?: unknown) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  dispatch(event: string, payload?: unknown) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload);
    }
  }

  close() {}
}

class FakeAudioContext {
  destination = {};
  state: AudioContextState;

  constructor(
    initialState: AudioContextState,
    private readonly stateAfterResume: AudioContextState,
  ) {
    this.state = initialState;
  }

  async resume() {
    this.state = this.stateAfterResume;
  }

  async decodeAudioData() {
    return {};
  }

  createBufferSource() {
    const source = {
      buffer: null as unknown,
      onended: null as (() => void) | null,
      connect: vi.fn(),
      start: vi.fn(() => {
        source.onended?.();
      }),
    };
    return source;
  }

  createAnalyser() {
    return {
      fftSize: 0,
      frequencyBinCount: 1,
      connect: vi.fn(),
      getByteFrequencyData: vi.fn(),
    };
  }
}

function statusBodies(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([url]) => String(url) === "/v1/surface-status")
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}
