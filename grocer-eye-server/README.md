# GrocerEye detection server

Uses the [GrocerEye](https://github.com/bhimar/GrocerEye) YOLOv3 model (Freiburg grocery dataset, 25 classes) to detect and box grocery items. The web app sends camera frames here and draws the returned bounding boxes in real time.

## 1. Clone GrocerEye into this project

From the **VisionClaw** repo root:

```bash
git clone https://github.com/bhimar/GrocerEye.git
```

You should have:

- `VisionClaw/GrocerEye/` (the GrocerEye repo)
- `VisionClaw/GrocerEye/darknet_configs/yolov3_custom_test.cfg`
- `VisionClaw/grocer-eye-server/` (this server)

## 2. Get the trained weights

GrocerEye is trained in Colab; the repo does not include the `.weights` file. You need to either:

- **Option A:** Train the model using `GrocerEye_YOLOv3_Darknet.ipynb` in Google Colab (see [GrocerEye README](https://github.com/bhimar/GrocerEye)), then download the final weights.
- **Option B:** If the author or community provides a pre-trained weights link, download it.

Put the weights file at:

```text
VisionClaw/GrocerEye/backup/grocer-eye_final.weights
```

(create the `backup` folder if needed). Or set the path with:

```bash
set GROCER_EYE_WEIGHTS=C:\path\to\your\grocer-eye_final.weights
```

## 3. Install and run the server

```bash
cd VisionClaw/grocer-eye-server
pip install -r requirements.txt
python server.py
```

Server runs at **http://localhost:5000** by default. Check **http://localhost:5000/health** to see if the model loaded.

## 4. Point the web app at the server

In `web/.env` add:

```env
VITE_GROCEREEYE_API_URL=http://localhost:5000
```

Restart `npm run dev`. With the camera on, the app will send frames to this server and use the returned boxes to highlight items (no need to start Gemini Live for boxing).

## Optional

- **Class names:** If your GrocerEye model uses different class names, edit `grocer-eye-server/classes.txt` (one label per line, order must match the model).
- **Confidence:** Set `CONFIDENCE_THRESH=0.5` (default 0.4) to reduce false positives.
- **GrocerEye elsewhere:** Set `GROCER_EYE_DIR` to the path of your GrocerEye clone if it’s not at `VisionClaw/GrocerEye`.
