import type {
  ExtensionAPI,
  ExtensionHandler,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import bigpowers from "../npm/node_modules/bigpowers/extensions/omp-hooks.ts";

// Disable the package's original extension in settings to avoid duplicate hooks.
// Only these message-policy blocks are removed; every other result passes through.
const commitMessageRules = new Set([
  "BLOCKED: Commit message must follow Conventional Commits: <type>(<scope>): <subject>.",
  "BLOCKED: Commit subject line must be ≤72 characters.",
]);

export default function (pi: ExtensionAPI) {
  const api = Object.create(pi) as ExtensionAPI;
  api.on = ((
    name: string,
    handler: ExtensionHandler<ToolCallEvent, ToolCallEventResult>,
  ) => {
    if (name !== "tool_call") {
      return Reflect.apply(pi.on, pi, [name, handler]);
    }

    return pi.on("tool_call", async (event, ctx) => {
      const result = await handler(event, ctx);
      if (result?.block && commitMessageRules.has(result.reason ?? "")) {
        return undefined;
      }
      return result;
    });
  }) as ExtensionAPI["on"];

  bigpowers(api);
}
