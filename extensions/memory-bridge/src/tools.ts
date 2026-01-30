/**
 * Memory Bridge Tools
 * Agent tools for interacting with the PostgreSQL/RuVector memory backend.
 */

import { Type, type TObject, type TProperties } from "@sinclair/typebox";

import type { MemoryBridgePluginConfig } from "../index.js";
import { getMemoryBridge } from "./service.js";

// Tool type definition (matches pi-agent-core AgentTool)
type AgentToolResult = {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  details?: unknown;
};

type AgentTool<TParams extends TObject<TProperties>, TResult = unknown> = {
  label?: string;
  name: string;
  description: string;
  parameters: TParams;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<AgentToolResult>;
};

// biome-ignore lint/suspicious/noExplicitAny: TypeBox schema type flexibility
type AnyAgentTool = AgentTool<any, unknown>;

// Helper functions
function jsonResult(payload: unknown): AgentToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    details: payload,
  };
}

function readStringParam(
  params: Record<string, unknown>,
  key: string,
  options: { required?: boolean; trim?: boolean } = {},
): string | undefined {
  const { required = false, trim = true } = options;
  const raw = params[key];
  if (typeof raw !== "string") {
    if (required) throw new Error(`${key} required`);
    return undefined;
  }
  const value = trim ? raw.trim() : raw;
  if (!value) {
    if (required) throw new Error(`${key} required`);
    return undefined;
  }
  return value;
}

function readNumberParam(
  params: Record<string, unknown>,
  key: string,
  options: { required?: boolean } = {},
): number | undefined {
  const { required = false } = options;
  const raw = params[key];
  let value: number | undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    value = raw;
  } else if (typeof raw === "string") {
    const parsed = Number.parseFloat(raw.trim());
    if (Number.isFinite(parsed)) value = parsed;
  }
  if (value === undefined && required) {
    throw new Error(`${key} required`);
  }
  return value;
}

function readStringArrayParam(
  params: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const raw = params[key];
  if (Array.isArray(raw)) {
    return raw
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    const value = raw.trim();
    return value ? [value] : undefined;
  }
  return undefined;
}

// Schema definitions
const MemoryStoreSchema = Type.Object({
  key: Type.String({ description: "Unique key for the memory entry" }),
  content: Type.String({ description: "Content to store" }),
  namespace: Type.Optional(Type.String({ description: "Optional namespace (schema)" })),
  tags: Type.Optional(Type.Array(Type.String(), { description: "Optional tags for categorization" })),
});

const MemorySearchSchema = Type.Object({
  query: Type.String({ description: "Semantic search query" }),
  limit: Type.Optional(Type.Number({ description: "Maximum number of results (default: 5)" })),
  namespace: Type.Optional(Type.String({ description: "Optional namespace to search in" })),
  threshold: Type.Optional(Type.Number({ description: "Minimum similarity threshold (0-1)" })),
  includeMetadata: Type.Optional(Type.Boolean({ description: "Include full metadata in results" })),
});

const MemoryReadSchema = Type.Object({
  key: Type.String({ description: "Memory key to read" }),
  namespace: Type.Optional(Type.String({ description: "Optional namespace" })),
});

const MemoryDeleteSchema = Type.Object({
  key: Type.String({ description: "Memory key to delete" }),
  namespace: Type.Optional(Type.String({ description: "Optional namespace" })),
});

