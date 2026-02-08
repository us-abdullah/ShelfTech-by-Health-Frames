/**
 * Item detection: GrocerEye YOLO, Dedalus (Gemini via Dedalus), or Google Gemini REST.
 */

import { env, isGrocerEyeConfigured, isDedalusApiKey } from './env';
import { setDedalus429 } from './dedalusRateLimit';

export interface BoundingBox {
  x: number; // top-left, normalized 0-1
  y: number;
  width: number;
  height: number;
}

export interface DetectedItem {
  label: string;
  bbox: BoundingBox;
}

/** Call GrocerEye server POST /detect with base64 image. */
async function detectWithGrocerEye(jpegBase64: string): Promise<DetectedItem[]> {
  const base = env.grocerEyeApiUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: jpegBase64 }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GrocerEye error: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { items?: Array<{ label: string; bbox: BoundingBox }>; error?: string };
  if (data.error) throw new Error(data.error);
  const items = data.items ?? [];
  return items.map((o) => ({ label: o.label, bbox: normalizeBbox(o.bbox) }));
}

const DETECTION_PROMPT = `You are analyzing a single image from a grocery store or kitchen. List every visible product or food item that a shopper might pick up.

CRITICAL: Always use SPECIFIC product or food names. Examples: "canned tuna", "olive oil", "vitamin D bottle", "greek yogurt", "oatmeal box", "salmon can". Never use only generic words like "box", "bottle", "can", "container"—identify what is inside or what the product is (e.g. "canned fish", "water bottle", "sauce bottle"). If multiple similar items (e.g. several cans), you may use one label like "canned fish" or "fish cans" for each.

Respond with ONLY a JSON array, no other text. Each element: { "label": "short specific product name", "bbox": { "x", "y", "width", "height" } }.
Use normalized coordinates 0-1: x,y = top-left corner of the item, width and height = size. Be precise so we can draw boxes on the image.`;

const DEDALUS_BASE = 'https://api.dedaluslabs.ai';

/** Call Dedalus (OpenAI-compatible) with Gemini for vision. Uses your Dedalus credit. */
async function detectWithDedalus(jpegBase64: string, apiKey: string): Promise<DetectedItem[]> {
  const res = await fetch(`${DEDALUS_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: DETECTION_PROMPT },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpegBase64}` } },
          ],
        },
      ],
      max_tokens: 1024,
      temperature: 0.1,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) setDedalus429();
    throw new Error(`Dedalus error: ${res.status} ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() ?? '[]';
  return parseDetectionJson(text);
}

function parseDetectionJson(text: string): DetectedItem[] {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    const arr = Array.isArray(parsed) ? parsed : [];
    return arr
      .filter(
        (o): o is { label: string; bbox: BoundingBox } =>
          o != null &&
          typeof o === 'object' &&
          typeof (o as { label?: unknown }).label === 'string' &&
          typeof (o as { bbox?: unknown }).bbox === 'object'
      )
      .map((o) => ({ label: o.label, bbox: normalizeBbox(o.bbox) }));
  } catch {
    return [];
  }
}

/** Call Google Gemini REST for bounding boxes. */
async function detectWithGemini(jpegBase64: string, apiKey: string): Promise<DetectedItem[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        parts: [
          { text: DETECTION_PROMPT },
          { inlineData: { mimeType: 'image/jpeg', data: jpegBase64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) {
      let retrySec = 30;
      try {
        const errJson = JSON.parse(errText) as { error?: { message?: string; details?: Array<{ retryDelay?: string }> } };
        const msg = errJson.error?.message ?? '';
        const match = msg.match(/retry in ([\d.]+)s/i) || msg.match(/(\d+)\s*second/);
        if (match) retrySec = Math.ceil(Number(match[1]));
      } catch {
        // ignore
      }
      throw new Error(`Gemini rate limit (free tier). Retry in ${retrySec}s or use GrocerEye for local detection.`);
    }
    throw new Error(`Detection API error: ${res.status} ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '[]';
  return parseDetectionJson(text);
}

export async function detectItemsInImage(
  jpegBase64: string,
  apiKey: string
): Promise<DetectedItem[]> {
  if (isGrocerEyeConfigured()) return detectWithGrocerEye(jpegBase64);
  if (isDedalusApiKey(apiKey)) return detectWithDedalus(jpegBase64, apiKey);
  return detectWithGemini(jpegBase64, apiKey);
}

function normalizeBbox(b: { x?: number; y?: number; width?: number; height?: number }): BoundingBox {
  return {
    x: Math.max(0, Math.min(1, Number(b.x) ?? 0)),
    y: Math.max(0, Math.min(1, Number(b.y) ?? 0)),
    width: Math.max(0.01, Math.min(1, Number(b.width) ?? 0.1)),
    height: Math.max(0.01, Math.min(1, Number(b.height) ?? 0.1)),
  };
}
