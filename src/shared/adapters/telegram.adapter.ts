// ============================================================================
// Telegram Adapter Interface
// ============================================================================
// This adapter isolates domain modules from the grammy library.
// Domain modules call these methods to send messages to Telegram;
// they never import grammy directly.
//
// Fitness Function FF-5 enforces this boundary via ESLint rules.
// ============================================================================

/**
 * Minimal interface for sending messages to Telegram.
 * Domain modules depend on this interface, not on grammy directly.
 */
export interface TelegramAdapter {
  /**
   * Send a text message to a chat.
   */
  sendMessage(chatId: number | bigint, text: string, options?: SendMessageOptions): Promise<void>;

  /**
   * Send a message with an inline keyboard button that opens the Mini App.
   */
  sendMessageWithWebApp(
    chatId: number | bigint,
    text: string,
    buttonText: string,
    webAppUrl: string,
  ): Promise<void>;
}

export interface SendMessageOptions {
  parseMode?: "HTML" | "MarkdownV2";
}