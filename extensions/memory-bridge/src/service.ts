/**
 * Memory Bridge Service
 * Background service managing PostgreSQL connection lifecycle.
 */

import type { MemoryBridgePluginConfig } from "../index.js";

// Logger type (matches plugin-sdk PluginLogger)
type PluginLogger = {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

// Service context type
type ServiceContext = {
  config?: Record<string, unknown>;
  workspaceDir?: string;
  stateDir: string;
  logger: PluginLogger;
};

// Service interface
interface PluginService {
  id: string;
  start: (ctx: ServiceContext) => void | Promise<void>;
  stop?: (ctx: ServiceContext) => void | Promise<void>;
}

// Re-export types from memory-bridge package
export interface SearchResult {
  key: string;
  content: string;
  score: number;
  namespace?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryStats {
  totalEntries: number;
  byNamespace: Record<string, number>;
  oldestEntry?: Date;
  newestEntry?: Date;
}

export interface SearchOptions {
  limit?: number;
  namespace?: string;
  threshold?: number;
  includeMetadata?: boolean;
}

export interface ListOptions {
  namespace?: string;
  limit?: number;
  offset?: number;
}

export interface WriteMetadata {
  namespace?: string;
  tags?: string[];
}

// Memory plugin interface matching @novusflow/memory-bridge
export interface MemoryPlugin {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  read(key: string): Promise<string | null>;
  write(key: string, content: string, metadata?: WriteMetadata): Promise<void>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  list(options?: ListOptions): Promise<string[]>;
  delete(key: string): Promise<boolean>;
  stats(): Promise<MemoryStats>;
}

// Module-level state
let memoryBridge: MemoryPlugin | null = null;
let isConnected = false;
let lastError: string | null = null;
let cachedStats: MemoryStats | null = null;

/**
 * Get the active memory bridge instance
 */
export function getMemoryBridge(): MemoryPlugin | null {
  return memoryBridge;
}

/**
 * Get current connection status
 */
export function getMemoryBridgeStatus(): {
  connected: boolean;
  stats: MemoryStats | null;
  error: string | null;
} {
  return {
    connected: isConnected,
    stats: cachedStats,
    error: lastError,
  };
}

/**
 * Memory Bridge Service implementation
 */
export class MemoryBridgeService implements PluginService {
  readonly id = "memory-bridge-service";
  private config: MemoryBridgePluginConfig;
  private logger: PluginLogger;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: MemoryBridgePluginConfig, logger: PluginLogger) {
    this.config = config;
    this.logger = logger;
  }

  async start(_ctx: ServiceContext): Promise<void> {
    this.logger.info("Starting Memory Bridge service...");

    try {
      // Dynamic import of the memory-bridge package
      const memoryBridgeModule = await this.importMemoryBridge();

      if (!memoryBridgeModule) {
        throw new Error("Failed to load @novusflow/memory-bridge module");
      }

      const { createMemoryBridge } = memoryBridgeModule;

      // Build configuration from plugin config and environment
      const bridgeConfig = {
        postgresHost: this.config.host || process.env.CLAUDE_FLOW_PG_HOST || "vm-claude-flow-prod",
        postgresPort: this.config.port || parseInt(process.env.CLAUDE_FLOW_PG_PORT || "5432"),
        database: this.config.database || process.env.CLAUDE_FLOW_DATABASE || "claude_flow_msp",
        userId: process.env.CLAUDE_FLOW_USER || process.env.USER || "unknown",
      };

      this.logger.info(`Connecting to PostgreSQL at ${bridgeConfig.postgresHost}:${bridgeConfig.postgresPort}/${bridgeConfig.database}`);

      // Create and connect
      memoryBridge = await createMemoryBridge(bridgeConfig);
      isConnected = true;
      lastError = null;

      // Fetch initial stats
      try {
        cachedStats = await memoryBridge.stats();
        this.logger.info(`Memory Bridge connected. Total entries: ${cachedStats.totalEntries}`);
      } catch (statsErr) {
        this.logger.warn(`Failed to fetch initial stats: ${String(statsErr)}`);
      }

      // Set up periodic stats refresh (every 5 minutes)
      this.refreshInterval = setInterval(async () => {
        if (memoryBridge && isConnected) {
          try {
            cachedStats = await memoryBridge.stats();
          } catch {
            // Ignore stats refresh errors
          }
        }
      }, 5 * 60 * 1000);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = message;
      isConnected = false;
      this.logger.error(`Failed to start Memory Bridge: ${message}`);

      // Don't throw - allow the plugin to register but with degraded functionality
      // Tools will return appropriate errors when called
    }
  }

  async stop(_ctx: ServiceContext): Promise<void> {
    this.logger.info("Stopping Memory Bridge service...");

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    if (memoryBridge && isConnected) {
      try {
        await memoryBridge.disconnect();
        this.logger.info("Memory Bridge disconnected");
      } catch (err) {
        this.logger.warn(`Error during disconnect: ${String(err)}`);
      }
    }

    memoryBridge = null;
    isConnected = false;
    cachedStats = null;
    lastError = null;
  }

  /**
   * Dynamic import of memory-bridge with fallback
   */
  private async importMemoryBridge(): Promise<{ createMemoryBridge: (config: any) => Promise<MemoryPlugin> } | null> {
    // Try multiple import paths
    const importPaths = [
      "@novusflow/memory-bridge",
      "../../../plugins/memory-bridge/dist/index.js",
      "../../../../plugins/memory-bridge/dist/index.js",
    ];

    for (const importPath of importPaths) {
      try {
        const module = await import(importPath);
        if (module.createMemoryBridge) {
          this.logger.info(`Loaded memory-bridge from: ${importPath}`);
          return module;
        }
      } catch {
        // Continue to next path
      }
    }

    // If no direct import works, try to use the PostgresMemoryPlugin directly
    try {
      const { PostgresMemoryPlugin } = await import("../../../plugins/memory-bridge/dist/index.js");
      return {
        createMemoryBridge: async (config: any) => {
          const plugin = new PostgresMemoryPlugin({
            database: {
              host: config.postgresHost,
              port: config.postgresPort,
              database: config.database,
              user: process.env.CLAUDE_FLOW_PG_USER || "ruvector_admin",
              ssl: false,
              pool: { min: 2, max: 10, idleTimeout: 30000 },
            },
          });
          if (config.userId) {
            process.env.CLAUDE_FLOW_USER = config.userId;
          }
          await plugin.connect();
          return plugin;
        },
      };
    } catch (e) {
      this.logger.error(`Failed to import memory-bridge: ${String(e)}`);
      return null;
    }
  }
}
