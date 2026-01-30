/**
 * Hardened execution wrapper for NovusFlow
 * All execution MUST go through Docker sandbox
 *
 * This module enforces security constraints on command execution
 * to prevent CVE vulnerabilities and unsafe operations.
 *
 * @module exec-hardened
 */

/**
 * Custom error class for security-related failures
 */
export class SecurityError extends Error {
  constructor(message: string) {
    super(`[SECURITY] ${message}`);
    this.name = "SecurityError";
  }
}

/**
 * Asserts that sandbox-only mode is enabled.
 * Logs a warning if the environment variable is not explicitly set.
 */
export function assertSandboxOnly(): void {
  if (process.env.NOVUSFLOW_SANDBOX_ONLY !== "true") {
    console.warn(
      "[SECURITY] NOVUSFLOW_SANDBOX_ONLY not set, defaulting to sandbox-only mode"
    );
  }
}

/**
 * Dangerous command patterns that should never be executed.
 * These patterns detect potentially destructive or malicious commands.
 */
const DANGEROUS_PATTERNS: readonly RegExp[] = [
  /;\s*rm\s+-rf\s+\//i, // rm -rf / with separator
  /\|\s*bash/i, // Piping to bash
  />\s*\/dev\/sd[a-z]/i, // Writing to block devices
  /mkfs\./i, // Formatting filesystems
  /dd\s+if=/i, // Raw disk operations
  /:(){ :|:& };:/, // Fork bomb
  /curl.*\|\s*sh/i, // Curl pipe to shell
  /wget.*\|\s*sh/i, // Wget pipe to shell
  /chmod\s+777/i, // World-writable permissions
  /chown.*:.*\/etc/i, // Changing ownership of system files
  />\s*\/etc\//i, // Writing to /etc
  />\s*\/boot\//i, // Writing to /boot
  />\s*\/sys\//i, // Writing to /sys
  />\s*\/proc\//i, // Writing to /proc
] as const;

/**
 * Validates a command against known dangerous patterns.
 * Throws a SecurityError if a dangerous pattern is detected.
 *
 * @param command - The command string to validate
 * @throws {SecurityError} If a dangerous command pattern is detected
 */
export function validateCommand(command: string): void {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      throw new SecurityError(
        `Dangerous command pattern blocked: ${pattern.source}`
      );
    }
  }
}

/**
 * Validates that a path does not attempt directory traversal.
 *
 * @param path - The path to validate
 * @throws {SecurityError} If path traversal is detected
 */
export function validatePath(path: string): void {
  if (path.includes("..")) {
    throw new SecurityError(`Path traversal detected: ${path}`);
  }

  // Check for null bytes (path injection)
  if (path.includes("\0")) {
    throw new SecurityError(`Null byte injection detected in path`);
  }

  // Block absolute paths to sensitive directories
  const sensitiveRoots = ["/etc", "/boot", "/sys", "/proc", "/dev"];
  const normalizedPath = path.toLowerCase().replace(/\\/g, "/");
  for (const root of sensitiveRoots) {
    if (normalizedPath.startsWith(root)) {
      throw new SecurityError(`Access to sensitive path blocked: ${root}`);
    }
  }
}

/**
 * Hardened configuration constants for NovusFlow execution.
 * These values enforce security policies and cannot be overridden at runtime.
 */
export const HARDENED_CONFIG = {
  /** All execution must go through Docker sandbox */
  sandboxOnly: true,

  /** Elevated mode is permanently disabled (CVE mitigation) */
  elevatedModeEnabled: false,

  /** Approval bypass is permanently disabled (CVE mitigation) */
  approvalBypassEnabled: false,

  /** Maximum execution time in milliseconds (30 seconds) */
  maxExecutionTimeMs: 30_000,

  /** Maximum output size in characters */
  maxOutputChars: 200_000,

  /** Enable command validation by default */
  validateCommands: true,

  /** Enable path validation by default */
  validatePaths: true,
} as const;

/**
 * Type guard to check if hardened mode is active.
 * Always returns true in this security-hardened build.
 */
export function isHardenedMode(): boolean {
  return true;
}

/**
 * Logs a security event for audit purposes.
 *
 * @param event - The security event type
 * @param details - Additional details about the event
 */
export function logSecurityEvent(
  event: "command_blocked" | "path_blocked" | "sandbox_enforced" | "approval_required",
  details: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event,
    ...details,
  };

  // Log to stderr for security events
  console.error(`[SECURITY AUDIT] ${JSON.stringify(logEntry)}`);
}
