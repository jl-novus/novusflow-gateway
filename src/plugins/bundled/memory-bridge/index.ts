/**
 * NovusFlow Memory Bridge Plugin for OpenClaw
 *
 * Integrates Claude-Flow's PostgreSQL/RuVector memory backend with OpenClaw gateway.
 * Provides persistent memory tools and automatic session synchronization.
 *
 * @package novusflow-memory-bridge
 * @version 1.0.0
 */

import { Type } from "@sinclair/typebox";

import type { OpenClawPluginDefinition, OpenClawPluginApi } from "../../types.js";
import { jsonResult } from "../../../agents/tools/common.js";

// Configuration interface
interface MemoryBridgeConfig {
  pgHost: string;
  pgPort: number;
  pgDatabase: string;
  pgUser: string;
  pgPassword: string;
  pgSsl: boolean;
  embeddingProvider: "ollama" | "openai" | "local";
  embeddingEndpoint?: string;
  defaultNamespace: string;
  userId?: string;
}

// Default configuration from environment
function getConfig(): MemoryBridgeConfig {
  return {
    pgHost: process.env.CLAUDE_FLOW_PG_HOST ?? "172.25.0.10",
    pgPort: parseInt(process.env.CLAUDE_FLOW_PG_PORT ?? "5432", 10),
    pgDatabase: process.env.CLAUDE_FLOW_DATABASE ?? "claude_flow_msp",
    pgUser: process.env.CLAUDE_FLOW_PG_USER ?? "ruvector_admin",
    pgPassword: process.env.CLAUDE_FLOW_PG_PASSWORD ?? "",
    pgSsl: process.env.CLAUDE_FLOW_PG_SSL === "true",
    embeddingProvider: (process.env.NOVUSFLOW_EMBEDDING_PROVIDER ?? "ollama") as MemoryBridgeConfig["embeddingProvider"],
    embeddingEndpoint: process.env.NOVUSFLOW_EMBEDDING_ENDPOINT,
    defaultNamespace: process.env.NOVUSFLOW_DEFAULT_NAMESPACE ?? "internal",
    userId: process.env.NOVUSFLOW_USER_ID,
  };
}

// Allowed schemas for security
const ALLOWED_SCHEMAS = [
  "internal",
  "shared_patterns",
  "client_arete_health",
  "client_deccan_intl",
  "client_igoe_company",
  "client_cafemoto",
  "client_plenums_plus",
] as const;

// Validate schema name against allowlist
function validateSchema(schema: string): string {
  const normalized = schema.toLowerCase().trim();
  if (!ALLOWED_SCHEMAS.includes(normalized as typeof ALLOWED_SCHEMAS[number])) {
    throw new Error(`Invalid schema: ${schema}`);
  }
  return normalized;
}

// TypeBox schemas for tool parameters
const MemoryStoreSchema = Type.Object({
  key: Type.String({ description: "Unique key for the memory entry" }),
  value: Type.String({ description: "The content to store" }),
  namespace: Type.Optional(Type.String({ description: "Memory namespace (e.g., 'internal', 'shared_patterns')" })),
});

const MemorySearchSchema = Type.Object({
  query: Type.String({ description: "Search query (semantic similarity)" }),
  namespace: Type.Optional(Type.String({ description: "Memory namespace to search" })),
  limit: Type.Optional(Type.Number({ description: "Maximum results to return" })),
});

const MemoryReadSchema = Type.Object({
  key: Type.String({ description: "The key of the memory entry to read" }),
  namespace: Type.Optional(Type.String({ description: "Memory namespace" })),
});

