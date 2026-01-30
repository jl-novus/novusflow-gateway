/**
 * Memory Bridge Runtime
 * Stores reference to the plugin runtime for service access.
 */

// PluginRuntime interface (simplified from plugin-sdk)
interface PluginRuntime {
  // Runtime provides access to native dependencies and other services
  [key: string]: unknown;
}

let runtime: PluginRuntime | null = null;

export function setMemoryBridgeRuntime(r: PluginRuntime): void {
  runtime = r;
}

export function getMemoryBridgeRuntime(): PluginRuntime | null {
  return runtime;
}
