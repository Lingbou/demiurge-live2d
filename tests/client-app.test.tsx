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
});

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onerror: (() => void) | null = null;
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(event: string, listener: () => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  dispatch(event: string) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener();
    }
  }

  close() {}
}
