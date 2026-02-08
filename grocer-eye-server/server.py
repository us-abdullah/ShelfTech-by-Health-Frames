"""
GrocerEye detection server: YOLOv3 (Darknet) inference via OpenCV DNN.
Serves POST /detect with image (JSON body: { "image": "<base64>" }) -> { "items": [{ "label", "bbox": { "x","y","width","height" } }] }.
Expects GrocerEye repo cloned next to this folder (or set GROCER_EYE_DIR) and weights at GrocerEye/backup/grocer-eye_final.weights (or GROCER_EYE_WEIGHTS).
"""
import os
import base64
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Paths: GrocerEye repo (clone https://github.com/bhimar/GrocerEye into VisionClaw/GrocerEye)
ROOT = Path(__file__).resolve().parent
GROCER_EYE_DIR = Path(os.environ.get("GROCER_EYE_DIR", ROOT.parent / "GrocerEye"))
CONFIG = GROCER_EYE_DIR / "darknet_configs" / "yolov3_custom_test.cfg"
WEIGHTS = Path(os.environ.get("GROCER_EYE_WEIGHTS", str(GROCER_EYE_DIR / "backup" / "grocer-eye_final.weights")))
CLASSES_FILE = ROOT / "classes.txt"
CONFIDENCE_THRESH = float(os.environ.get("CONFIDENCE_THRESH", "0.4"))
INPUT_SIZE = 416  # YOLOv3 common size

net = None
class_names = []


def load_classes():
    global class_names
    if CLASSES_FILE.exists():
        with open(CLASSES_FILE) as f:
            class_names = [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]
    else:
        # Fallback 25 classes (Freiburg-style)
        class_names = [
            "beans", "candy", "cereal", "chocolate", "coffee", "corn", "jam", "juice", "milk", "noodles",
            "oil", "pasta", "rice", "soda", "tea", "vinegar", "water", "apple", "banana", "bread",
            "butter", "cheese", "egg", "yogurt", "soup",
        ][:25]
    return class_names


def load_net():
    global net
    if net is not None:
        return True
    if not CONFIG.exists():
        print(f"Config not found: {CONFIG}", file=sys.stderr)
        print("Clone GrocerEye into VisionClaw/GrocerEye and ensure darknet_configs/yolov3_custom_test.cfg exists.", file=sys.stderr)
        return False
    if not Path(WEIGHTS).exists():
        print(f"Weights not found: {WEIGHTS}", file=sys.stderr)
        print("Train in GrocerEye Colab notebook or download weights to GrocerEye/backup/grocer-eye_final.weights", file=sys.stderr)
        return False
    load_classes()
    net = cv2.dnn.readNetFromDarknet(str(CONFIG), str(WEIGHTS))
    net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
    net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
    return True


def _sigmoid(x):
    return 1 / (1 + np.exp(-np.clip(x, -500, 500)))


def detect(image_bgr):
    h, w = image_bgr.shape[:2]
    blob = cv2.dnn.blobFromImage(image_bgr, 1 / 255.0, (INPUT_SIZE, INPUT_SIZE), swapRB=True, crop=False)
    net.setInput(blob)
    layer_names = net.getLayerNames()
    out_layers = net.getUnconnectedOutLayers()
    if hasattr(out_layers, "flatten"):
        output_layers = [layer_names[i - 1] for i in out_layers.flatten()]
    else:
        output_layers = [layer_names[i - 1] for i in out_layers]
    outputs = net.forward(output_layers)

    boxes = []
    confidences = []
    class_ids = []
    # YOLOv3 OpenCV: each output (1, 90, grid_h, grid_w). Network input is 416×416; decode in 416 space then normalize 0-1.
    for output in outputs:
        if output.shape[1] != 90:
            continue
        grid_h, grid_w = int(output.shape[2]), int(output.shape[3])
        stride_x = INPUT_SIZE / grid_w
        stride_y = INPUT_SIZE / grid_h
        for iy in range(grid_h):
            for ix in range(grid_w):
                for anchor in range(3):
                    base = anchor * 30
                    tx = float(output[0, base + 0, iy, ix])
                    ty = float(output[0, base + 1, iy, ix])
                    tw = float(output[0, base + 2, iy, ix])
                    th = float(output[0, base + 3, iy, ix])
                    obj = _sigmoid(float(output[0, base + 4, iy, ix]))
                    scores = _sigmoid(output[0, base + 5 : base + 30, iy, ix])
                    class_id = int(np.argmax(scores))
                    conf = obj * float(scores[class_id])
                    if conf < CONFIDENCE_THRESH:
                        continue
                    cx_416 = (ix + _sigmoid(tx)) * stride_x
                    cy_416 = (iy + _sigmoid(ty)) * stride_y
                    bw_416 = np.exp(tw) * stride_x
                    bh_416 = np.exp(th) * stride_y
                    x_n = max(0, min(1, (cx_416 - bw_416 / 2) / INPUT_SIZE))
                    y_n = max(0, min(1, (cy_416 - bh_416 / 2) / INPUT_SIZE))
                    bw_n = max(0.01, min(1, bw_416 / INPUT_SIZE))
                    bh_n = max(0.01, min(1, bh_416 / INPUT_SIZE))
                    boxes.append([x_n, y_n, bw_n, bh_n])
                    confidences.append(conf)
                    class_ids.append(class_id)

    if not boxes:
        return []

    # NMS in pixel space
    indices = cv2.dnn.NMSBoxes(
        [[b[0] * w, b[1] * h, b[2] * w, b[3] * h] for b in boxes],
        confidences,
        CONFIDENCE_THRESH,
        0.4,
    )
    if hasattr(indices, "flatten"):
        indices = indices.flatten()
    else:
        indices = [] if len(indices) == 0 else indices[0]

    out = []
    for i in indices:
        x, y, bw_n, bh_n = boxes[i]
        label = class_names[class_ids[i]] if class_ids[i] < len(class_names) else f"class_{class_ids[i]}"
        out.append({
            "label": label,
            "bbox": {"x": round(x, 4), "y": round(y, 4), "width": round(bw_n, 4), "height": round(bh_n, 4)},
        })
    return out


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model_loaded": load_net()})


@app.route("/detect", methods=["POST"])
def run_detect():
    if not load_net():
        return jsonify({"error": "Model not loaded. Check GrocerEye path and weights."}), 503
    data = request.get_json(force=True, silent=True) or {}
    image_b64 = data.get("image")
    if not image_b64:
        return jsonify({"error": "Missing 'image' (base64 JPEG)."}), 400
    try:
        raw = base64.b64decode(image_b64)
        buf = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        if img is None:
            return jsonify({"error": "Invalid image."}), 400
        items = detect(img)
        return jsonify({"items": items})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"GrocerEye server starting on port {port}. GrocerEye dir: {GROCER_EYE_DIR}")
    if load_net():
        print("Model loaded.")
    else:
        print("Model not loaded; /detect will return 503 until config and weights are in place.")
    app.run(host="0.0.0.0", port=port, threaded=True)
