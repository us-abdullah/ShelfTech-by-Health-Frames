/**
 * Fetch product details (dietary, macros, nutrition) from Gemini/Dedalus for a selected item.
 * When profile is provided, analysis is tailored to RAG (dietary, protein/budget, bloodwork, shopping list) and includes compatibility.
 */

import { env, isDedalusApiKey } from './env';
import { setDedalus429 } from './dedalusRateLimit';
import type { ItemDetails } from './itemDetails';
import type { PersonProfile } from './rag';
import { profileSummary } from './rag';

const DEDALUS_BASE = 'https://api.dedaluslabs.ai';

function buildDetailsPrompt(label: string, profile: PersonProfile | null, withImage: boolean): string {
  const ragContext = profile ? `\n\nUSER CONTEXT (use this to assess compatibility and emphasize what matters to them):\n${profileSummary(profile)}` : '';
  return `You are a grocery/nutrition expert. You MUST always give concrete answers. Never respond with "Unknown", "label not fully visible", "check label", or "—" as a final answer.
${withImage ? 'Look at the product in the image. Identify the exact product (brand and name) if visible; otherwise infer from shape/context.' : ''}
For the product "${label}":
- Use the image and your product knowledge to identify the item and look up or infer all fields.
- If the nutrition label is not visible, give your best evidence-based estimate for this type of product (e.g. typical canned tuna macros, typical smoked fish dietary status).
- DIETARY: Be inclusive. State all that apply: Halal, Haram, Kosher, Vegetarian, Vegan, Pescatarian, gluten-free, dairy-free, nut-free, soy-free, low-sodium, diabetic-friendly, low-FODMAP, no gelatin, no alcohol—or "Typically [X]". Never "Unknown".
- MACROS: Always give numbers (estimate from product type if label not visible).
- NUTRITION and DAILY VALUE: Always 1–2 concrete sentences or percentages.
- COMPATIBILITY: Always give a clear recommendation (Good fit / Caution / Avoid) with reason based on the user context. Never say only "Check label."
- INGREDIENTS: List all ingredients (comma-separated or one per line). Use the product label if visible; otherwise list typical ingredients for this product type.
- PRICE: Provide estimated typical prices. Format: "Costco $X.XX, Trader Joe's $X.XX, Whole Foods $X.XX, Walmart $X.XX" (use realistic estimates for the product; at least 2–3 stores).${ragContext}

Reply in this exact format (short lines, labels in caps):
PRODUCT: <exact brand and product name if visible, otherwise specific product type>
DIETARY: ...
MACROS: ... cal, ...g protein, ...g carbs, ...g fat
ALLERGENS: ...
INGREDIENTS: ingredient1, ingredient2, ingredient3, ...
PRICE: Costco $X.XX, Trader Joe's $X.XX, ...
NUTRITION: ...
DAILY VALUE: ...
COMPATIBILITY: ...`;
}

