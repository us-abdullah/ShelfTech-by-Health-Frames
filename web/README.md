# VisionClaw Grocery – Web App

Browser app: **full-screen Camo camera** + **Gemini Live** (voice + vision) + **item detection/boxes** + **focused item details** (macros, dietary, price). Uses the same Gemini Live + OpenClaw (Claw bot) flow as the iOS VisionClaw app.

## Quick start

```bash
cd web
cp .env.example .env
# Edit .env: set VITE_GEMINI_API_KEY (get one at https://aistudio.google.com/apikey)
npm install
npm run dev
```

Open the URL (e.g. `http://localhost:5173`), click **Start camera** and choose **Camo** (or any camera), then **Start Gemini Live** for voice + vision. Items are detected and boxed; use the list to focus an item and see mock nutrition/dietary/price.

See **[SETUP_AND_REQUIREMENTS.md](../SETUP_AND_REQUIREMENTS.md)** in the repo root for exactly what you need (API keys, OpenClaw, Costco later).
