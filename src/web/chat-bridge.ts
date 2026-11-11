import { WebSocket, type WebSocketServer } from "ws";
import type { BotManager } from "../bot/manager.js";
import type { TS3TextMessage } from "../ts-protocol/client.js";
import type { Logger } from "../logger.js";

/** 与 TeamSpeak 自身的消息长度上限保持一致，避免超长包被服务端截断。 */
export const CHAT_MESSAGE_MAX_LENGTH = 400;

/**
 * 网页聊天桥：把 bot 收到的 textMessage 事件转发给网页，并接受网页发来的
 * `{type:"send", text}`。消息以 bot 自己的身份发出，因此和 TS6 客户端看到的
 * 发送者完全一致（也就是该用户的网页分身）。
 */
export function setupChatBridge(
  wss: WebSocketServer,
  botManager: BotManager,
  logger: Logger
) {
  const detachBySocket = new Map<WebSocket, () => void>();

  wss.on("connection", (ws) => {
    const botId = (ws as unknown as { chatBotId?: string }).chatBotId;
    const bot = botId ? botManager.getBot(botId) : undefined;
    if (!bot || !botId) {
      ws.close(1008, "bot not found");
      return;
    }

    const onMessage = (msg: TS3TextMessage) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(
          JSON.stringify({
            type: "message",
            invokerName: msg.invokerName,
            invokerId: msg.invokerId,
            invokerUid: msg.invokerUid,
            targetMode: msg.targetMode,
            message: msg.message,
            at: Date.now(),
          })
        );
      } catch (err) {
        logger.warn({ err, botId }, "Chat bridge send failed");
      }
    };

    const detach = () => {
      if (!detachBySocket.has(ws)) return;
      bot.removeListener("textMessage", onMessage);
      bot.removeListener("disconnected", onDisconnected);
      detachBySocket.delete(ws);
    };
    const onDisconnected = () => {
      detach();
      try {
        ws.close(1012, "bot disconnected");
      } catch {
        // Socket may already be closing while the TS connection drops.
      }
    };

    detachBySocket.set(ws, detach);
    bot.on("textMessage", onMessage);
    bot.once("disconnected", onDisconnected);

    ws.on("message", (raw) => {
      let payload: unknown;
      try {
        payload = JSON.parse(String(raw));
      } catch {
        return;
      }
      const data = payload as { type?: string; text?: unknown };
      if (data?.type !== "send" || typeof data.text !== "string") return;
      const text = data.text.trim().slice(0, CHAT_MESSAGE_MAX_LENGTH);
      if (!text) return;
      bot.sendChatMessage(text).catch((err) => {
        logger.warn({ err, botId }, "Failed to send chat message");
      });
    });

    ws.once("close", detach);
    ws.once("error", detach);
    logger.debug({ botId }, "Chat bridge client connected");
  });

  return {
    cleanup() {
      for (const [ws, detach] of detachBySocket) {
        detach();
        try {
          ws.close(1001, "server shutdown");
        } catch {
          // Socket may already be closed.
        }
      }
    },
  };
}
