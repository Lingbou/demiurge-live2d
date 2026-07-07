import type { TTSProvider } from "./types";

export function createDisabledTTSProvider(): TTSProvider {
  return {
    id: "disabled",
    async synthesize() {
      return null;
    },
  };
}