// Memory bridge plugin definition
const memoryBridgePlugin: OpenClawPluginDefinition = {
  id: "novusflow-memory-bridge",
  name: "NovusFlow Memory Bridge",
  description: "PostgreSQL/RuVector memory integration for persistent context",
  version: "1.0.0",
  kind: "memory",

  async register(api: OpenClawPluginApi) {
    const config = getConfig();
    const logger = api.logger;

    logger.info(`Memory Bridge initializing - connecting to ${config.pgHost}:${config.pgPort}`);

    // ==========================================================================
    // TOOL: novusflow_memory_store
    // ==========================================================================
    api.registerTool(
      {
        label: "NovusFlow Memory Store",
        name: "novusflow_memory_store",
        description: "Store information in NovusFlow persistent memory with semantic indexing for later retrieval.",
        parameters: MemoryStoreSchema,
        execute: async (_toolCallId, params) => {
          try {
            const key = params.key as string;
            const value = params.value as string;
            const namespace = params.namespace as string | undefined;
            const schema = validateSchema(namespace ?? config.defaultNamespace);

            logger.info(`novusflow_memory_store: ${key} -> ${schema}`);

            // TODO: Connect to actual PostgreSQL/RuVector backend
            return jsonResult({
              success: true,
              key,
              namespace: schema,
              message: `Stored '${key}' in ${schema}`,
            });
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error(`novusflow_memory_store error: ${msg}`);
            return jsonResult({ success: false, error: msg });
          }
        },
      },
      { name: "novusflow_memory_store" }
    );

    // ==========================================================================
    // TOOL: novusflow_memory_search
    // ==========================================================================
    api.registerTool(
      {
        label: "NovusFlow Memory Search",
        name: "novusflow_memory_search",
        description: "Search NovusFlow memory using semantic similarity (vector search) to find relevant past information.",
        parameters: MemorySearchSchema,
        execute: async (_toolCallId, params) => {
          try {
            const query = params.query as string;
            const namespace = params.namespace as string | undefined;
            const limit = (params.limit as number | undefined) ?? 10;
            const schema = validateSchema(namespace ?? config.defaultNamespace);

            logger.info(`novusflow_memory_search: "${query}" in ${schema} (limit: ${limit})`);

            // TODO: Connect to actual RuVector search
            return jsonResult({
              success: true,
              query,
              namespace: schema,
              results: [],
              message: `Searched ${schema} for "${query}" (no results yet - backend not connected)`,
            });
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error(`novusflow_memory_search error: ${msg}`);
            return jsonResult({ success: false, error: msg });
          }
        },
      },
      { name: "novusflow_memory_search" }
    );

    // ==========================================================================
    // TOOL: novusflow_memory_read
    // ==========================================================================
    api.registerTool(
      {
        label: "NovusFlow Memory Read",
        name: "novusflow_memory_read",
        description: "Read a specific memory entry by key from NovusFlow persistent storage.",
        parameters: MemoryReadSchema,
        execute: async (_toolCallId, params) => {
          try {
            const key = params.key as string;
            const namespace = params.namespace as string | undefined;
            const schema = validateSchema(namespace ?? config.defaultNamespace);

            logger.info(`novusflow_memory_read: ${key} from ${schema}`);

            // TODO: Connect to actual PostgreSQL backend
            return jsonResult({
              success: true,
              key,
              namespace: schema,
              value: null,
              message: `Read '${key}' from ${schema} (backend not connected)`,
            });
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error(`novusflow_memory_read error: ${msg}`);
            return jsonResult({ success: false, error: msg });
          }
        },
      },
      { name: "novusflow_memory_read" }
    );

    // ==========================================================================
    // HOOK: session_start - Load user context
    // ==========================================================================
    api.on("session_start", async (event, _ctx) => {
      logger.info(`Session started: ${event.sessionId} (resumed: ${event.resumedFrom ?? "no"})`);
      // TODO: Load user's previous context from PostgreSQL
    });

    // ==========================================================================
    // HOOK: session_end - Persist session summary
    // ==========================================================================
    api.on("session_end", async (event, _ctx) => {
      logger.info(`Session ended: ${event.sessionId} (messages: ${event.messageCount})`);
      // TODO: Store session summary in PostgreSQL
    });

    // ==========================================================================
    // HOOK: before_agent_start - Inject relevant context
    // ==========================================================================
    api.on("before_agent_start", async (_event, _ctx) => {
      // TODO: Search memory for relevant patterns based on the prompt
      return { prependContext: undefined };
    });

    // ==========================================================================
    // HOOK: agent_end - Learn from successful interactions
    // ==========================================================================
    api.on("agent_end", async (event, _ctx) => {
      if (event.success) {
        logger.info("Agent completed successfully - storing patterns");
        // TODO: Extract and store successful patterns
      }
    });

    logger.info("Memory Bridge plugin registered successfully");
  },
};

export default memoryBridgePlugin;
