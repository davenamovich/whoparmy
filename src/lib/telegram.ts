// Telegram Bot API helper — used by Meme Army onboarding (getMe /
// setWebhook) and the live webhook command handlers. Official Bot API
// only; no bulk messaging anywhere in this codebase.

const TG_API = "https://api.telegram.org";

export interface TgResult<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export async function tgCall<T>(token: string, method: string, params?: Record<string, unknown>): Promise<TgResult<T>> {
  try {
    const res = await fetch(`${TG_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params ?? {}),
      signal: AbortSignal.timeout(12000),
    });
    const json = (await res.json()) as TgResult<T>;
    return json;
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : "Telegram request failed" };
  }
}

export interface TgUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export async function tgGetMe(token: string) {
  return tgCall<TgUser>(token, "getMe");
}

export async function tgSetWebhook(token: string, url: string, secret: string) {
  return tgCall<boolean>(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
}

export async function tgDeleteWebhook(token: string) {
  return tgCall<boolean>(token, "deleteWebhook", { drop_pending_updates: false });
}

export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: {
    id: string;
    from: TgUser;
    data?: string;
    message?: TgMessage;
  };
}

export async function tgSendMessage(
  token: string,
  chatId: number | string,
  text: string,
  replyMarkup?: Record<string, unknown>,
) {
  return tgCall<TgMessage>(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export async function tgAnswerCallbackQuery(token: string, callbackQueryId: string, text?: string) {
  return tgCall<boolean>(token, "answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

export function inlineKeyboard(rows: { text: string; callback_data?: string; url?: string }[][]) {
  return {
    inline_keyboard: rows.map((row) =>
      row.map((btn) => (btn.url ? { text: btn.text, url: btn.url } : { text: btn.text, callback_data: btn.callback_data })),
    ),
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