function parseDetailsText(label: string, text: string): ItemDetails {
  const details: ItemDetails = { name: label };
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (line.toUpperCase().startsWith('DIETARY:')) {
      const v = line.replace(/^dietary:\s*/i, '').trim();
      details.dietary = [v && !/^unknown\.?$/i.test(v) ? v : 'See nutrition label for certification'];
    }
    if (line.toUpperCase().startsWith('MACROS:')) {
      const v = line.replace(/^macros:\s*/i, '').trim();
      const cal = v.match(/(\d+)\s*cal/i)?.[1];
      const protein = v.match(/(\d+(?:\.\d+)?)\s*g\s*protein/i)?.[1];
      const carbs = v.match(/(\d+(?:\.\d+)?)\s*g\s*carbs/i)?.[1];
      const fat = v.match(/(\d+(?:\.\d+)?)\s*g\s*fat/i)?.[1];
      if (cal || protein || carbs || fat) {
        details.macros = {
          calories: cal ? parseInt(cal, 10) : undefined,
          protein: protein ? parseFloat(protein) : undefined,
          carbs: carbs ? parseFloat(carbs) : undefined,
          fat: fat ? parseFloat(fat) : undefined,
        };
      }
    }
    if (line.toUpperCase().startsWith('ALLERGENS:')) {
      const v = line.replace(/^allergens:\s*/i, '').trim();
      if (v && !/none|n\/a|unknown/i.test(v)) details.allergies = [v];
    }
    if (line.toUpperCase().startsWith('INGREDIENTS:')) {
      const v = line.replace(/^ingredients:\s*/i, '').trim();
      if (v) {
        details.ingredients = v.split(/[,;]|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
      }
    }
    if (line.toUpperCase().startsWith('PRICE:')) {
      const v = line.replace(/^price:\s*/i, '').trim();
      const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
      const elsewhere: { store: string; price: number }[] = [];
      let costco: number | undefined;
      for (const part of parts) {
        const match = part.match(/(.+?)\s*\$?(\d+\.?\d*)\s*$/);
        if (match) {
          const store = match[1].trim();
          const price = parseFloat(match[2]);
          if (/costco/i.test(store)) costco = price;
          else elsewhere.push({ store, price });
        }
      }
      if (costco != null) details.priceAtCostco = costco;
      if (elsewhere.length) details.priceElsewhere = elsewhere;
    }
    if (line.toUpperCase().startsWith('NUTRITION:')) {
      const v = line.replace(/^nutrition:\s*/i, '').trim();
      details.nutritionSummary = v && !/label not fully visible|unknown/i.test(v) ? v : 'Typical nutrition for this product type; check package for exact values.';
    }
    if (line.toUpperCase().startsWith('DAILY VALUE:')) {
      const v = line.replace(/^daily value:\s*/i, '').trim();
      details.dailyValueContribution = { Summary: v && !/label not fully visible|unknown/i.test(v) ? v : 'Typical daily value contribution; see package for exact %.' };
    }
    if (line.toUpperCase().startsWith('COMPATIBILITY:')) {
      const v = line.replace(/^compatibility:\s*/i, '').trim();
      details.compatibilitySummary = v && !/^check label\.?$/i.test(v) ? v : 'Compatibility depends on your dietary needs; see details above.';
    }
    if (line.toUpperCase().startsWith('PRODUCT:')) {
      const v = line.replace(/^product:\s*/i, '').trim();
      if (v && v !== label) details.name = v;
    }
  }

  if (!details.nutritionSummary && text.length > 0) {
    details.nutritionSummary = text.slice(0, 300).trim();
  }
  return details;
}

async function fetchDetailsDedalus(label: string, apiKey: string, profile: PersonProfile | null, imageBase64?: string): Promise<ItemDetails> {
  const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
    { type: 'text', text: buildDetailsPrompt(label, profile, Boolean(imageBase64)) },
  ];
  if (imageBase64) {
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } });
  }
  const res = await fetch(`${DEDALUS_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash',
      messages: [{ role: 'user', content }],
      max_tokens: 768,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    if (res.status === 429) setDedalus429();
    throw new Error(`Dedalus details: ${res.status}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  return parseDetailsText(label, text);
}

async function fetchDetailsGoogle(label: string, apiKey: string, profile: PersonProfile | null, imageBase64?: string): Promise<ItemDetails> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: buildDetailsPrompt(label, profile, Boolean(imageBase64)) },
  ];
  if (imageBase64) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 768 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini details: ${res.status}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  return parseDetailsText(label, text);
}

export async function fetchItemDetailsFromGemini(
  label: string,
  profile: PersonProfile | null = null,
  imageBase64?: string
): Promise<ItemDetails> {
  const apiKey = env.geminiApiKey;
  if (!apiKey) throw new Error('No API key for details');
  if (isDedalusApiKey(apiKey)) return fetchDetailsDedalus(label, apiKey, profile, imageBase64);
  return fetchDetailsGoogle(label, apiKey, profile, imageBase64);
}
