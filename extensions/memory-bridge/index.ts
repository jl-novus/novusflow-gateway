/**
 * NovusFlow Memory Bridge Plugin for OpenClaw
 * Connects to Claude-Flow PostgreSQL/RuVector backend for enterprise memory persistence.
 *
 * This plugin replaces Moltbot's default file-based memory with
 * Claude-Flow's PostgreSQL/RuVector vector search backend.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { memoryBridgeConfigSchema } from "./src/config.js";
import { createMemoryBridgeTools } from "./src/tools.js";
import { MemoryBridgeService } from "./src/service.js";
import { setMemoryBridgeRuntime } from "./src/runtime.js";

const plugin = {
  id: "memory-bridge",
  name: "NovusFlow Memory Bridge",
  description: "PostgreSQL/RuVector memory backend for enterprise persistence",
  version: "1.0.0",
  kind: "memory" as const,

  configSchema: memoryBridgeConfigSchema(),

  register(api: OpenClawPluginApi) {
    const config = (api.pluginConfig ?? {}) as MemoryBridgePluginConfig;

    // Set runtime for service access
    setMemoryBridgeRuntime(api.runtime);

    // Register memory tools
    const tools = createMemoryBridgeTools(config);
    for (const tool of tools) {
      api.registerTool(tool);
    }

    // Register background service for connection management
    api.registerService(new MemoryBridgeService(config, api.logger));

    // Register CLI commands
    api.registerCli((ctx) => {
      ctx.program
        .command("memory-bridge")
        .description("NovusFlow Memory Bridge commands")
        .command("status")
        .description("Show memory bridge connection status")
        .action(async () => {
          const { getMemoryBridgeStatus } = await import("./src/service.js");
          const status = getMemoryBridgeStatus();
          console.log(`Connected: ${status.connected}`);
          if (status.connected && status.stats) {
            console.log(`Total entries: ${status.stats.totalEntries}`);
            console.log("By namespace:", JSON.stringify(status.stats.byNamespace, null, 2));
          }
          if (status.error) {
            console.log(`Error: ${status.error}`);
          }
        });
    });

    // Register gateway health check
    api.registerGatewayMethod("memory-bridge/health", async () => {
      const { getMemoryBridgeStatus } = await import("./src/service.js");
      const status = getMemoryBridgeStatus();
      return {
        status: status.connected ? "healthy" : "disconnected",
        plugin: "memory-bridge",
        stats: status.stats,
        error: status.error,
      };
    });

    // Register session lifecycle hooks
    api.on("session_start", async (event, ctx) => {
      const { getMemoryBridge } = await import("./src/service.js");
      const bridge = getMemoryBridge();
      if (!bridge) return;

      try {
        await bridge.write(
          `session:${event.sessionId}:start`,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            agentId: ctx.agentId,
            resumedFrom: event.resumedFrom,
          }),
          { namespace: "sessions" }
        );
      } catch (err) {
        api.logger.warn(`Failed to log session start: ${String(err)}`);
      }
    });

    api.on("session_end", async (event, ctx) => {
      const { getMemoryBridge } = await import("./src/service.js");
      const bridge = getMemoryBridge();
      if (!bridge) return;

      try {
        await bridge.write(
          `session:${event.sessionId}:end`,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            agentId: ctx.agentId,
            messageCount: event.messageCount,
            durationMs: event.durationMs,
          }),
          { namespace: "sessions" }
        );
      } catch (err) {
        api.logger.warn(`Failed to log session end: ${String(err)}`);
      }
    });

    // Auto-inject relevant context before agent starts
    api.on("before_agent_start", async (event) => {
      if (!config.autoContextInjection) return {};

      const { getMemoryBridge } = await import("./src/service.js");
      const bridge = getMemoryBridge();
      if (!bridge) return {};

      try {
        // Search for relevant memories based on prompt
        const querySlice = event.prompt.slice(0, 500);
        const results = await bridge.search(querySlice, { limit: 3 });

        if (results.length > 0) {
          const contextBlock = results
            .map((r) => `[Memory: ${r.key}] ${r.content}`)
            .join("\n\n");
          return {
            prependContext: `## Relevant Context from Memory\n\n${contextBlock}\n\n---\n\n`,
          };
        }
      } catch (err) {
        api.logger.warn(`Failed to inject memory context: ${String(err)}`);
      }

      return {};
    });

    api.logger.info("NovusFlow Memory Bridge plugin registered");
  },
};

export interface MemoryBridgePluginConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  autoContextInjection?: boolean;
  defaultNamespace?: string;
}

export default plugin;
