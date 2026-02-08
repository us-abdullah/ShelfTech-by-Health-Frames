/**
 * Ask Gemini what a specific ingredient does in a product (for clickable ingredients).
 */

import { env, isDedalusApiKey } from './env';
import { setDedalus429 } from './dedalusRateLimit';

const DEDALUS_BASE = 'https://api.dedaluslabs.ai';

function buildPrompt(ingredient: string, productName: string): string {
  return `In the product "${productName}", what does the ingredient "${ingredient}" do? In 2–3 sentences: what it is (e.g. preservative, flavor, texture), why it's used, and any health or dietary note if relevant. Plain text, concise.`;
}

async function askDedalus(ingredient: string, productName: string, apiKey: string): Promise<string> {
  const res = await fetch(`${DEDALUS_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash',
      messages: [{ role: 'user', content: buildPrompt(ingredient, productName) }],
      max_tokens: 200,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    if (res.status === 429) setDedalus429();
    throw new Error(`Ingredient: ${res.status}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() ?? 'No response.';
}

async function askGoogle(ingredient: string, productName: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(ingredient, productName) }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
    }),
  });
  if (!res.ok) throw new Error(`Ingredient: ${res.status}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? 'No response.';
}

export async function getIngredientExplanation(ingredient: string, productName: string): Promise<string> {
  const apiKey = env.geminiApiKey;
  if (!apiKey) throw new Error('No API key');
  if (isDedalusApiKey(apiKey)) return askDedalus(ingredient, productName, apiKey);
  return askGoogle(ingredient, productName, apiKey);
}
