import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { AudioPayload } from "../server/audioPayload";
import { computeLive2DLayout } from "./live2dLayout";

interface SurfaceConfig {
  model: {
    name: string;
    url: string;
    emotionMap: Record<string, number>;
    kScale?: number;
    initialXshift?: number;
    initialYshift?: number;
    kXOffset?: number;
  };
  emotionTags: string[];
}

type Live2DDisplayModel = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: { x?: number; y?: number; set(value: number): void };
  anchor?: { set(x: number, y?: number): void };
  expression?: (id?: number | string) => Promise<boolean>;
  internalModel?: {
    coreModel?: {
      setParameterValueById?: (parameterId: string, value: number) => void;
    };
  };
};

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const live2dModelRef = useRef<Live2DDisplayModel | null>(null);
  const mouthTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const surfaceStatusRef = useRef({ modelLoaded: false, audioUnlocked: false, latestError: null as string | null });
  const [surfaceConfig, setSurfaceConfig] = useState<SurfaceConfig | null>(null);
  const [status, setStatus] = useState("starting");
  const [subtitle, setSubtitle] = useState("");
  const [expressionLabel, setExpressionLabel] = useState("neutral");
  const [modelLoaded, setModelLoaded] = useState(false);

  const reportSurfaceStatus = (surfaceStatus: {
    modelLoaded?: boolean;
    audioUnlocked?: boolean;
    latestError?: string | null;
  }) => {
    surfaceStatusRef.current = {
      ...surfaceStatusRef.current,
      ...surfaceStatus,
    };
    void postSurfaceStatus(surfaceStatusRef.current);
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/v1/surface-config")
      .then((response) => response.json())
      .then((config: SurfaceConfig) => {
        if (!cancelled) {
          setSurfaceConfig(config);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("config unavailable");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!surfaceConfig || !canvasRef.current || !stageRef.current) {
      return;
    }

    const config = surfaceConfig;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    let disposed = false;
    let pixiApp: { stage: { addChild(child: unknown): void }; destroy(removeView?: boolean, options?: unknown): void } | null = null;
    let resizeObserver: ResizeObserver | null = null;

    async function bootLive2D() {
      try {
        await ensureScript("/libs/live2dcubismcore.min.js");
        const [pixi, live2d] = await Promise.all([
          import("pixi.js"),
          import("pixi-live2d-display/cubism4"),
        ]);
        (window as unknown as { PIXI: typeof pixi }).PIXI = pixi;

        pixiApp = new pixi.Application({
          view: canvas,
          resizeTo: stage,
          backgroundAlpha: 0,
          antialias: true,
        });
        const model = await live2d.Live2DModel.from(config.model.url) as unknown as Live2DDisplayModel;
        if (disposed) {
          return;
        }

        live2dModelRef.current = model;
        model.anchor?.set(0.5, 0.5);
        positionModel(model, stage, config);
        resizeObserver = new ResizeObserver(() => positionModel(model, stage, config));
        resizeObserver.observe(stage);
        pixiApp.stage.addChild(model);
        setModelLoaded(true);
        setStatus("surface connected");
        reportSurfaceStatus({ modelLoaded: true, latestError: null });
      } catch {
        setModelLoaded(false);
        setStatus("model assets missing");
        reportSurfaceStatus({ modelLoaded: false, latestError: "model assets missing" });
      }
    }

    void bootLive2D();

    return () => {
      disposed = true;
      live2dModelRef.current = null;
      if (mouthTimerRef.current !== null) {
        window.clearInterval(mouthTimerRef.current);
      }
      resizeObserver?.disconnect();
      pixiApp?.destroy(true, { children: true });
    };
  }, [surfaceConfig]);

  useEffect(() => {
    const events = new EventSource("/v1/events");
    events.addEventListener("ready", () => {
      setStatus((current) => current === "starting" ? "surface connected" : current);
      reportSurfaceStatus({});
    });
    events.addEventListener("audio", (event) => {
      const message = event as MessageEvent<string>;
      const payload = JSON.parse(message.data) as AudioPayload;
      void handleAudioPayload(payload, {
        setSubtitle,
        setExpressionLabel,
        setStatus,
        live2dModelRef,
        mouthTimerRef,
        audioContextRef,
        emotionMap: surfaceConfig?.model.emotionMap ?? {},
        reportSurfaceStatus,
      });
    });
    events.onerror = () => {
      setStatus("reconnecting");
    };

    return () => {
      events.close();
    };
  }, [surfaceConfig?.emotionTags]);

  return (
    <main className="surface">
      <div className="stage" ref={stageRef}>
        <canvas ref={canvasRef} className="stageCanvas" />
        <div className="subtitle" aria-live="polite">{subtitle}</div>
      </div>
      <footer className="statusBar">
        <span>{surfaceConfig?.model.name ?? "demiurge-live2d"}</span>
        <span>{expressionLabel}</span>
        <span>{modelLoaded ? "model loaded" : "model loading"}</span>
        <span>{status}</span>
      </footer>
    </main>
  );
}