const MemoryListSchema = Type.Object({
  namespace: Type.Optional(Type.String({ description: "Optional namespace to list" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of keys to return" })),
  offset: Type.Optional(Type.Number({ description: "Offset for pagination" })),
});

const MemoryStatsSchema = Type.Object({});

/**
 * Create memory bridge tools
 */
export function createMemoryBridgeTools(config: MemoryBridgePluginConfig): AnyAgentTool[] {
  return [
    createMemoryStoreTool(config),
    createMemorySearchTool(config),
    createMemoryReadTool(config),
    createMemoryDeleteTool(config),
    createMemoryListTool(config),
    createMemoryStatsTool(config),
  ];
}

function createMemoryStoreTool(_config: MemoryBridgePluginConfig): AnyAgentTool {
  return {
    label: "Memory Store",
    name: "memory_store",
    description:
      "Store information in persistent enterprise memory (PostgreSQL/RuVector). Use for saving important context, decisions, patterns, or knowledge that should persist across sessions.",
    parameters: MemoryStoreSchema,
    execute: async (_toolCallId, params) => {
      const bridge = getMemoryBridge();
      if (!bridge) {
        return jsonResult({ success: false, error: "Memory bridge not connected" });
      }

      const key = readStringParam(params, "key", { required: true });
      const content = readStringParam(params, "content", { required: true });
      const namespace = readStringParam(params, "namespace");
      const tags = readStringArrayParam(params, "tags");

      try {
        await bridge.write(key, content, {
          namespace,
          tags,
        });
        return jsonResult({ success: true, key, namespace: namespace ?? "default" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({ success: false, error: message });
      }
    },
  };
}

function createMemorySearchTool(_config: MemoryBridgePluginConfig): AnyAgentTool {
  return {
    label: "Memory Search (Enterprise)",
    name: "memory_search_enterprise",
    description:
      "Semantically search enterprise memory using vector similarity (RuVector). Returns relevant memories ranked by similarity score. Use before answering questions about prior work, decisions, patterns, or knowledge.",
    parameters: MemorySearchSchema,
    execute: async (_toolCallId, params) => {
      const bridge = getMemoryBridge();
      if (!bridge) {
        return jsonResult({ results: [], error: "Memory bridge not connected" });
      }

      const query = readStringParam(params, "query", { required: true });
      const limit = readNumberParam(params, "limit");
      const namespace = readStringParam(params, "namespace");
      const threshold = readNumberParam(params, "threshold");
      const includeMetadata = params.includeMetadata === true;

      try {
        const results = await bridge.search(query, {
          limit: limit ?? 5,
          namespace,
          threshold,
          includeMetadata,
        });
        return jsonResult({
          results: results.map((r) => ({
            key: r.key,
            content: r.content,
            score: r.score,
            namespace: r.namespace,
            ...(includeMetadata && r.metadata ? { metadata: r.metadata } : {}),
          })),
          count: results.length,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({ results: [], error: message });
      }
    },
  };
}

function createMemoryReadTool(_config: MemoryBridgePluginConfig): AnyAgentTool {
  return {
    label: "Memory Read",
    name: "memory_read",
    description: "Read a specific memory entry by key from enterprise storage.",
    parameters: MemoryReadSchema,
    execute: async (_toolCallId, params) => {
      const bridge = getMemoryBridge();
      if (!bridge) {
        return jsonResult({ error: "Memory bridge not connected" });
      }

      const key = readStringParam(params, "key", { required: true });

      try {
        const content = await bridge.read(key);
        if (content === null) {
          return jsonResult({ key, found: false, error: "Memory not found" });
        }
        return jsonResult({ key, found: true, content });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({ key, found: false, error: message });
      }
    },
  };
}

function createMemoryDeleteTool(_config: MemoryBridgePluginConfig): AnyAgentTool {
  return {
    label: "Memory Delete",
    name: "memory_delete",
    description: "Delete a memory entry by key from enterprise storage.",
    parameters: MemoryDeleteSchema,
    execute: async (_toolCallId, params) => {
      const bridge = getMemoryBridge();
      if (!bridge) {
        return jsonResult({ success: false, error: "Memory bridge not connected" });
      }

      const key = readStringParam(params, "key", { required: true });

      try {
        const deleted = await bridge.delete(key);
        return jsonResult({ success: deleted, key });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({ success: false, key, error: message });
      }
    },
  };
}

function createMemoryListTool(_config: MemoryBridgePluginConfig): AnyAgentTool {
  return {
    label: "Memory List",
    name: "memory_list",
    description: "List memory entry keys in a namespace.",
    parameters: MemoryListSchema,
    execute: async (_toolCallId, params) => {
      const bridge = getMemoryBridge();
      if (!bridge) {
        return jsonResult({ keys: [], error: "Memory bridge not connected" });
      }

      const namespace = readStringParam(params, "namespace");
      const limit = readNumberParam(params, "limit");
      const offset = readNumberParam(params, "offset");

      try {
        const keys = await bridge.list({
          namespace,
          limit: limit ?? 100,
          offset: offset ?? 0,
        });
        return jsonResult({ keys, count: keys.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({ keys: [], error: message });
      }
    },
  };
}

function createMemoryStatsTool(_config: MemoryBridgePluginConfig): AnyAgentTool {
  return {
    label: "Memory Stats",
    name: "memory_stats",
    description: "Get statistics about enterprise memory storage.",
    parameters: MemoryStatsSchema,
    execute: async () => {
      const bridge = getMemoryBridge();
      if (!bridge) {
        return jsonResult({ error: "Memory bridge not connected" });
      }

      try {
        const stats = await bridge.stats();
        return jsonResult(stats);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({ error: message });
      }
    },
  };
}
