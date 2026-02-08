# VisionClaw Grocery – What You Need & How to Run

This doc lists **exactly** what you need to provide and how to run the web app (Camo camera + Gemini Live + item highlighting + copilot).

---

## 1. What You Need From Me (Your Side)

### Required

- **Gemini API key**
  - Get one: https://aistudio.google.com/apikey (free).
  - Put it in `web/.env` as `VITE_GEMINI_API_KEY=your_key_here`.

### Optional (for full Claw bot behavior)

- **OpenClaw** (same as the iOS VisionClaw app):
  - Run OpenClaw on your Mac and enable the gateway (see main [README](README.md)).
  - In `web/.env` set:
    - `VITE_OPENCLAW_HOST=http://Your-Mac.local` (Bonjour name from **System Settings → General → Sharing**).
    - `VITE_OPENCLAW_PORT=18789`
    - `VITE_OPENCLAW_GATEWAY_TOKEN=your_gateway_token` (must match `gateway.auth.token` in `~/.openclaw/openclaw.json`).
  - Your laptop and phone (if using Camo) don’t need to be on the same network as the Mac for the **web app**, but the **machine running the browser** (your laptop) must be able to reach the Mac at `VITE_OPENCLAW_HOST:VITE_OPENCLAW_PORT`.

### Camera

- **Camo**: Install Camo on your iPhone and Camo on your laptop. In the browser, when you click “Start camera”, choose **Camo** as the camera device so the feed is your phone’s camera (e.g. for a side‑by‑side demo: one person with the app, one without).
- You can also use the laptop’s built‑in webcam; the app works with any camera the browser can use.

### Optional: GrocerEye (YOLO item boxing)

- For **branded grocery item** boxing (the [GrocerEye](https://github.com/bhimar/GrocerEye) YOLOv3 model, 25 classes), clone GrocerEye into this repo and run the detection server:
  1. From VisionClaw root: `git clone https://github.com/bhimar/GrocerEye.git`
  2. Get the trained weights (train in GrocerEye’s Colab notebook or use a shared link) and put them at `GrocerEye/backup/grocer-eye_final.weights`
  3. Run the server: `cd grocer-eye-server && pip install -r requirements.txt && python server.py`
  4. In `web/.env` add: `VITE_GROCEREEYE_API_URL=http://localhost:5000`
- When `VITE_GROCEREEYE_API_URL` is set, the web app uses GrocerEye for live boxing instead of Gemini; you can run with the camera only (no need to start Gemini Live for boxes). See `grocer-eye-server/README.md` for details.

### Later (not needed for first demo)

- **Costco / product data**: For now the app uses **mock** item details (macros, dietary, price). When you have a Costco (or other) product API, we’ll plug it in and keep the same UI (shopping list, preferences, optimal route can be added then).

---

## 2. How to Run the Web App

```bash
cd web
cp .env.example .env
# Edit .env: set VITE_GEMINI_API_KEY (and optionally OpenClaw vars).
npm install
npm run dev
```

- Open the URL shown (e.g. `http://localhost:5173`).
- Click **Start camera** and select **Camo** (or your webcam).
- Optional: click **Start Gemini Live (voice + vision)** so the app sends the camera feed + mic to Gemini and you get voice and tool calls (e.g. “add milk to my list” via OpenClaw).
- Items in view are detected every ~2s and **boxed/highlighted** on the feed. Use the list on the left to **focus** an item; the **Item detail panel** shows mock macros, dietary, price, nutrition. Later we’ll wire real Costco/product data and preferences.

---

## 3. What’s Implemented vs Later

| Feature | Status |
|--------|--------|
| Full‑screen camera (Camo or any device) | Done |
| Gemini Live (video + audio, voice in/out) | Done |
| Send frames from camera to Gemini Live | Done |
| Item detection (boxes) on the feed | Done (Gemini REST or GrocerEye YOLO when `VITE_GROCEREEYE_API_URL` is set) |
| Overlay: boxes + “tap to focus” list | Done |
| Focused item panel (macros, dietary, price, nutrition) | Done (mock data) |
| OpenClaw “execute” (e.g. add to list, search) | Done when env is set |
| Preferences / shopping list / blood work upload | Planned (human front-end) |
| Costco inventory + optimal route (green arrows, etc.) | Planned (when you have API / RAG) |
| Cart detection (item added to cart) | Planned |
| ElevenLabs migration for voice | Planned (hackathon track) |

---

## 4. API Keys and Secrets

- **Never** commit `.env` or put your real API key in the repo. `.env` is gitignored.
- For production, use **ephemeral tokens** for Gemini (see [Gemini Live docs](https://ai.google.dev/gemini-api/docs/ephemeral-tokens)) instead of the API key in the browser.

---

## 5. Troubleshooting

- **“Add VITE_GEMINI_API_KEY”**: Create `web/.env` from `web/.env.example` and set `VITE_GEMINI_API_KEY`.
- **No camera list / Camo not showing**: Allow camera permission for the site; in the browser’s camera picker, choose “Camo” or the correct device.
- **OpenClaw connection timeout**: Ensure the machine running the browser can reach the Mac at `VITE_OPENCLAW_HOST:VITE_OPENCLAW_PORT`, gateway is running (`openclaw gateway restart`), and the token in `.env` matches OpenClaw’s `gateway.auth.token`.
- **Boxes don’t match items**: If using Gemini detection, it runs every ~2s. For GrocerEye, run the `grocer-eye-server` and set `VITE_GROCEREEYE_API_URL`; ensure GrocerEye weights and `classes.txt` match your model.

If you tell me your OS and whether you’re using Camo on iPhone + laptop, I can give step‑by‑step for that setup.
