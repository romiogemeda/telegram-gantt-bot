import { Bot, InlineKeyboard } from "grammy";
import type {
  TelegramAdapter,
  SendMessageOptions,
} from "../../shared/adapters/telegram.adapter.js";

export class GrammyTelegramAdapter implements TelegramAdapter {
  constructor(private readonly bot: Bot<any>) {}

  async sendMessage(
    chatId: number | bigint,
    text: string,
    options?: SendMessageOptions,
  ): Promise<void> {
    await this.bot.api.sendMessage(Number(chatId), text, {
      parse_mode: options?.parseMode,
    });
  }

  async sendMessageWithWebApp(
    chatId: number | bigint,
    text: string,
    buttonText: string,
    webAppUrl: string,
  ): Promise<void> {
    const keyboard = new InlineKeyboard().webApp(buttonText, webAppUrl);
    await this.bot.api.sendMessage(Number(chatId), text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  }
}