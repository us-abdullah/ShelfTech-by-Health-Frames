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

## Deploy to Vercel

1. Push your repo to GitHub (if you haven’t already).
2. Go to [vercel.com](https://vercel.com) and sign in. Click **Add New… → Project** and import your GitHub repo.
3. **Root Directory:** Click **Edit** next to the repo name and set **Root Directory** to `web`. (Leave other fields as-is.)
4. **Environment variables:** In the project settings (or during import), add:
   - `VITE_GEMINI_API_KEY` = your Gemini or Dedalus API key (required for detection and voice answers).
   - Optionally: `VITE_GEMINI_LIVE_API_KEY`, `VITE_GROCEREEYE_API_URL`, `VITE_OPENCLAW_*` if you use those.
5. Click **Deploy**. Vercel will run the build and serve from `dist/`.
6. **If you see "vite: command not found":** In Vercel → Project Settings → General → Build & Development Settings, set **Build Command** to `npx tsc -b && npx vite build` and **Framework Preset** to **Other**. Save and redeploy.

**Or from the CLI** (after `npm i -g vercel` and `vercel login`):

```bash
cd web
vercel
# Follow prompts; set root to . when asked. For production: vercel --prod
```