async function handleAudioPayload(
  payload: AudioPayload,
  input: {
    setSubtitle(value: string): void;
    setExpressionLabel(value: string): void;
    setStatus(value: string): void;
    live2dModelRef: MutableRefObject<Live2DDisplayModel | null>;
    mouthTimerRef: MutableRefObject<number | null>;
    audioContextRef: MutableRefObject<AudioContext | null>;
    emotionMap: Record<string, number>;
    reportSurfaceStatus(status: { modelLoaded?: boolean; audioUnlocked?: boolean; latestError?: string | null }): void;
  },
) {
  input.setSubtitle(payload.display_text?.text ?? "");
  const firstExpression = payload.actions?.expressions?.[0] ?? 0;
  input.setExpressionLabel(resolveExpressionLabel(firstExpression, input.emotionMap));

  await input.live2dModelRef.current?.expression?.(firstExpression);

  if (payload.audio) {
    await playBase64Wav(payload.audio, {
      audioContextRef: input.audioContextRef,
      model: input.live2dModelRef.current,
      mouthTimerRef: input.mouthTimerRef,
      sliceLengthMs: payload.slice_length ?? 20,
      volumes: payload.volumes ?? [],
      onReady: () => {
        input.reportSurfaceStatus({ audioUnlocked: true, latestError: null });
      },
      onError: (message) => {
        input.setStatus(message);
        input.reportSurfaceStatus({ latestError: message });
      },
    });
    return;
  }

  driveMouth(payload.volumes ?? [], payload.slice_length ?? 20, input.live2dModelRef.current, input.mouthTimerRef);
}

function resolveExpressionLabel(expressionId: number, emotionMap: Record<string, number>) {
  const entry = Object.entries(emotionMap).find(([, mappedExpressionId]) => mappedExpressionId === expressionId);
  return entry?.[0] ?? `expression ${expressionId}`;
}

function driveMouth(
  volumes: number[],
  sliceLengthMs: number,
  model: Live2DDisplayModel | null,
  timerRef: MutableRefObject<number | null>,
) {
  stopMouth(model, timerRef);

  const setMouth = (value: number) => {
    model?.internalModel?.coreModel?.setParameterValueById?.("ParamMouthOpenY", value);
  };

  if (volumes.length === 0) {
    return;
  }

  let index = 0;
  timerRef.current = window.setInterval(() => {
    setMouth(volumes[index] ?? 0);
    index += 1;
    if (index >= volumes.length && timerRef.current !== null) {
      stopMouth(model, timerRef);
    }
  }, sliceLengthMs);
}

async function playBase64Wav(
  base64Audio: string,
  input: {
    audioContextRef: MutableRefObject<AudioContext | null>;
    model: Live2DDisplayModel | null;
    mouthTimerRef: MutableRefObject<number | null>;
    sliceLengthMs: number;
    volumes: number[];
    onReady(): void;
    onError(message: string): void;
  },
) {
  try {
    const audioContext = getAudioContext(input.audioContextRef);
    await audioContext.resume();
    const bytes = Uint8Array.from(window.atob(base64Audio), (character) => character.charCodeAt(0));
    const audioBuffer = await audioContext.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const source = audioContext.createBufferSource();
    const analyser = audioContext.createAnalyser();
    source.buffer = audioBuffer;
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    input.onReady();

    if (input.volumes.length > 0) {
      driveMouth(input.volumes, input.sliceLengthMs, input.model, input.mouthTimerRef);
    } else {
      driveMouthFromAnalyser(analyser, input.model, input.mouthTimerRef);
    }

    await new Promise<void>((resolve, reject) => {
      source.onended = () => resolve();
      try {
        source.start();
      } catch (error) {
        reject(error);
      }
    });
    stopMouth(input.model, input.mouthTimerRef);
  } catch (error) {
    input.onError(error instanceof Error ? error.message : "audio playback failed");
    driveMouth(input.volumes, input.sliceLengthMs, input.model, input.mouthTimerRef);
  }
}

function driveMouthFromAnalyser(
  analyser: AnalyserNode,
  model: Live2DDisplayModel | null,
  timerRef: MutableRefObject<number | null>,
) {
  stopMouth(model, timerRef);

  const data = new Uint8Array(analyser.frequencyBinCount);
  const setMouth = (value: number) => {
    model?.internalModel?.coreModel?.setParameterValueById?.("ParamMouthOpenY", value);
  };

  timerRef.current = window.setInterval(() => {
    analyser.getByteFrequencyData(data);
    const average = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length);
    setMouth(Math.min(1, average / 128));
  }, 20);
}

function stopMouth(model: Live2DDisplayModel | null, timerRef: MutableRefObject<number | null>) {
  if (timerRef.current !== null) {
    window.clearInterval(timerRef.current);
    timerRef.current = null;
  }
  model?.internalModel?.coreModel?.setParameterValueById?.("ParamMouthOpenY", 0);
}

function getAudioContext(audioContextRef: MutableRefObject<AudioContext | null>): AudioContext {
  if (!audioContextRef.current || audioContextRef.current.state === "closed") {
    audioContextRef.current = new AudioContext();
  }
  return audioContextRef.current;
}

async function postSurfaceStatus(status: {
  modelLoaded?: boolean;
  audioUnlocked?: boolean;
  latestError?: string | null;
}) {
  await fetch("/v1/surface-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(status),
  }).catch(() => undefined);
}

function positionModel(model: Live2DDisplayModel, stage: HTMLElement | null, config: SurfaceConfig) {
  const width = stage?.clientWidth ?? window.innerWidth;
  const height = stage?.clientHeight ?? window.innerHeight;
  const currentScale = typeof model.scale.x === "number" && model.scale.x > 0 ? model.scale.x : 1;
  const layout = computeLive2DLayout({
    stageWidth: width,
    stageHeight: height,
    modelWidth: model.width / currentScale,
    modelHeight: model.height / currentScale,
    kScale: config.model.kScale,
    initialXshift: config.model.initialXshift,
    initialYshift: config.model.initialYshift,
  });
  model.scale.set(layout.scale);
  model.x = layout.x;
  model.y = layout.y;
}

async function ensureScript(src: string) {
  if ((window as unknown as Record<string, unknown>).Live2DCubismCore) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(script);
  });
}
