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

function toggleYolo(ctx: ExtensionContext): boolean {
  const path = configPath();
  try {
    const config = readConfig(path);
    const next = config.yoloMode !== true;
    config.yoloMode = next;
    saveConfig(path, config);

    ctx.ui.setStatus("pi-permission-system", next ? "yolo" : undefined);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Failed to toggle permission-system YOLO mode: ${message}`, "error");
    return false;
  }
}

export default function (pi: ExtensionAPI) {
  let timer: ReturnType<typeof setInterval> | undefined;

  function stopWatching(): void {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  }

  pi.on("session_start", (_event, ctx) => {
    stopWatching();
    const path = configPath();
    let lastError: string | undefined;

    function syncStatus(): void {
      try {
        const config = readConfig(path);
        ctx.ui.setStatus("pi-permission-system", config.yoloMode === true ? "yolo" : undefined);
        lastError = undefined;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message !== lastError) {
          ctx.ui.notify(`Cannot read permission-system config; waiting for a valid file: ${message}`, "warning");
          lastError = message;
        }
      }
    }

    syncStatus();
    // Only sync the indicator. The permission system refreshes config before
    // the next agent turn; no reload or injected user message is needed.
    // Reading the path also handles atomic saves and temporarily invalid JSON.
    timer = setInterval(syncStatus, 500);
    timer.unref();
  });

  pi.on("session_shutdown", stopWatching);

  pi.registerShortcut("ctrl+/", {
    description: "Toggle pi-permission-system YOLO mode",
    handler: (ctx) => {
      toggleYolo(ctx);
    },
  });

  pi.registerCommand("toggle-yolo", {
    description: "Toggle pi-permission-system YOLO mode",
    handler: async (_args, ctx) => {
      toggleYolo(ctx);
    },
  });
}
