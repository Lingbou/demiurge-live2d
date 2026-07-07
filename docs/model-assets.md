# Model Assets

This service vendors only the Live2D assets needed by the current companion surface.

Current layout:

```text
public/
  libs/
    live2dcubismcore.min.js
  live2d-models/
    Cyrene/
      model0.json
      Moc_0.moc3
      Textures_0_0.png
      Expressions_*.json
      Motions_*.json
      Physics_0.json
    elysia/
      爱莉希雅.model3.json
      爱莉希雅.moc3
      爱莉希雅.8192/
      ...
    mao_pro/
      runtime/
        mao_pro.model3.json
        ...
```

`config/live2d.config.json` uses `cyrene` by default. The Elysia and original `mao_pro` sample entries remain available as fallback models. Extra upstream frontend bundles, VAD/ONNX assets, and unused runtime files are intentionally not vendored.

If you change the model id or file layout, update `config/live2d.config.json`:

```json
{
  "defaultModel": "cyrene",
  "defaultEmotion": "neutral",
  "models": [
    {
      "name": "cyrene",
      "url": "/live2d-models/Cyrene/model0.json",
      "emotionMap": {
        "neutral": 0,
        "星星眼": 4,
        "joy": 6
      }
    }
  ]
}
```

`emotionMap` values are expression indexes from the model's expression definitions. Tags may be Chinese model-native labels or English aliases, and duplicate emotion tags are rejected case-insensitively.
