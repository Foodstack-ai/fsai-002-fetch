/**
 * @fileoverview Environment variable access and startup validation.
 *
 * This module provides:
 * - Zod schema validation for required/optional env vars
 * - runtime `env` proxy for live `process.env` reads with defaults
 * - exported `VERSION` value resolved from the project version source
 *
 * @module config/env
 */

import { z } from 'zod';

// ============================================================================
// Schema
// ============================================================================

const EnvSchema = z.object({
  // Required
  OWNER_PHONE_NUMBER: z.string().min(1, 'OWNER_PHONE_NUMBER is required'),

  // Unified LLM Provider Configuration
  LLM_BASE_URL: z.string().default('http://host.docker.internal:11434/v1'),
  LLM_MODEL: z.string().default('glm-4.7-flash'),
  LLM_API_KEY: z.string().optional(), // Optional - no auth header when empty

  // Legacy OpenRouter (optional, falls back to LLM_* config)
  OPENROUTER_API_KEY: z.string().optional(),

  // Models (defaults now use LLM_MODEL as base)
  AGENT_MODEL: z.string().optional(),
  SUMMARY_MODEL: z.string().optional(),
  VISION_MODEL: z.string().optional(),
  WHISPER_MODEL: z.string().default('/app/models/ggml-tiny.bin'),

  // Paths
  WORKSPACE_ROOT: z.string().default('/workspace'),
  DATA_DIR: z.string().optional(),
  DATABASE_PATH: z.string().optional(),
  TASKS_DB_PATH: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('debug'),

  // Security
  ADMIN_TOKEN: z.string().optional(),
  TRUSTED_PHONE_NUMBERS: z.string().optional(),

  // Harness Feature Flags
  ENABLE_COPILOT: z.string().transform(val => val === 'true').optional().default(true),
  ENABLE_CLAUDE: z.string().transform(val => val === 'true').optional().default(false),
  ENABLE_GEMINI: z.string().transform(val => val === 'true').optional().default(false),
  ENABLE_OPENCODE: z.string().transform(val => val === 'true').optional().default(false),
  ENABLE_CODEX: z.string().transform(val => val === 'true').optional().default(false),

  // Web / Browser Feature Flags
  ENABLE_WEB_FETCH: z.string().transform(val => val === 'true').optional().default(true),
  ENABLE_WEB_SEARCH: z.string().transform(val => val === 'true').optional().default(true),
  ENABLE_BROWSER: z.string().transform(val => val === 'true').optional().default(false),

  // Agent Models (Optional overrides)
  COPILOT_MODEL: z.string().optional(),
  CLAUDE_MODEL: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  OPENCODE_MODEL: z.string().optional(),
  CODEX_MODEL: z.string().optional(),

  // Harness Auth
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENCODE_API_KEY: z.string().optional(),
  CODEX_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GH_TOKEN: z.string().optional(),
});

// ============================================================================
// Defaults
// ============================================================================

const DEFAULTS: Partial<Record<string, string>> = {
  LLM_BASE_URL: 'http://host.docker.internal:11434/v1',
  LLM_MODEL: 'glm-4.7-flash',
  WHISPER_MODEL: '/app/models/ggml-tiny.bin',
  WORKSPACE_ROOT: '/workspace',
  LOG_LEVEL: 'debug',
};

// ============================================================================
// Version
// ============================================================================

import { getVersion } from '../utils/version.js';

/** Application version string used by user-facing command/format output. */
export const VERSION = getVersion();

// ============================================================================
// Exports
// ============================================================================

type EnvConfig = z.infer<typeof EnvSchema>;
type EnvShape = typeof EnvSchema.shape;

/**
 * Environment accessor proxy.
 *
 * Reads `process.env` on each property access and applies defaults from
 * `DEFAULTS` when a value is unset. This keeps runtime config reloads and
 * test-time overrides visible without re-importing the module.
 */
