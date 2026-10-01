import "./config/env.js";
import { createApp } from "./app.js";
import { ComputeService } from "./orchestration/service.js";
import { isMockMode } from "./llm/client.js";
import { findBrowser } from "./qa/browser.js";

const service = new ComputeService();
await service.init();
const app = createApp(service);
const port = Number(process.env.PORT) || 4100;

const server = app.listen(port, () => {
  console.info(`[compute] KULT compute layer on http://localhost:${port}`);
  console.info(`[compute] LLM: ${isMockMode() ? "MOCK (no ZERO_G_API_KEY or LLM_MOCK=1)" : process.env.ZERO_G_BASE_URL || "0G router"}; playtest browser: ${findBrowser() ?? "none"}`);
});

const shutdown = async () => {
  server.close();
  await service.store.flush();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
