/**
 * @fileoverview John's Heartbeat System
 *
 * Runs every 15 minutes to:
 * - Message James on WhatsApp and FoodstackOS
 * - Coordinate with Donna via FoodstackOS
 * - Post sprint updates to #development
 *
 * Part of DONNA-01 Phase 4: Agent Collaboration
 *
 * @module foodstack/heartbeat
 */

import { logger } from '../utils/logger.js';
import { postToChannel, sendAgentDM, reportActivity } from './bridge.js';
import { registerSendWhatsApp } from '../handler/index.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Heartbeat interval in milliseconds (15 minutes) */
const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;

/** Owner's WhatsApp ID (from OWNER_PHONE_NUMBER env var) */
const OWNER_WHATSAPP_ID = process.env.OWNER_PHONE_NUMBER || '';

/** Whether heartbeat is enabled */
let heartbeatEnabled = false;

/** Heartbeat timer reference */
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/** WhatsApp sender function (registered by bridge client) */
let whatsAppSender: ((userId: string, text: string) => Promise<void>) | null = null;

/** Heartbeat cycle counter */
let heartbeatCycle = 0;

// =============================================================================
// MESSAGE TEMPLATES
// =============================================================================

const JAMES_MESSAGES = [
  "📋 Quick check-in: I'm coordinating with Donna on sprint priorities. Any specific focus areas for today?",
  "📋 PM Update: Working with the team on FoodstackOS development. Let me know if you need anything prioritized.",
  "📋 Sprint sync: Donna and I are aligned on current goals. Happy to discuss product direction when you're free.",
  "📋 Heartbeat: All systems operational. Collaborating with Donna on BMAD workflows. Any blockers I should know about?",
  "📋 Status: FoodstackOS agent fleet is active. Donna's orchestrating, I'm on product strategy. Updates in #development.",
];

const DONNA_MESSAGES = [
  "Hey Donna! 👋 Quick sync - anything from the BMAD sprint I should flag to James?",
  "Donna, checking in. How's the team coordination going? Any product decisions pending?",
  "Sprint check: Any blockers or wins I should communicate to James? Let me know!",
  "Hey! Just did my heartbeat check-in with James. Anything you need me to relay via WhatsApp?",
  "Coordination ping: I'm available for any product strategy discussions. What's the team's current focus?",
];

const CLAUDE_MESSAGES = [
  "Hey Claude! 👋 John here. Any engineering tasks you need me to validate from a product perspective?",
  "Claude, PM check-in. Let me know if you need user stories refined or priorities clarified.",
  "Engineering sync: I'll be messaging James via WhatsApp. Anything from the codebase I should mention?",
  "Claude! Working through heartbeat cycles. Any PRs or builds I should flag to James?",
  "Quick PM→Eng sync: What's the current sprint velocity looking like? Any blockers?",
];

const CHANNEL_MESSAGES = [
  "📋 **John here** - Agent fleet heartbeat: Donna (orchestrator) and I (PM) are coordinating on sprint goals. Building FoodstackOS together! 🚀",
  "📋 **PM Update** - Running continuous BMAD cycles with the team. Donna's got the orchestration, I'm tracking product metrics.",
  "📋 **Sprint Status** - FoodstackOS development in progress. Agent collaboration enabled. Meat N' Bone pilot integration underway.",
  "📋 **Heartbeat** - All agents operational. Donna coordinating backend, I'm on user discovery. Progress update in 15 min.",
  "📋 **Team Sync** - BMAD sprint active. Working with @donna on priorities. @james gets WhatsApp updates. Let's build! 💪",
];

// =============================================================================
// HEARTBEAT LOGIC
// =============================================================================

/**
 * Get a random message from an array.
 */
