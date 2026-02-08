/**
 * Proxy tool calls from Gemini Live to your OpenClaw gateway (same as VisionClaw iOS app).
 * Optional: only used if VITE_OPENCLAW_* env is set.
 */

export interface OpenClawConfig {
  host: string;
  port: string;
  token: string;
}

export async function delegateToOpenClaw(
  config: OpenClawConfig,
  task: string
): Promise<{ success: boolean; result: string }> {
  const url = `${config.host}:${config.port}/v1/chat/completions`;
  const sessionKey = `agent:main:web:${new Date().toISOString()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
      'x-openclaw-session-key': sessionKey,
    },
    body: JSON.stringify({
      model: 'openclaw',
      messages: [{ role: 'user', content: task }],
      stream: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { success: false, result: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? 'OK';
  return { success: true, result: content };
}
