# demiurge-live2d

`demiurge-live2d` is a private local companion output service for Demiurge.
Demiurge sends final agent response text to this service; this service owns the
Live2D output side:

- parse `[emotion]` tags
- choose Live2D expressions
- call MiniMax TTS
- generate Open-LLM-VTuber-style audio payloads
- render the Live2D model
- show subtitles
- play audio
- drive mouth movement

The service intentionally does not implement ASR, microphone input, chat
history, interruption logic, group chat, or an agent loop. Those belong to
Demiurge or later integration layers.

## Current Boundary

V1 boundary:

```text
Demiurge agent response text
        |
        v
POST /v1/speak
        |
        v
demiurge-live2d queue -> emotion tag parsing -> MiniMax TTS -> SSE audio payload
        |
        v
Browser Live2D surface
```

The default integration mode is simple: Demiurge sends only response text.
Optional compatibility fields exist for later controlled mode.

## Setup

```powershell
cd C:\Workspace\github\demiurge-agent\.temp\demiurge-live2d
npm install
npm test
npm run build
npm run dev
```

The API listens on `http://127.0.0.1:8787` by default. Keep this local unless
you explicitly need LAN access.

```env
HOST=127.0.0.1
PORT=8787
```

## Environment

The server automatically loads `.env` from the repository root before creating
the TTS provider. You do not need to export these variables manually when using
`npm run dev`.

Example `.env`:

```env
PORT=8787
HOST=127.0.0.1
LIVE2D_CONFIG_PATH=./config/live2d.config.json

MINIMAX_API_KEY=your_key_here
MINIMAX_ENDPOINT=https://api.minimaxi.com/v1/t2a_v2
MINIMAX_MODEL=speech-2.8-hd
MINIMAX_VOICE_ID=voice_elysia
```

MiniMax endpoint rules:

- International MiniMax account: leave `MINIMAX_ENDPOINT` empty to use the
  default `https://api.minimax.io/v1/t2a_v2`.
- China MiniMax account: set
  `MINIMAX_ENDPOINT=https://api.minimaxi.com/v1/t2a_v2`.
- `MINIMAX_GROUP_ID` is not used by the current MiniMax T2A v2 API path.

If `MINIMAX_API_KEY` is missing, the service still runs but uses the
visual-only provider. In that mode subtitles and expressions still work, but
there is no real audio.

## Run State

Check the service:

```powershell
curl.exe http://127.0.0.1:8787/health
```

Healthy and ready for speech should look like this:

```json
{
  "ok": true,
  "service": "demiurge-live2d",
  "modelId": "mao_pro",
  "surfaceConnected": true,
  "surfaceModelLoaded": true,
  "audioUnlocked": true,
  "surfaceLatestError": null,
  "ttsProvider": "minimax"
}
```

Field meaning:

- `ttsProvider: "minimax"` means the server loaded MiniMax config.
- `ttsProvider: "disabled"` means no `MINIMAX_API_KEY` was loaded.
- `surfaceConnected` means a browser page is connected to SSE.
- `surfaceModelLoaded` means the browser reported that the Live2D model loaded.
- `audioUnlocked` means the browser has successfully played audio through Web
  Audio at least once.
- `surfaceLatestError` records the latest browser-side playback/model error.

After restarting the service, refresh `http://127.0.0.1:8787/` so the browser
loads the newest frontend bundle and reports surface status again.

## Browser Surface

Open:

```text
http://127.0.0.1:8787/
```

The surface should show the `mao_pro` model immediately after assets load. It
connects to `GET /v1/events`, receives audio payloads, updates subtitles and
expressions, plays audio, and drives mouth movement.

Current Live2D behavior:

- Expressions are supported. `[joy]` in text or explicit `emotionTag: "joy"`
  maps to `actions.expressions: [3]`, then the browser calls the Live2D
  expression API.
- Mouth movement is supported. The server generates `volumes` from MiniMax WAV
  audio and the browser maps them to `ParamMouthOpenY`. If `volumes` is empty,
  the browser falls back to Web Audio analyser data from actual playback.
- Motion groups are not wired in V1. The payload currently supports
  `actions.expressions`; it does not yet accept `actions.motions` or explicit
  motion group/index commands.

There is no separate "enable sound" button. Audio playback is attempted when
the first real audio payload arrives. If playback fails, the page reports the
error through `/v1/surface-status`.

## Public API

### GET /health

Returns service, TTS, and browser surface readiness.

### GET /v1/emotion-tags

