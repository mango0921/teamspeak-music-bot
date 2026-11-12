/** 扫码登录的二维码图片缓存：key → PNG，5 分钟后过期。 */
const cache = new Map<string, { data: Buffer; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

/** 记住 provider 返回的 base64 data URL，供 /api/auth/login-qr/:key.png 取图。 */
export function rememberLoginQr(key: string, dataUrl: string): void {
  if (!key || !dataUrl) return;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return;
  try {
    cache.set(key, {
      data: Buffer.from(dataUrl.slice(comma + 1), "base64"),
      expiresAt: Date.now() + TTL_MS,
    });
  } catch {
    // 非法 base64 直接忽略，聊天里仍会带原始链接
  }
}

export function getLoginQr(key: string): Buffer | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}
