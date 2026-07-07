export interface AudioPayload {
  type: "audio";
  audio: string | null;
  volumes: number[];
  slice_length: number;
  display_text: { text: string };
  actions: { expressions: number[] };
  forwarded: boolean;
  warning?: {
    code: "tts_failed" | "tts_timeout";
    message: string;
  };
}

export function createSilentAudioPayload(input: {
  displayText: string;
  expressions: number[];
  chunkLengthMs?: number;
  warning?: AudioPayload["warning"];
}): AudioPayload {
  return {
    type: "audio",
    audio: null,
    volumes: [],
    slice_length: input.chunkLengthMs ?? 20,
    display_text: { text: input.displayText },
    actions: { expressions: input.expressions },
    forwarded: false,
    ...(input.warning ? { warning: input.warning } : {}),
  };
}

export function createAudioPayload(input: {
  audioBytes: Uint8Array | Buffer;
  mediaType: string;
  displayText: string;
  expressions: number[];
  chunkLengthMs?: number;
}): AudioPayload {
  const chunkLengthMs = input.chunkLengthMs ?? 20;

  return {
    type: "audio",
    audio: Buffer.from(input.audioBytes).toString("base64"),
    volumes: input.mediaType === "audio/wav" ? getWavVolumeChunks(Buffer.from(input.audioBytes), chunkLengthMs) : [],
    slice_length: chunkLengthMs,
    display_text: { text: input.displayText },
    actions: { expressions: input.expressions },
    forwarded: false,
  };
}

export function createTestWav(samples: number[], sampleRate: number): Buffer {
  const channelCount = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
  buffer.writeUInt16LE(channelCount * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  samples.forEach((sample, index) => {
    const clamped = Math.max(-32768, Math.min(32767, Math.trunc(sample)));
    buffer.writeInt16LE(clamped, 44 + index * bytesPerSample);
  });

  return buffer;
}

function getWavVolumeChunks(wavBytes: Buffer, chunkLengthMs: number): number[] {
  const wav = parsePcm16Wav(wavBytes);
  if (!wav || wav.samples.length === 0) {
    return [];
  }

  const samplesPerChunk = Math.max(1, Math.round((wav.sampleRate * chunkLengthMs) / 1000) * wav.channels);
  const rmsValues: number[] = [];
  for (let offset = 0; offset < wav.samples.length; offset += samplesPerChunk) {
    const chunk = wav.samples.subarray(offset, offset + samplesPerChunk);
    let sumSquares = 0;
    for (const sample of chunk) {
      const normalized = sample / 32768;
      sumSquares += normalized * normalized;
    }
    rmsValues.push(Math.sqrt(sumSquares / chunk.length));
  }

  const maxVolume = Math.max(...rmsValues);
  if (maxVolume <= 0) {
    return rmsValues.map(() => 0);
  }

  return rmsValues.map((volume) => volume / maxVolume);
}

function parsePcm16Wav(buffer: Buffer): { sampleRate: number; channels: number; samples: Int16Array } | null {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }

  let cursor = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let dataOffset = -1;
  let dataSize = 0;

  while (cursor + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", cursor, cursor + 4);
    const chunkSize = buffer.readUInt32LE(cursor + 4);
    const chunkStart = cursor + 8;

    if (chunkId === "fmt ") {
      audioFormat = buffer.readUInt16LE(chunkStart);
      channels = buffer.readUInt16LE(chunkStart + 2);
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
    } else if (chunkId === "data") {
      dataOffset = chunkStart;
      dataSize = chunkSize;
    }

    cursor = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (audioFormat !== 1 || bitsPerSample !== 16 || dataOffset < 0 || channels <= 0 || sampleRate <= 0) {
    return null;
  }

  const sampleCount = Math.floor(dataSize / 2);
  const samples = new Int16Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = buffer.readInt16LE(dataOffset + index * 2);
  }

  return { sampleRate, channels, samples };
}
