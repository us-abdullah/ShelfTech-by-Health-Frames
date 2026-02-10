/**
 * Send user's question (e.g. from voice transcript) + product context to Dedalus or Gemini; get text answer.
 * Uses Dedalus when the API key is a Dedalus key (dsk-...) or when VITE_DEDALUS_VOICE_API_KEY is set.
 */

import { env, isDedalusApiKey } from './env';
import { setDedalus429 } from './dedalusRateLimit';
import type { PersonProfile } from './rag';
import { profileSummary } from './rag';

const DEDALUS_BASE = 'https://api.dedaluslabs.ai';

function buildPrompt(question: string, productContext: string, profileSummary?: string): string {
  const context = profileSummary
    ? `\nUser's preferences (answer with these in mind): ${profileSummary}\n`
    : '';
  return `The user is asking about a product they're looking at in a store.

Product: ${productContext || 'No specific product selected.'}
${context}
User's question: "${question}"

Answer in plain text, concisely and helpfully. For chocolate mention cocoa % if relevant; for nutrition mention key facts. Keep it short (2–4 sentences).`;
}

async function askDedalus(question: string, productContext: string, apiKey: string, profile: PersonProfile | null): Promise<string> {
  const model = env.dedalusVoiceModel;
  const res = await fetch(`${DEDALUS_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: buildPrompt(question, productContext, profile ? profileSummary(profile) : undefined) }],
      max_tokens: 400,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    if (res.status === 429) setDedalus429();
    throw new Error(`Voice answer: ${res.status}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() ?? 'No response.';
}

async function askGoogle(question: string, productContext: string, apiKey: string, profile: PersonProfile | null): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(question, productContext, profile ? profileSummary(profile) : undefined) }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
    }),
  });
  if (!res.ok) throw new Error(`Voice answer: ${res.status}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? 'No response.';
}

export async function askGeminiAboutProduct(question: string, productContext: string, profile: PersonProfile | null = null): Promise<string> {
  const apiKey = env.dedalusVoiceApiKey;
  if (!apiKey) throw new Error('No API key (set VITE_GEMINI_API_KEY or VITE_DEDALUS_VOICE_API_KEY)');
  if (isDedalusApiKey(apiKey)) return askDedalus(question, productContext, apiKey, profile);
  return askGoogle(question, productContext, apiKey, profile);
}
