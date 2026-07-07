import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import packageJson from "../../package.json" assert { type: "json" };
import { SurfaceEventHub } from "./events";
import { Live2DModel, loadLive2DConfigFromFile } from "./live2dModel";
import { createRoutes } from "./routes";
import { loadDotEnvFile, resolveMiniMaxTTSOptions, resolveServerListenConfig } from "./serverConfig";
import { createDisabledTTSProvider } from "./tts/disabled";
import { createMiniMaxTTSProvider } from "./tts/minimax";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
loadDotEnvFile(path.join(repoRoot, ".env"));

const configPath = process.env.LIVE2D_CONFIG_PATH ?? path.join(repoRoot, "config/live2d.config.json");
const config = loadLive2DConfigFromFile(configPath);
const modelConfig = config.models.find((model) => model.name === config.defaultModel);
if (!modelConfig) {
  throw new Error(`default model ${config.defaultModel} is not defined`);
}

const model = new Live2DModel(modelConfig);
const eventHub = new SurfaceEventHub();
const miniMaxOptions = resolveMiniMaxTTSOptions(process.env);
const ttsProvider = miniMaxOptions
  ? createMiniMaxTTSProvider(miniMaxOptions)
  : createDisabledTTSProvider();

const app = express();
const listenConfig = resolveServerListenConfig(process.env);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(repoRoot, "public")));
app.use(createRoutes({
  version: packageJson.version,
  model,
  eventHub,
  ttsProvider,
}));

const distPath = path.join(repoRoot, "dist");
app.use(express.static(distPath));
app.get("*", (_request, response) => {
  response.sendFile(path.join(distPath, "index.html"));
});

app.listen(listenConfig.port, listenConfig.host, () => {
  console.log(`demiurge-live2d listening on http://${listenConfig.host}:${listenConfig.port}`);
});
