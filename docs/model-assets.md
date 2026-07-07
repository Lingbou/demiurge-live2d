# Model Assets

This service vendors only the Open-LLM-VTuber assets needed by the current companion surface.

Current layout:

```text
public/
  libs/
    live2dcubismcore.min.js
  live2d-models/
    mao_pro/
      runtime/
        mao_pro.model3.json
        ...
```

`config/live2d.config.json` uses `mao_pro` by default. Extra upstream frontend bundles, VAD/ONNX assets, unused runtime files, and non-default sample models are intentionally not vendored.

If you change the model id or file layout, update `config/live2d.config.json`:

```json
{
  "defaultModel": "your_model",
  "defaultEmotion": "neutral",
  "models": [
    {
      "name": "your_model",
      "url": "/live2d-models/your_model/runtime/your_model.model3.json",
      "emotionMap": {
        "neutral": 0,
        "joy": 3
      }
    }
  ]
}
```

`emotionMap` values are expression indexes from the model's expression definitions. Duplicate emotion tags are rejected case-insensitively.
