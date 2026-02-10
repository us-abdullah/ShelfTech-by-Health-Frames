// Env vars (Vite exposes VITE_* to client)
// Copy .env.example to .env and fill in.

export const env = {
  get geminiApiKey(): string {
    return import.meta.env.VITE_GEMINI_API_KEY ?? '';
  },
  get openClawHost(): string {
    return import.meta.env.VITE_OPENCLAW_HOST ?? '';
  },
  get openClawPort(): string {
    return import.meta.env.VITE_OPENCLAW_PORT ?? '18789';
  },
  get openClawToken(): string {
    return import.meta.env.VITE_OPENCLAW_GATEWAY_TOKEN ?? '';
  },
  get grocerEyeApiUrl(): string {
    return import.meta.env.VITE_GROCEREEYE_API_URL ?? '';
  },
  /** Optional: Dedalus key for voice Q&A only. If set, voice "Ask about this product" uses Dedalus (not Gemini). Falls back to VITE_GEMINI_API_KEY. */
  get dedalusVoiceApiKey(): string {
    return import.meta.env.VITE_DEDALUS_VOICE_API_KEY ?? import.meta.env.VITE_GEMINI_API_KEY ?? '';
  },
  /** Dedalus model for voice Q&A only (when using Dedalus). Other features use google/gemini-2.0-flash. Default: Mistral Small. */
  get dedalusVoiceModel(): string {
    return import.meta.env.VITE_DEDALUS_VOICE_MODEL ?? 'mistralai/mistral-small';
  },
  /** Optional: use a separate key for Gemini Live (Google). Set when using Dedalus for detection. */
  get geminiLiveApiKey(): string {
    return import.meta.env.VITE_GEMINI_LIVE_API_KEY ?? env.geminiApiKey ?? '';
  },
};

/** True if the key is a Dedalus API key (dsk-...). Use Dedalus REST for detection. */
export function isDedalusApiKey(key: string): boolean {
  return Boolean(key && key.startsWith('dsk-'));
}

export function isGeminiConfigured(): boolean {
  return Boolean(env.geminiApiKey && env.geminiApiKey !== 'YOUR_GEMINI_API_KEY');
}

/** Key to use for Gemini Live WebSocket (must be a Google API key). */
export function getGeminiLiveKey(): string {
  const k = env.geminiLiveApiKey;
  return isDedalusApiKey(k) ? '' : k;
}

export function isOpenClawConfigured(): boolean {
  return Boolean(
    env.openClawHost &&
      env.openClawHost !== 'http://YOUR_MAC_HOSTNAME.local' &&
      env.openClawToken &&
      env.openClawToken !== 'YOUR_OPENCLAW_GATEWAY_TOKEN'
  );
}

export function isGrocerEyeConfigured(): boolean {
  return Boolean(env.grocerEyeApiUrl && env.grocerEyeApiUrl !== '');
}
