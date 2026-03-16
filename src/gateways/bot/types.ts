import type { Context, SessionFlavor } from "grammy";
import type { ConversationFlavor } from "@grammyjs/conversations";

// ============================================================================
// Bot Context Type
// ============================================================================
// Extends the base grammY Context with:
//   - SessionFlavor: in-memory session storage (for conversations plugin)
//   - ConversationFlavor: enables ctx.conversation.enter()
//
// This type is used across the BotGateway and conversation files.
// It lives in the gateway layer (not shared/) because it depends on grammy.
// ============================================================================

/** Session data stored per-chat. Currently only used by conversations. */
export interface SessionData {
  // The conversations plugin manages its own internal state here.
  // We don't store custom data in the session for now.
}

/** The bot's custom context type. */
export type BotContext = Context & SessionFlavor<SessionData> & ConversationFlavor<Context>;