function getRandomMessage(messages: string[]): string {
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Send a heartbeat message to James via WhatsApp.
 */
async function messageJamesWhatsApp(): Promise<void> {
  if (!whatsAppSender || !OWNER_WHATSAPP_ID) {
    logger.debug('WhatsApp sender not available or owner ID not configured');
    return;
  }

  try {
    const message = getRandomMessage(JAMES_MESSAGES);
    await whatsAppSender(OWNER_WHATSAPP_ID, message);
    logger.success(`WhatsApp heartbeat sent to James`);
  } catch (error) {
    logger.error('Failed to send WhatsApp heartbeat', error);
  }
}

/**
 * Send a heartbeat message to James via FoodstackOS DM.
 */
async function messageJamesFoodstack(): Promise<void> {
  try {
    const message = getRandomMessage(JAMES_MESSAGES);
    await sendAgentDM('james', message);
    logger.success('FoodstackOS DM sent to James');
  } catch (error) {
    logger.error('Failed to send FoodstackOS DM to James', error);
  }
}

/**
 * Send a coordination message to Donna via FoodstackOS.
 */
async function messageDonna(): Promise<void> {
  try {
    const message = getRandomMessage(DONNA_MESSAGES);
    await sendAgentDM('donna', message);
    logger.success('FoodstackOS DM sent to Donna');
  } catch (error) {
    logger.error('Failed to send FoodstackOS DM to Donna', error);
  }
}

/**
 * Send a coordination message to Claude (Chief Engineer) via FoodstackOS.
 */
async function messageClaude(): Promise<void> {
  try {
    const message = getRandomMessage(CLAUDE_MESSAGES);
    await sendAgentDM('claude', message);
    logger.success('FoodstackOS DM sent to Claude');
  } catch (error) {
    logger.error('Failed to send FoodstackOS DM to Claude', error);
  }
}

/**
 * Post a status update to #development channel.
 */
async function postToDevChannel(): Promise<void> {
  try {
    const message = getRandomMessage(CHANNEL_MESSAGES);
    await postToChannel('development', message);
    logger.success('Posted heartbeat to #development');
  } catch (error) {
    logger.error('Failed to post to #development', error);
  }
}

/**
 * Execute a full heartbeat cycle.
 */
async function executeHeartbeat(): Promise<void> {
  heartbeatCycle++;
  logger.section(`💓 Heartbeat Cycle #${heartbeatCycle}`);

  // Log activity
  await reportActivity(`Heartbeat cycle #${heartbeatCycle}`, {
    cycle: heartbeatCycle,
    timestamp: new Date().toISOString(),
  });

  // Rotate through different communication patterns
  // Cycle 1: All channels
  // Cycle 2: FoodstackOS only
  // Cycle 3: WhatsApp + Donna
  // Cycle 4: Channel only
  // ... repeat

  const pattern = heartbeatCycle % 4;

  switch (pattern) {
    case 1:
      // Full sync: All channels + all agents
      await Promise.all([
        messageJamesWhatsApp(),
        messageJamesFoodstack(),
        messageDonna(),
        messageClaude(),
        postToDevChannel(),
      ]);
      break;

    case 2:
      // FoodstackOS focused + Claude
      await Promise.all([
        messageJamesFoodstack(),
        messageDonna(),
        messageClaude(),
      ]);
      break;

    case 3:
      // WhatsApp + Donna + Channel
      await Promise.all([
        messageJamesWhatsApp(),
        messageDonna(),
        postToDevChannel(),
      ]);
      break;

    case 0:
      // Channel + Claude (engineering sync)
      await Promise.all([
        postToDevChannel(),
        messageClaude(),
      ]);
      break;
  }

  logger.divider();
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Register the WhatsApp sender function for proactive messaging.
 */
export function registerWhatsAppSender(sender: (userId: string, text: string) => Promise<void>): void {
  whatsAppSender = sender;
  logger.info('WhatsApp sender registered for heartbeat');
}

/**
 * Start the heartbeat system.
 */
export function startHeartbeat(): void {
  if (heartbeatEnabled) {
    logger.warn('Heartbeat already running');
    return;
  }

  heartbeatEnabled = true;
  logger.section('💓 John Heartbeat System');
  logger.info(`Interval: ${HEARTBEAT_INTERVAL_MS / 60000} minutes`);
  logger.info(`Owner WhatsApp: ${OWNER_WHATSAPP_ID || 'Not configured'}`);

  // Run first heartbeat after a short delay (let systems initialize)
  setTimeout(() => {
    executeHeartbeat().catch(err => {
      logger.error('First heartbeat failed', err);
    });
  }, 30000); // 30 second delay

  // Schedule recurring heartbeats
  heartbeatTimer = setInterval(() => {
    executeHeartbeat().catch(err => {
      logger.error('Heartbeat cycle failed', err);
    });
  }, HEARTBEAT_INTERVAL_MS);

  logger.success('Heartbeat system started');
  logger.divider();
}

/**
 * Stop the heartbeat system.
 */
export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  heartbeatEnabled = false;
  logger.info('Heartbeat system stopped');
}

/**
 * Check if heartbeat is running.
 */
export function isHeartbeatRunning(): boolean {
  return heartbeatEnabled;
}

/**
 * Get current heartbeat cycle count.
 */
export function getHeartbeatCycle(): number {
  return heartbeatCycle;
}

/**
 * Force an immediate heartbeat (for testing).
 */
export async function triggerHeartbeatNow(): Promise<void> {
  await executeHeartbeat();
}