export const env = new Proxy({} as EnvConfig, {
  get(_target, prop: string) {
    const val = process.env[prop];
    if (val !== undefined && val !== '') return val;
    return DEFAULTS[prop];
  },
});

// Load .env file if present
import dotenv from 'dotenv';
// Keep .env as the source of truth for runtime config inside the container.
dotenv.config({ override: true });

/**
 * Validate environment values against `EnvSchema`.
 *
 * @returns Validation status and missing/invalid keys
 */
export function validateEnv(): { valid: boolean; missing: string[] } {
  // Construct an object with all values (process.env + DEFAULTS)
  const envVars = Object.keys(EnvSchema.shape).reduce((acc, key) => {
    const val = process.env[key];
    if (val !== undefined && val !== '') {
      acc[key] = val;
    } else if (key in DEFAULTS) {
      acc[key] = DEFAULTS[key];
    }
    return acc;
  }, {} as Record<string, any>);

  const result = EnvSchema.safeParse(envVars);

  if (!result.success) {
    // Collect missing paths from Zod issues
    const missing = result.error.issues.map((i) => i.path.join('.'));
    return { valid: false, missing };
  }

  return { valid: true, missing: [] };
}

/**
 * Validate runtime env updates before applying them to `process.env`.
 *
 * Unknown keys and values that fail the declared schema are rejected.
 */
export function validateRuntimeEnvUpdates(
  updates: Record<string, string>
): { valid: boolean; invalid: Array<{ key: string; reason: string }> } {
  const invalid: Array<{ key: string; reason: string }> = [];
  const shape = EnvSchema.shape as EnvShape;

  for (const [key, value] of Object.entries(updates)) {
    const schema = shape[key as keyof EnvShape];
    if (!schema) {
      invalid.push({ key, reason: 'Unknown environment key' });
      continue;
    }

    const result = schema.safeParse(value);
    if (!result.success) {
      invalid.push({
        key,
        reason: result.error.issues[0]?.message ?? 'Invalid value',
      });
    }
  }

  return { valid: invalid.length === 0, invalid };
}

// ============================================================================
// LLM Configuration Helpers
// ============================================================================

/**
 * Returns the LLM base URL from unified config or OpenRouter fallback.
 */
export function getLLMBaseURL(): string {
  // Prefer unified LLM_BASE_URL
  if (env.LLM_BASE_URL) {
    return env.LLM_BASE_URL;
  }
  // Fall back to OpenRouter if OPENROUTER_API_KEY is set
  if (env.OPENROUTER_API_KEY) {
    return 'https://openrouter.ai/api/v1';
  }
  // Default to local Ollama
  return DEFAULTS.LLM_BASE_URL!;
}

/**
 * Returns the LLM model from unified config or specific model override.
 */
export function getLLMModel(modelType?: 'agent' | 'summary' | 'vision'): string {
  // Check for specific model overrides first
  if (modelType === 'agent' && env.AGENT_MODEL) return env.AGENT_MODEL;
  if (modelType === 'summary' && env.SUMMARY_MODEL) return env.SUMMARY_MODEL;
  if (modelType === 'vision' && env.VISION_MODEL) return env.VISION_MODEL;

  // Use unified LLM_MODEL
  return env.LLM_MODEL || DEFAULTS.LLM_MODEL!;
}

/**
 * Returns the LLM API key (LLM_API_KEY or OPENROUTER_API_KEY fallback).
 * Returns undefined if no key is configured (for local Ollama).
 */
export function getLLMApiKey(): string | undefined {
  return env.LLM_API_KEY || env.OPENROUTER_API_KEY || undefined;
}

/**
 * Returns true if using a local Ollama instance (no API key, local URL).
 */
export function isLocalOllama(): boolean {
  const baseUrl = getLLMBaseURL();
  const hasApiKey = !!getLLMApiKey();
  return !hasApiKey && (
    baseUrl.includes('localhost') ||
    baseUrl.includes('127.0.0.1') ||
    baseUrl.includes('host.docker.internal')
  );
}
