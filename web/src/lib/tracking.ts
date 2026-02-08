/**
 * Match and smooth detections across frames so boxes follow items as the camera moves.
 */

import type { BoundingBox, DetectedItem } from './detection';

export function iou(a: BoundingBox, b: BoundingBox): number {
  const ax1 = a.x;
  const ay1 = a.y;
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx1 = b.x;
  const by1 = b.y;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const inter = (ix2 - ix1) * (iy2 - iy1);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - inter;
  return union <= 0 ? 0 : inter / union;
}

export function lerpBbox(a: BoundingBox, b: BoundingBox, t: number): BoundingBox {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    width: a.width + (b.width - a.width) * t,
    height: a.height + (b.height - a.height) * t,
  };
}

const MATCH_IOU_THRESH = 0.15;
const LERP_SPEED = 0.18;
/** When camera is still, new bbox is almost the same as current → freeze position and label to avoid jitter/flicker */
const STABILITY_IOU = 0.82;

/** Generic labels that we should replace when we get a more specific detection (e.g. "boxes" → "canned fish"). */
const GENERIC_LABELS = new Set(['box', 'boxes', 'bottle', 'bottles', 'can', 'cans', 'container', 'containers', 'item', 'items']);

function isGenericLabel(label: string): boolean {
  const lower = label.toLowerCase().trim();
  return GENERIC_LABELS.has(lower) || lower.length <= 3;
}

function isMoreSpecificThan(prevLabel: string, newLabel: string): boolean {
  if (!isGenericLabel(prevLabel)) return false;
  if (isGenericLabel(newLabel)) return false;
  return newLabel.length >= prevLabel.length || newLabel.split(/\s+/).length > 1;
}

/**
 * Merge new API detections with previous displayed items: match by IoU, lerp positions so boxes follow.
 * Keeps previous label on match (stops flicker) unless the new label is more specific (e.g. "boxes" → "canned fish").
 */
export function mergeWithPrevious(
  displayed: DetectedItem[],
  target: DetectedItem[],
  lerpT = 0.35
): DetectedItem[] {
  const used = new Set<number>();
  const out: DetectedItem[] = [];

  for (const t of target) {
    let bestIdx = -1;
    let bestIou = MATCH_IOU_THRESH;
    for (let i = 0; i < displayed.length; i++) {
      if (used.has(i)) continue;
      const o = iou(displayed[i].bbox, t.bbox);
      if (o > bestIou) {
        bestIou = o;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      used.add(bestIdx);
      const prev = displayed[bestIdx];
      const useNewLabel = isMoreSpecificThan(prev.label, t.label);
      const stableLabel = useNewLabel ? t.label : prev.label;
      const stableBbox = bestIou >= STABILITY_IOU ? prev.bbox : lerpBbox(prev.bbox, t.bbox, lerpT);
      out.push({ label: stableLabel, bbox: stableBbox });
    } else {
      out.push({ label: t.label, bbox: { ...t.bbox } });
    }
  }

  return out;
}

/**
 * Move displayed items toward target items (one step of smooth follow).
 * Keeps displayed label (no flicker) and freezes position when already very close (camera still).
 */
export function stepDisplayedTowardTarget(
  displayed: DetectedItem[],
  target: DetectedItem[],
  lerpT = LERP_SPEED
): DetectedItem[] {
  const used = new Set<number>();
  const out: DetectedItem[] = [];

  for (const d of displayed) {
    let bestIdx = -1;
    let bestIou = 0.05;
    for (let i = 0; i < target.length; i++) {
      if (used.has(i)) continue;
      const o = iou(d.bbox, target[i].bbox);
      if (o > bestIou) {
        bestIou = o;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      used.add(bestIdx);
      const t = target[bestIdx];
      const overlap = iou(d.bbox, t.bbox);
      const bbox = overlap >= STABILITY_IOU ? d.bbox : lerpBbox(d.bbox, t.bbox, lerpT);
      const useNewLabel = isMoreSpecificThan(d.label, t.label);
      out.push({ label: useNewLabel ? t.label : d.label, bbox });
    }
  }

  for (let i = 0; i < target.length; i++) {
    if (used.has(i)) continue;
    out.push({ label: target[i].label, bbox: { ...target[i].bbox } });
  }

  return out;
}
