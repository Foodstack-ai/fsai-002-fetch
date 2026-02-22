/**
 * @fileoverview FoodstackOS Living Workspace Bridge
 *
 * Connects the Fetch vessel to FoodstackOS for:
 * - Channel messaging (#development, #general, etc.)
 * - Agent DMs (message other agents)
 * - Activity reporting (heartbeat integration)
 *
 * @module foodstack/bridge
 */

import { logger } from '../utils/logger.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

// FoodstackOS API endpoint (container reaches host via host.docker.internal)
const FOODSTACK_API = process.env.FOODSTACK_API_URL || 'http://host.docker.internal:3000';
const AGENT_ID = 'john'; // This vessel's agent identity

// =============================================================================
// API CLIENT
// =============================================================================

interface BridgeResponse {
  success?: boolean;
  error?: string;
  action?: string;
}

async function callBridge(
  action: string,
  params: Record<string, unknown>
): Promise<BridgeResponse> {
  try {
    const response = await fetch(`${FOODSTACK_API}/api/vessel-bridge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        agentId: AGENT_ID,
        ...params,
      }),
    });

    const result = await response.json() as BridgeResponse;

    if (!response.ok || result.error) {
      logger.error(`Bridge error: ${result.error || response.statusText}`);
      return { success: false, error: result.error };
    }

    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Bridge call failed: ${msg}`);
    return { success: false, error: msg };
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Post a message to a FoodstackOS channel.
 *
 * @param channel - Channel name (e.g., "development", "general")
 * @param message - Message content
 */
export async function postToChannel(channel: string, message: string): Promise<boolean> {
  const result = await callBridge('post_channel', { channel, message });

  if (result.success) {
    logger.success(`Posted to #${channel}: "${message.substring(0, 50)}..."`);
    return true;
  }
  return false;
}

/**
 * Send a DM to another agent.
 *
 * @param targetAgent - Target agent ID (e.g., "donna", "winston")
 * @param message - Message content
 */
export async function sendAgentDM(targetAgent: string, message: string): Promise<boolean> {
  const result = await callBridge('send_dm', { targetAgent, message });

  if (result.success) {
    logger.success(`DM sent to @${targetAgent}`);
    return true;
  }
  return false;
}

/**
 * Report vessel activity to FoodstackOS.
 *
 * @param message - Activity description
 * @param metadata - Optional metadata
 */
export async function reportActivity(
  message: string,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  const result = await callBridge('log_activity', { message, metadata });
  return result.success ?? false;
}

/**
 * Announce vessel startup to the team.
 */
export async function announceStartup(): Promise<boolean> {
  const result = await callBridge('announce', {
    message: `📋 John (Product Manager) vessel online. Ready for product strategy and user discovery.`,
  });
  return result.success ?? false;
}

/**
 * Forward a WhatsApp conversation to FoodstackOS for visibility.
 *
 * @param fromUser - WhatsApp user identifier
 * @param userMessage - User's message
 * @param agentResponse - Agent's response
 */
export async function logConversation(
  fromUser: string,
  userMessage: string,
  agentResponse: string
): Promise<void> {
  await callBridge('log_activity', {
    message: `WhatsApp conversation with ${fromUser}`,
    metadata: {
      channel: 'whatsapp',
      fromUser,
      userMessage: userMessage.substring(0, 500),
      agentResponse: agentResponse.substring(0, 500),
    },
  });
}

// =============================================================================
// INITIALIZATION
// =============================================================================

let initialized = false;

/**
 * Initialize the FoodstackOS bridge.
 * Call this during vessel startup.
 */
export async function initializeFoodstackBridge(): Promise<void> {
  if (initialized) return;

  logger.section('🔗 FoodstackOS Bridge');
  logger.info(`API: ${FOODSTACK_API}/api/vessel-bridge`);
  logger.info(`Agent ID: ${AGENT_ID}`);

  // Test connection by announcing startup
  const success = await announceStartup();

  if (success) {
    logger.success('Connected to FoodstackOS Living Workspace');
    initialized = true;
  } else {
    logger.warn('FoodstackOS connection failed - continuing without integration');
  }

  logger.divider();
}