```json
{
  "modelId": "mao_pro",
  "tags": ["neutral", "anger", "disgust", "fear", "joy", "smirk", "sadness", "surprise"]
}
```

### POST /v1/speak

This is the Demiurge integration entrypoint. It is asynchronous and
fire-and-forget: the request returns as soon as the job is accepted into the
FIFO queue. TTS and browser publishing happen in the background.

Minimal request:

```json
{
  "turnId": "turn_123",
  "text": "Hello [joy], let's keep going.",
  "source": "demiurge"
}
```

Optional controlled-mode fields:

```json
{
  "speechText": "Hello, let's keep going.",
  "displayText": "Hello, let's keep going.",
  "emotionTag": "joy"
}
```

Accepted response:

```json
{
  "accepted": true,
  "turnId": "turn_123",
  "queued": true,
  "queueDepth": 1
}
```

### GET /v1/events

Browser SSE stream. The main payload shape follows Open-LLM-VTuber:

```json
{
  "type": "audio",
  "audio": "base64 wav or null",
  "volumes": [0.1, 0.4, 0.8],
  "slice_length": 20,
  "display_text": { "text": "Hello, let's keep going." },
  "actions": { "expressions": [3] },
  "forwarded": false
}
```

Payload field semantics:

- `audio`: base64 WAV audio. `null` means silent fallback.
- `volumes`: normalized mouth-open values in the range `0..1`.
- `slice_length`: duration in milliseconds for each `volumes` entry.
- `display_text.text`: subtitle text shown by the browser.
- `actions.expressions`: Live2D expression ids to apply. The browser currently
  applies the first id.
- `forwarded`: reserved compatibility flag, currently always `false`.
- `warning`: optional TTS fallback/error information.

If TTS fails, the service still publishes subtitles and expressions with a
silent payload:

```json
{
  "type": "audio",
  "audio": null,
  "volumes": [],
  "slice_length": 20,
  "display_text": { "text": "Hello, let's keep going." },
  "actions": { "expressions": [3] },
  "forwarded": false,
  "warning": {
    "code": "tts_failed",
    "message": "MiniMax TTS failed: invalid api key"
  }
}
```

## Real Speech Smoke

This smoke test uses the real configured MiniMax account. It is not a mock and
may consume a small amount of TTS quota.

1. Start the service:

```powershell
npm run dev
```

2. Open or refresh the browser surface:

```text
http://127.0.0.1:8787/
```

3. Send a speak request:

```powershell
curl.exe --% -X POST http://127.0.0.1:8787/v1/speak -H "Content-Type: application/json" -d "{\"text\":\"hello [joy] this is a real voice test.\",\"source\":\"manual-smoke\"}"
```

4. Expected result:

- API returns `202 accepted`.
- Browser subtitle updates.
- Expression changes to joy.
- Voice plays.
- Mouth moves.
- `/health.audioUnlocked` becomes `true` after successful playback.

If the page moves but does not speak, check `/health` and the SSE warning. The
most common causes are:

- `ttsProvider` is `disabled`: `.env` was not loaded or `MINIMAX_API_KEY` is
  empty.
- warning says `invalid api key`: wrong key or wrong MiniMax endpoint for the
  account region.
- `surfaceConnected` is `false`: browser page is not open or not connected.
- `surfaceModelLoaded` is `false`: refresh the page and check model asset paths.

## Demiurge Integration

The intended Demiurge side is a parallel output slot/package:

- read `ctx.output.response_text`
- POST it to `http://127.0.0.1:8787/v1/speak`
- use `ctx.turn.turn_id` as `turnId`
- do not synthesize TTS inside Demiurge
- do not choose Live2D expressions inside Demiurge in V1
- use `failure_policy: soft`
- use `history_policy: transient`
- require only `network.fetch`

This keeps normal Demiurge text output alive even if Live2D, MiniMax, or the
browser surface fails.

## Assets

The implementation vendors Open-LLM-VTuber-derived private-use assets:

- `public/live2d-models/mao_pro`
- `public/libs/live2dcubismcore.min.js`
- model config and `emotionMap` in `config/live2d.config.json`

No Open-LLM-VTuber sample app is served as the default frontend. The active page
is the minimal companion surface in `src/client`.

## Deferred

Not implemented in this pass:

- API token auth
- MiniMax websocket streaming TTS
- queue persistence
- interruption/cancel/overwrite behavior
- full upstream Open-LLM-VTuber-Web replacement
- `npm audit` cleanup
