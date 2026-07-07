import { existsSync, readFileSync } from "node:fs";

export interface ServerListenConfig {
  host: string;
  port: number;
}

export interface MiniMaxTTSConfig {
  apiKey: string;
  model?: string;
  voiceId?: string;
  endpoint?: string;
}

export function resolveServerListenConfig(env: Record<string, string | undefined>): ServerListenConfig {
  return {
    host: env.HOST ?? "127.0.0.1",
    port: Number(env.PORT ?? 8787),
  };
}

export function resolveMiniMaxTTSOptions(env: Record<string, string | undefined>): MiniMaxTTSConfig | null {
  if (!env.MINIMAX_API_KEY) {
    return null;
  }

  return {
    apiKey: env.MINIMAX_API_KEY,
    model: env.MINIMAX_MODEL,
    voiceId: env.MINIMAX_VOICE_ID,
    endpoint: env.MINIMAX_ENDPOINT,
  };
}

export function loadDotEnvFile(path: string, env: Record<string, string | undefined> = process.env): void {
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (env[key] !== undefined) {
      continue;
    }

    env[key] = unquoteEnvValue(rawValue.trim());
  }
}

function unquoteEnvValue(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}
