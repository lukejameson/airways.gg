const DEBOUNCE_MS = 5 * 60 * 1000;
const sent = new Map<string, number>();

export async function sendAlert(
  service: string,
  level: 'critical' | 'warning',
  message: string,
  error?: unknown,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const key = `${service}:${message.slice(0, 60)}`;
  const now = Date.now();
  if ((sent.get(key) ?? 0) + DEBOUNCE_MS > now) return;
  sent.set(key, now);

  const icon = level === 'critical' ? '\u{1F534}' : '⚠️';
  const errorSnippet = error ? `\n\`${String(error).slice(0, 300)}\`` : '';
  const text = `${icon} *airways.gg — ${service}*\n${message}${errorSnippet}`;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  }).catch(() => {});
}
