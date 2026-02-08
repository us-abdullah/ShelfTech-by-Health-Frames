/**
 * Batch API: get short relevance phrase per item for overlay (Halal, High protein, Vitamin D, etc.).
 */

import { env, isDedalusApiKey } from './env';
import { isDedalusBackoff, setDedalus429, DEDALUS_BACKOFF_MS } from './dedalusRateLimit';
import type { PersonProfile } from './rag';
import { profileSummary } from './rag';

const DEDALUS_BASE = 'https://api.dedaluslabs.ai';

function buildPrompt(labels: string[], profile: PersonProfile): string {
  const summary = profileSummary(profile);
  return `You are helping a shopper see which products match their preferences at a glance.

Products currently visible (use these exact labels): ${labels.map((l) => `"${l}"`).join(', ')}

User preferences: ${summary}

For each product that is even remotely relevant to their preferences, output a SHORT phrase (2–5 words) saying why:
- Dietary (halal/kosher/vegan/gluten-free etc): "Halal", "Kosher", "Vegan", "Gluten-free", etc.
- High protein or value: "High protein", "Good value", "Protein/$"
- Deficiency (Vitamin D, Iron, B12): "Vitamin D", "Iron", "B12"
- Body goals: if cutting → "Low cal" or "Good for cut"; if bulking → "High protein" or "Good for bulk"
- Health conditions: if stomach/digestive issues → "Gentle on stomach" or "Easy to digest" for suitable items (e.g. banana, rice, plain yogurt); if pain/inflammation → mention anti-inflammatory where relevant
- Shopping list: "On list"
- Combine with · only if 2 reasons: "Halal · High protein"

Only include products that match at least one preference. Use the exact product label as in the list.
Respond with ONLY a JSON array, no other text. Format: [{"label": "exact product name", "relevance": "short phrase"}]
Example: [{"label": "canned tuna", "relevance": "High protein"}, {"label": "greek yogurt", "relevance": "High protein · Calcium"}]`;
}

async function fetchDedalus(labels: string[], profile: PersonProfile, apiKey: string): Promise<Record<string, string>> {
  if (labels.length === 0 || isDedalusBackoff(DEDALUS_BACKOFF_MS)) return {};
  const res = await fetch(`${DEDALUS_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash',
      messages: [{ role: 'user', content: buildPrompt(labels, profile) }],
      max_tokens: 400,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    if (res.status === 429) setDedalus429();
    return {};
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() ?? '[]';
  return parseRelevanceJson(text, labels);
}

async function fetchGoogle(labels: string[], profile: PersonProfile, apiKey: string): Promise<Record<string, string>> {
  if (labels.length === 0) return {};
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(labels, profile) }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 400, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) return {};
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '[]';
  return parseRelevanceJson(text, labels);
}

function parseRelevanceJson(text: string, labels: string[]): Record<string, string> {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const map: Record<string, string> = {};
  try {
    const arr = JSON.parse(cleaned) as unknown[];
    if (!Array.isArray(arr)) return map;
    for (const o of arr) {
      if (o && typeof o === 'object' && typeof (o as { label?: string }).label === 'string' && typeof (o as { relevance?: string }).relevance === 'string') {
        const label = (o as { label: string }).label.trim();
        const relevance = (o as { relevance: string }).relevance.trim();
        if (!relevance) continue;
        const key = labels.find((l) => l.toLowerCase() === label.toLowerCase()) ?? label;
        map[key] = relevance;
      }
    }
  } catch {
    // ignore
  }
  return map;
}

export async function fetchOverlayRelevance(labels: string[], profile: PersonProfile | null): Promise<Record<string, string>> {
  if (!profile || labels.length === 0) return {};
  const apiKey = env.geminiApiKey;
  if (!apiKey) return {};
  try {
    if (isDedalusApiKey(apiKey)) return fetchDedalus(labels, profile, apiKey);
    return fetchGoogle(labels, profile, apiKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('429') || msg.includes('Too Many')) setDedalus429();
    return {};
  }
}
