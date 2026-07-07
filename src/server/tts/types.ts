export interface TTSSynthesizeInput {
  text: string;
  eventId: string;
}

export interface TTSSynthesizeResult {
  audioBytes: Buffer;
  mediaType: "audio/wav" | string;
}

export interface TTSProvider {
  id: string;
  synthesize(input: TTSSynthesizeInput): Promise<TTSSynthesizeResult | null>;
}
