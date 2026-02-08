/**
 * Map click (clientX, clientY) to video-normalized coords (0-1) and find which item bbox contains the point.
 * Accounts for video element's object-fit: contain (letterboxing).
 */

import type { DetectedItem } from './detection';

export function getVideoNormFromClick(
  video: HTMLVideoElement,
  clientX: number,
  clientY: number
): { x: number; y: number } | null {
  const rect = video.getBoundingClientRect();
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const aspect = vw / vh;
  const elAspect = rect.width / rect.height;

  let contentLeft: number, contentTop: number, contentWidth: number, contentHeight: number;
  if (elAspect > aspect) {
    contentHeight = rect.height;
    contentWidth = rect.height * aspect;
    contentLeft = rect.left + (rect.width - contentWidth) / 2;
    contentTop = rect.top;
  } else {
    contentWidth = rect.width;
    contentHeight = rect.width / aspect;
    contentLeft = rect.left;
    contentTop = rect.top + (rect.height - contentHeight) / 2;
  }

  const x = (clientX - contentLeft) / contentWidth;
  const y = (clientY - contentTop) / contentHeight;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

export function findItemAtPoint(
  items: DetectedItem[],
  normX: number,
  normY: number
): DetectedItem | null {
  const hit: DetectedItem[] = [];
  for (const item of items) {
    const b = item.bbox;
    if (
      normX >= b.x &&
      normX <= b.x + b.width &&
      normY >= b.y &&
      normY <= b.y + b.height
    ) {
      hit.push(item);
    }
  }
  if (hit.length === 0) return null;
  if (hit.length === 1) return hit[0];
  // Prefer smallest bbox (most specific)
  hit.sort((a, b) => a.bbox.width * a.bbox.height - b.bbox.width * b.bbox.height);
  return hit[0];
}
