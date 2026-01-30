/**
 * Memory Bridge Plugin Configuration Schema
 */

// Plugin config schema interface (matches plugin-sdk types)
interface PluginConfigSchema {
  safeParse?: (value: unknown) => {
    success: boolean;
    data?: unknown;
    error?: {
      issues?: Array<{ path: Array<string | number>; message: string }>;
    };
  };
  parse?: (value: unknown) => unknown;
  validate?: (value: unknown) => { ok: boolean; value?: unknown; errors?: string[] };
  uiHints?: Record<string, {
    label?: string;
    help?: string;
    advanced?: boolean;
    sensitive?: boolean;
    placeholder?: string;
  }>;
  jsonSchema?: Record<string, unknown>;
}

type Issue = { path: Array<string | number>; message: string };

type SafeParseResult =
  | { success: true; data?: unknown }
  | { success: false; error: { issues: Issue[] } };

function error(message: string, path: Array<string | number> = []): SafeParseResult {
  return { success: false, error: { issues: [{ path, message }] } };
}

export function memoryBridgeConfigSchema(): PluginConfigSchema {
  return {
    safeParse(value: unknown): SafeParseResult {
      if (value === undefined) return { success: true, data: {} };
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return error("expected config object");
      }

      const cfg = value as Record<string, unknown>;

      // Validate host (optional string)
      if (cfg.host !== undefined && typeof cfg.host !== "string") {
        return error("host must be a string", ["host"]);
      }

      // Validate port (optional number)
      if (cfg.port !== undefined) {
        if (typeof cfg.port !== "number" || !Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) {
          return error("port must be a valid port number (1-65535)", ["port"]);
        }
      }

      // Validate database (optional string)
      if (cfg.database !== undefined && typeof cfg.database !== "string") {
        return error("database must be a string", ["database"]);
      }

      // Validate user (optional string)
      if (cfg.user !== undefined && typeof cfg.user !== "string") {
        return error("user must be a string", ["user"]);
      }

      // Validate password (optional string)
      if (cfg.password !== undefined && typeof cfg.password !== "string") {
        return error("password must be a string", ["password"]);
      }

      // Validate ssl (optional boolean)
      if (cfg.ssl !== undefined && typeof cfg.ssl !== "boolean") {
        return error("ssl must be a boolean", ["ssl"]);
      }

      // Validate autoContextInjection (optional boolean)
      if (cfg.autoContextInjection !== undefined && typeof cfg.autoContextInjection !== "boolean") {
        return error("autoContextInjection must be a boolean", ["autoContextInjection"]);
      }

      // Validate defaultNamespace (optional string)
      if (cfg.defaultNamespace !== undefined && typeof cfg.defaultNamespace !== "string") {
        return error("defaultNamespace must be a string", ["defaultNamespace"]);
      }

      return { success: true, data: value };
    },

    jsonSchema: {
      type: "object",
      properties: {
        host: {
          type: "string",
          description: "PostgreSQL host",
          default: "vm-claude-flow-prod",
        },
        port: {
          type: "number",
          description: "PostgreSQL port",
          default: 5432,
        },
        database: {
          type: "string",
          description: "Database name",
          default: "claude_flow_msp",
        },
        user: {
          type: "string",
          description: "Database user (uses CLAUDE_FLOW_PG_USER env if not set)",
        },
        password: {
          type: "string",
          description: "Database password (uses CLAUDE_FLOW_PG_PASSWORD env if not set)",
        },
        ssl: {
          type: "boolean",
          description: "Enable SSL connection",
          default: false,
        },
        autoContextInjection: {
          type: "boolean",
          description: "Automatically inject relevant memories into prompts",
          default: true,
        },
        defaultNamespace: {
          type: "string",
          description: "Default namespace for memory operations",
          default: "internal",
        },
      },
      additionalProperties: false,
    },

    uiHints: {
      host: {
        label: "PostgreSQL Host",
        help: "Hostname or IP of the PostgreSQL server",
      },
      port: {
        label: "Port",
        help: "PostgreSQL port (default: 5432)",
      },
      database: {
        label: "Database",
        help: "Database name (default: claude_flow_msp)",
      },
      user: {
        label: "Username",
        help: "Database user (or set CLAUDE_FLOW_PG_USER env)",
        advanced: true,
      },
      password: {
        label: "Password",
        help: "Database password (or set CLAUDE_FLOW_PG_PASSWORD env)",
        sensitive: true,
        advanced: true,
      },
      ssl: {
        label: "Use SSL",
        help: "Enable SSL/TLS for database connection",
        advanced: true,
      },
      autoContextInjection: {
        label: "Auto Context Injection",
        help: "Automatically inject relevant memories into agent prompts",
      },
      defaultNamespace: {
        label: "Default Namespace",
        help: "Default schema namespace for memory operations",
        advanced: true,
      },
    },
  };
}
