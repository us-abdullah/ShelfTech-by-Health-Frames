/**
 * Get user media (Camo or any camera), capture frames as JPEG for Gemini Live.
 */

export interface VideoDevice {
  deviceId: string;
  label: string;
}

/** List video input devices (e.g. Camo, built-in webcam). Call after user gesture if labels are needed. */
export async function getVideoDevices(): Promise<VideoDevice[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d) => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 8)}` }));
}

/** Get camera stream. Pass deviceId from getVideoDevices() to use a specific camera (e.g. Camo). */
export async function getCameraStream(videoDeviceId?: string): Promise<MediaStream> {
  const videoConstraints: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };
  if (videoDeviceId) {
    // Require this exact device (e.g. Camo) so the browser doesn't use a different camera
    videoConstraints.deviceId = { exact: videoDeviceId };
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: videoConstraints,
    audio: true,
  });
  return stream;
}

/** User-friendly message for getUserMedia errors (e.g. "could not find video source") */
export function getCameraErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No camera found. Connect Camo (phone as camera) or plug in a webcam, then try again.';
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Camera permission denied. Allow camera access for this site and try again.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'Camera is in use by another app. Close other apps using the camera, or try another device.';
      case 'OverconstrainedError':
        return 'Camera doesn\'t support requested settings. Try selecting a different camera (e.g. Camo).';
      case 'SecurityError':
        return 'Camera access is only allowed on HTTPS or localhost.';
      default:
        return err.message || 'Could not access camera.';
    }
  }
  return err instanceof Error ? err.message : 'Could not access camera. Use Camo or allow camera.';
}

/** Capture at full size (for Gemini Live). */
export function captureFrameToJpeg(
  video: HTMLVideoElement,
  quality = 0.5
): string | null {
  if (video.readyState < 2 || video.videoWidth === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  try {
    return canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? null;
  } catch {
    return null;
  }
}

/** Capture at smaller size for faster detection (less data, faster API). */
export function captureFrameToJpegForDetection(
  video: HTMLVideoElement,
  maxSize = 640,
  quality = 0.4
): string | null {
  if (video.readyState < 2 || video.videoWidth === 0) return null;
  const w = video.videoWidth;
  const h = video.videoHeight;
  const scale = maxSize / Math.max(w, h);
  const dw = scale >= 1 ? w : Math.round(w * scale);
  const dh = scale >= 1 ? h : Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h, 0, 0, dw, dh);
  try {
    return canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? null;
  } catch {
    return null;
  }
}
