# Open-LLM-VTuber Reference Notes

Reference clone:

```text
C:\Workspace\github\demiurge-agent\.temp\reference\open-llm-vtuber
```

Observed upstream revisions:

- Open-LLM-VTuber main repo: `992309c0aa19845960228f880013d4685fde93b5`
- `frontend` submodule: `06a659b114fff788cf0daaa86e484576db4975bf`
- `frontend` remote: `https://github.com/Open-LLM-VTuber/Open-LLM-VTuber-Web`

Relevant upstream files:

- `model_dict.json`
- `src/open_llm_vtuber/live2d_model.py`
- `src/open_llm_vtuber/utils/stream_audio.py`
- `src/open_llm_vtuber/tts/minimax_tts.py`
- `src/open_llm_vtuber/tts/tts_factory.py`
- `frontend/assets/main-nu7uwxNJ.js`
- `frontend/assets/main-QEkl09-0.css`
- `frontend/libs/live2dcubismcore.min.js`
- `frontend/libs/live2d.min.js`

License notes:

- Open-LLM-VTuber main code is MIT licensed.
- Its repository license states that Live2D sample models are governed separately by `LICENSE-Live2D.md`.
- This private companion repo vendors only the upstream assets needed by the active companion surface.

Ported concepts:

- Open-LLM-VTuber-style `emotionMap` model config
- case-insensitive `[tag]` extraction and removal
- Open-LLM-VTuber-style audio payload:
  - `type: "audio"`
  - base64 audio or `null`
  - normalized `volumes`
  - `slice_length`
  - `display_text`
  - `actions.expressions`
- MiniMax TTS provider boundary
- default `mao_pro` Live2D sample model assets under `public/live2d-models/mao_pro`
- Cubism Core runtime under `public/libs`

Deliberately omitted from V1:

- ASR and microphone input
- chat history
- interruption controls
- multi-user or group chat flows
- agent loop ownership
- upstream built frontend copy
- unused VAD/ONNX browser assets
- non-default sample models
