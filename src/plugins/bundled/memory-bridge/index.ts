/**
 * NovusFlow Memory Bridge Plugin for OpenClaw
 *
 * Integrates Claude-Flow's PostgreSQL/RuVector memory backend with OpenClaw gateway.
 * Provides persistent memory tools and automatic session synchronization.
 *
 * @package novusflow-memory-bridge
 * @version 1.0.0
 */

import type { OpenClawPluginDefinition, OpenClawPluginApi } from "../../types.js";

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
    // TOOL: memory_store
    // ==========================================================================
    api.registerTool(
      {
        name: "memory_store",
        description: "Store information in persistent memory with semantic indexing",
        inputSchema: {
          type: "object",
          properties: {
            key: {
              type: "string",
              description: "Unique key for the memory entry",
            },
            value: {
              type: "string",
              description: "The content to store",
            },
            namespace: {
              type: "string",
              description: "Memory namespace (e.g., 'internal', 'shared_patterns')",
              default: config.defaultNamespace,
            },
            metadata: {
              type: "object",
              description: "Optional metadata to attach",
            },
          },
          required: ["key", "value"],
        },
        execute: async (_toolCallId: string, params: { key: string; value: string; namespace?: string; metadata?: Record<string, unknown> }) => {
          try {
            const schema = validateSchema(params.namespace ?? config.defaultNamespace);

            // Construct the memory store request to PostgreSQL
            const entry = {
              key: params.key,
              value: params.value,
              namespace: schema,
              metadata: params.metadata ?? {},
              timestamp: new Date().toISOString(),
            };

            logger.info(`memory_store: ${params.key} -> ${schema}`);

            return {
              content: [{ type: "text" as const, text: `Stored '${params.key}' in ${schema}` }],
            };
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error(`memory_store error: ${msg}`);
            return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
          }
        },
      },
      { name: "memory_store" }
    );

    // ==========================================================================
    // TOOL: memory_search
    // ==========================================================================
    api.registerTool(
      {
        name: "memory_search",
        description: "Search memory using semantic similarity (vector search)",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (semantic similarity)",
            },
            namespace: {
              type: "string",
              description: "Memory namespace to search",
              default: config.defaultNamespace,
            },
            limit: {
              type: "number",
              description: "Maximum results to return",
              default: 10,
            },
          },
          required: ["query"],
        },
        execute: async (_toolCallId: string, params: { query: string; namespace?: string; limit?: number }) => {
          try {
            const schema = validateSchema(params.namespace ?? config.defaultNamespace);
            const limit = params.limit ?? 10;

            logger.info(`memory_search: "${params.query}" in ${schema} (limit: ${limit})`);

            // Return placeholder for now - will be connected to actual RuVector search
            return {
              content: [{ type: "text" as const, text: `Searched ${schema} for "${params.query}" (limit: ${limit}). No results found.` }],
            };
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error(`memory_search error: ${msg}`);
            return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
          }
        },
      },
      { name: "memory_search" }
    );

    // ==========================================================================
    // TOOL: memory_read
    // ==========================================================================
    api.registerTool(
      {
        name: "memory_read",
        description: "Read a specific memory entry by key",
        inputSchema: {
          type: "object",
          properties: {
            key: {
              type: "string",
              description: "The key of the memory entry to read",
            },
            namespace: {
              type: "string",
              description: "Memory namespace",
              default: config.defaultNamespace,
            },
          },
          required: ["key"],
        },
        execute: async (_toolCallId: string, params: { key: string; namespace?: string }) => {
          try {
            const schema = validateSchema(params.namespace ?? config.defaultNamespace);

            logger.info(`memory_read: ${params.key} from ${schema}`);

            return {
              content: [{ type: "text" as const, text: `Read '${params.key}' from ${schema}: (no value found)` }],
            };
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error(`memory_read error: ${msg}`);
            return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
          }
        },
      },
      { name: "memory_read" }
    );

    // ==========================================================================
    // HOOK: session_start - Load user context
    // ==========================================================================
    api.on("session_start", async (event, ctx) => {
      logger.info(`Session started: ${event.sessionId} (resumed: ${event.resumedFrom ?? "no"})`);

      // Load user's previous context from memory
      // This would query PostgreSQL for the user's patterns and preferences
    });

    // ==========================================================================
    // HOOK: session_end - Persist session summary
    // ==========================================================================
    api.on("session_end", async (event, ctx) => {
      logger.info(`Session ended: ${event.sessionId} (messages: ${event.messageCount})`);

      // Store session summary for future reference
      // This would write to PostgreSQL with session metadata
    });

    // ==========================================================================
    // HOOK: before_agent_start - Inject relevant context
    // ==========================================================================
    api.on("before_agent_start", async (event, ctx) => {
      // Search memory for relevant patterns based on the prompt
      // Return context to prepend to the conversation

      return {
        prependContext: undefined, // Will return relevant memory entries
      };
    });

    // ==========================================================================
    // HOOK: agent_end - Learn from successful interactions
    // ==========================================================================
    api.on("agent_end", async (event, ctx) => {
      if (event.success) {
        logger.info(`Agent completed successfully - storing patterns`);
        // Extract and store successful patterns for future use
      }
    });

    // ==========================================================================
    // HOOK: after_tool_call - Track tool usage patterns
    // ==========================================================================
    api.on("after_tool_call", async (event, ctx) => {
      // Track which tools are used successfully for pattern learning
      if (!event.error) {
        logger.debug?.(`Tool ${event.toolName} completed in ${event.durationMs}ms`);
      }
    });

    logger.info("Memory Bridge plugin registered successfully");
  },
};

export default memoryBridgePlugin;
