import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type JsonObject = Record<string, unknown>;

function configPath(): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  return join(agentDir, "extensions", "pi-permission-system", "config.json");
}

function readConfig(path: string): JsonObject {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  const parsed = JSON.parse(text) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("permission-system config root must be a JSON object");
  }
  return parsed as JsonObject;
}

function saveConfig(path: string, config: JsonObject): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

async function toggleYolo(ctx: ExtensionContext, reloadAfterToggle = false): Promise<void> {
  const path = configPath();
  try {
    const config = readConfig(path);
    const next = config.yoloMode !== true;
    config.yoloMode = next;
    saveConfig(path, config);

    ctx.ui.setStatus("pi-permission-system", next ? "yolo" : undefined);
    if (reloadAfterToggle) {
      const maybeReload = (ctx as ExtensionContext & { reload?: () => Promise<void> }).reload;
      if (typeof maybeReload === "function") {
        await maybeReload.call(ctx);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Failed to toggle permission-system YOLO mode: ${message}`, "error");
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerShortcut("ctrl+/", {
    description: "Toggle pi-permission-system YOLO mode",
    handler: async (ctx) => toggleYolo(ctx, true),
  });

  pi.registerCommand("toggle-yolo", {
    description: "Toggle pi-permission-system YOLO mode",
    handler: async (_args, ctx) => toggleYolo(ctx, true),
  });
}
