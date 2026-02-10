import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCameraStream, getVideoDevices, getCameraErrorMessage, captureFrameToJpeg, captureFrameToJpegForDetection } from './lib/camera';
import { detectItemsInImage, type DetectedItem } from './lib/detection';
import { mergeWithPrevious, stepDisplayedTowardTarget } from './lib/tracking';
import { type ItemDetails } from './lib/itemDetails';
import { fetchItemDetailsFromGemini } from './lib/itemDetailsApi';
import { askGeminiAboutProduct } from './lib/voiceQuestion';
import { getVideoNormFromClick, findItemAtPoint } from './lib/hitTest';
import { getOverlaySnippet } from './lib/overlayRelevance';
import { fetchOverlayRelevance } from './lib/overlayRelevanceApi';
import type { PersonProfile } from './lib/rag';
import { PRESET_PROFILES } from './lib/rag';
import { env, isGrocerEyeConfigured, isDedalusApiKey } from './lib/env';
import { isDedalusBackoff, DEDALUS_BACKOFF_MS, setDedalus429 } from './lib/dedalusRateLimit';
import { OverlayCanvas } from './components/OverlayCanvas';
import { ItemDetailPanel } from './components/ItemDetailPanel';
import { VoiceAnswerPopup } from './components/VoiceAnswerPopup';
import { ProfilesPanel } from './components/ProfilesPanel';
import { HealthActionPanel } from './components/HealthActionPanel';
import { CopilotNotification } from './components/CopilotNotification';

// Detection frequency: keep Dedalus under RPM limit (429); Google free tier strict; GrocerEye local.
const DETECTION_INTERVAL_DEDALUS_MS = 4500; // ~13/min to leave headroom for overlay + details
const DETECTION_INTERVAL_GEMINI_MS = 10000;
const DETECTION_INTERVAL_GROCEREEYE_MS = 1500;

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [cameraSource, setCameraSource] = useState<'phone' | 'rayban'>('phone');
  const [metaGlassesConnected, setMetaGlassesConnected] = useState(false);
  const [raybanVideoUrl, setRaybanVideoUrl] = useState<string | null>(null);
  const raybanVideoUrlRef = useRef<string | null>(null);
  const [currentProfile, setCurrentProfile] = useState<PersonProfile | null>(() => PRESET_PROFILES[0] ?? null);
  const [showProfiles, setShowProfiles] = useState(false);
  const [notification, setNotification] = useState('');
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
  const [displayedItems, setDisplayedItems] = useState<DetectedItem[]>([]);
  const targetItemsRef = useRef<DetectedItem[]>([]);
  const [focusedItem, setFocusedItem] = useState<string | null>(null);
  const [itemDetails, setItemDetails] = useState<ItemDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [voicePopup, setVoicePopup] = useState<{ question: string; answer: string; productName: string } | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [overlayRelevanceMap, setOverlayRelevanceMap] = useState<Record<string, string>>({});

  const detectionTimerRef = useRef<number>(0);
  const displayedItemsRef = useRef<DetectedItem[]>([]);
  const lastAutoSelectedSingleRef = useRef<string | null>(null);
  displayedItemsRef.current = displayedItems;

  const hasActiveVideo = Boolean(stream || (cameraSource === 'rayban' && raybanVideoUrl));

  const overlaySnippets = useMemo(() => {
    const out: Record<string, ReturnType<typeof getOverlaySnippet>> = {};
    for (const item of displayedItems) {
      out[item.label] = getOverlaySnippet(item.label, currentProfile, overlayRelevanceMap[item.label]);
    }
    return out;
  }, [displayedItems, currentProfile, overlayRelevanceMap]);

  useEffect(() => {
    if (!currentProfile) {
      setOverlayRelevanceMap({});
      return () => {};
    }
    const OVERLAY_RELEVANCE_INTERVAL_MS = isDedalusApiKey(env.geminiApiKey) ? 8000 : 2500;
    const tick = () => {
      if (isDedalusApiKey(env.geminiApiKey) && isDedalusBackoff(DEDALUS_BACKOFF_MS)) return;
      const items = displayedItemsRef.current;
      const labels = [...new Set(items.map((i) => i.label))];
      if (labels.length > 0) fetchOverlayRelevance(labels, currentProfile).then(setOverlayRelevanceMap);
    };
    tick();
    const id = window.setInterval(tick, OVERLAY_RELEVANCE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [currentProfile]);

  const refreshVideoDevices = useCallback(async () => {
    setError(null);
    try {
      const devices = await getVideoDevices();
      setVideoDevices(devices);
      if (devices.length > 0) {
        const currentStillValid = selectedVideoId && devices.some((d) => d.deviceId === selectedVideoId);
        if (currentStillValid) return;
        if (cameraSource === 'rayban') {
          const glassesLike = devices.find((d) => /camo|meta|ray.?ban|ray ban|glasses/i.test(d.label));
          setSelectedVideoId(glassesLike?.deviceId ?? devices[0].deviceId);
        } else {
          setSelectedVideoId(devices[0].deviceId);
        }
      } else {
        setSelectedVideoId('');
      }
    } catch (e) {
      setError(getCameraErrorMessage(e));
    }
  }, [selectedVideoId, cameraSource]);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      if (videoDevices.length > 0 && !selectedVideoId) {
        setError('Select a camera from the list above first.');
        return;
      }
      const s = await getCameraStream(selectedVideoId || undefined);
      setStream(s);
    } catch (e) {
      setError(getCameraErrorMessage(e));
    }
  }, [selectedVideoId, videoDevices.length]);

  // Attach video source: live stream or uploaded Ray-Ban video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hasActiveVideo) return;
    if (stream) {
      video.srcObject = stream;
      video.src = '';
      video.play().catch((e) => console.warn('Video play failed:', e));
      return () => {
        video.srcObject = null;
      };
    }
    if (raybanVideoUrl) {
      video.srcObject = null;
      video.src = raybanVideoUrl;
      video.loop = true;
      video.play().catch((e) => console.warn('Video play failed:', e));
      return () => {
        video.src = '';
      };
    }
  }, [stream, raybanVideoUrl, hasActiveVideo]);

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    if (raybanVideoUrlRef.current) {
      URL.revokeObjectURL(raybanVideoUrlRef.current);
      raybanVideoUrlRef.current = null;
    }
    setRaybanVideoUrl(null);
    setDetectedItems([]);
    setDisplayedItems([]);
    targetItemsRef.current = [];
    setFocusedItem(null);
    setItemDetails(null);
  }, [stream]);

  // Run detection when we have an active video (live stream or uploaded Ray-Ban video) and GrocerEye/Gemini
  const detectionActive = Boolean(hasActiveVideo && (isGrocerEyeConfigured() || env.geminiApiKey));
  const [detectionError, setDetectionError] = useState<string | null>(null);
  useEffect(() => {
    if (!detectionActive) return;
    const video = videoRef.current;
    if (!video) return;
    setDetectionError(null);
    const runDetection = async () => {
      if (!isGrocerEyeConfigured() && isDedalusBackoff(DEDALUS_BACKOFF_MS)) {
        return; // skip while in 429 backoff (Dedalus rate limit)
      }
      const jpeg = isGrocerEyeConfigured()
        ? captureFrameToJpeg(video)
        : captureFrameToJpegForDetection(video, 640, 0.4);
      if (!jpeg) return;
      try {
        const items = await detectItemsInImage(jpeg, env.geminiApiKey);
        setDetectedItems(items);
        targetItemsRef.current = items;
        setDisplayedItems((prev) => mergeWithPrevious(prev, items));
      } catch (e) {
        setDetectedItems([]);
        targetItemsRef.current = [];
        setDisplayedItems([]);
        const msg = e instanceof Error ? e.message : 'Detection failed';
        setDetectionError(msg.includes('429') ? 'Dedalus rate limit (429). Pausing 45s.' : msg);
        if (msg.includes('429') || msg.includes('rate limit') || msg.includes('Too Many')) {
          setDedalus429();
        }
      }
    };
    const intervalMs = isGrocerEyeConfigured()
      ? DETECTION_INTERVAL_GROCEREEYE_MS
      : isDedalusApiKey(env.geminiApiKey)
        ? DETECTION_INTERVAL_DEDALUS_MS
        : DETECTION_INTERVAL_GEMINI_MS;
    runDetection();
    detectionTimerRef.current = window.setInterval(runDetection, intervalMs) as unknown as number;
    return () => {
      if (detectionTimerRef.current) clearInterval(detectionTimerRef.current);
    };
  }, [detectionActive, hasActiveVideo]);

  // Smooth follow: every frame lerp displayed boxes toward latest detection so boxes stay on items as camera moves
  useEffect(() => {
    if (!detectionActive) return;
    let rafId: number;
    const tick = () => {
      setDisplayedItems((prev) => stepDisplayedTowardTarget(prev, targetItemsRef.current));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [detectionActive]);

  const showItemDetails = useCallback((label: string, imageBase64?: string) => {
    setFocusedItem(label);
    setItemDetails({ name: label });
    setDetailsLoading(true);
    fetchItemDetailsFromGemini(label, currentProfile, imageBase64)
      .then(setItemDetails)
      .catch(() => setItemDetails((prev) => prev ?? { name: label }))
      .finally(() => setDetailsLoading(false));
  }, [currentProfile]);

  const showItemDetailsRef = useRef(showItemDetails);
  showItemDetailsRef.current = showItemDetails;

  // When only one item is in frame, auto-select it and run Gemini analysis (as if user clicked it)
  useEffect(() => {
    if (!detectionActive) {
      lastAutoSelectedSingleRef.current = null;
      return () => {};
    }
    const AUTO_SINGLE_INTERVAL_MS = 1400;
    const id = window.setInterval(() => {
      const items = displayedItemsRef.current;
      if (items.length !== 1) {
        lastAutoSelectedSingleRef.current = null;
        return;
      }
      const label = items[0].label;
      if (lastAutoSelectedSingleRef.current === label) return;
      lastAutoSelectedSingleRef.current = label;
      const video = videoRef.current;
      const snapshot = video ? captureFrameToJpeg(video, 0.65) : undefined;
      showItemDetailsRef.current(label, snapshot ?? undefined);
    }, AUTO_SINGLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [detectionActive]);

  const handleVideoClick = useCallback(
    (e: React.MouseEvent) => {
      const video = videoRef.current;
      if (!video || !displayedItems.length) return;
      const norm = getVideoNormFromClick(video, e.clientX, e.clientY);
      if (!norm) return;
      const item = findItemAtPoint(displayedItems, norm.x, norm.y);
      if (item) {
        const snapshot = captureFrameToJpeg(video, 0.65);
        showItemDetails(item.label, snapshot ?? undefined);
      }
    },
    [displayedItems, showItemDetails]
  );

  const voiceGotResultRef = useRef(false);
  const startVoiceQuestion = useCallback(async () => {
    const productName = itemDetails?.name ?? focusedItem ?? 'No product selected';
    const SpeechRecognitionAPI =
      (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;
    if (!SpeechRecognitionAPI) {
      setNotification('Voice not supported. Use Chrome, Edge, or Safari.');
      return;
    }
    if (!env.dedalusVoiceApiKey) {
      setNotification('Set VITE_GEMINI_API_KEY or VITE_DEDALUS_VOICE_API_KEY for voice answers');
      return;
    }
    voiceGotResultRef.current = false;
    setVoiceListening(true);
    setNotification('Listening… say your question now.');
    const rec = new SpeechRecognitionAPI();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.maxAlternatives = 3;
    return new Promise<void>((resolve) => {
      rec.onresult = (event: SpeechRecognitionEvent) => {
        const results = event.results;
        if (!results?.length) return;
        const last = results[results.length - 1];
        if (!last.isFinal) return;
        const transcript = last[0]?.transcript?.trim() ?? '';
        if (!transcript) return;
        voiceGotResultRef.current = true;
        setVoiceListening(false);
        setNotification('');
        setVoiceLoading(true);
        askGeminiAboutProduct(transcript, productName, currentProfile)
          .then((answer) => {
            setVoicePopup({ question: transcript, answer, productName });
            setItemDetails((prev) => (prev ? { ...prev, voiceAnswer: answer } : null));
          })
          .catch((err) => setNotification(err instanceof Error ? err.message : 'Voice answer failed'))
          .finally(() => {
            setVoiceLoading(false);
            resolve();
          });
      };
      rec.onerror = (event: Event & { error?: string }) => {
        const err = (event as { error?: string }).error;
        setVoiceListening(false);
        setNotification(
          err === 'not-allowed'
            ? 'Microphone blocked. Allow mic access and try again.'
            : err === 'no-speech'
              ? 'No speech heard. Tap the button and ask your question clearly.'
              : err === 'network'
                ? 'Network error. Check connection and try again.'
                : err === 'audio-capture'
                  ? 'Microphone not available.'
                  : err
                    ? `Voice error: ${err}`
                    : 'Voice failed. Try again.'
        );
        resolve();
      };
      rec.onend = () => {
        setVoiceListening(false);
        if (!voiceGotResultRef.current) {
          setNotification('No speech detected. Tap the mic and ask your question clearly.');
        }
        resolve();
      };
      try {
        rec.start();
      } catch (e) {
        setVoiceListening(false);
        setNotification('Could not start microphone. Allow mic access and try again.');
        resolve();
      }
    });
  }, [itemDetails?.name, focusedItem, currentProfile]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  // When leaving Ray-Ban mode, clear uploaded video and revoke URL
  useEffect(() => {
    if (cameraSource !== 'rayban') {
      if (raybanVideoUrlRef.current) {
        URL.revokeObjectURL(raybanVideoUrlRef.current);
        raybanVideoUrlRef.current = null;
      }
      setRaybanVideoUrl(null);
    }
  }, [cameraSource]);

  const handleRaybanVideoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('video/')) return;
    if (raybanVideoUrlRef.current) URL.revokeObjectURL(raybanVideoUrlRef.current);
    const url = URL.createObjectURL(file);
    raybanVideoUrlRef.current = url;
    setRaybanVideoUrl(url);
  }, []);

  // When switching to Ray-Ban, simulate "connecting" then "connected" for demo
  useEffect(() => {
    if (cameraSource !== 'rayban') {
      setMetaGlassesConnected(false);
      return () => {};
    }
    setMetaGlassesConnected(false);
    const t = window.setTimeout(() => setMetaGlassesConnected(true), 2200);
    return () => clearTimeout(t);
  }, [cameraSource]);

  useEffect(() => {
    document.title = cameraSource === 'rayban' ? 'VisionClaw for Meta – Live from glasses' : 'VisionClaw Grocery – Live AR';
    return () => { document.title = 'VisionClaw Grocery – Live AR'; };
  }, [cameraSource]);

  const [videoSize, setVideoSize] = useState({ w: 1280, h: 720 });
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onResize = () => setVideoSize({ w: v.videoWidth || 1280, h: v.videoHeight || 720 });
    v.addEventListener('loadedmetadata', onResize);
    v.addEventListener('loadeddata', onResize);
    onResize();
    return () => {
      v.removeEventListener('loadedmetadata', onResize);
      v.removeEventListener('loadeddata', onResize);
    };
  }, [stream, raybanVideoUrl, hasActiveVideo]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {!hasActiveVideo ? (
        <div style={{ textAlign: 'center', padding: 24, maxWidth: 480, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: '#888', marginRight: 4 }}>Source</span>
            <button
              type="button"
              onClick={() => setCameraSource('phone')}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                background: cameraSource === 'phone' ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.08)',
                color: cameraSource === 'phone' ? '#00ff88' : '#aaa',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Phone / Webcam
            </button>
            <button
              type="button"
              onClick={() => setCameraSource('rayban')}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                background: cameraSource === 'rayban' ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.08)',
                color: cameraSource === 'rayban' ? '#00ff88' : '#aaa',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Ray-Ban Meta
            </button>
          </div>
          {cameraSource === 'rayban' ? (
            <>
              <div style={{ textAlign: 'left', marginBottom: 16, padding: 12, background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)', borderRadius: 12, fontSize: 12, color: '#ccc', lineHeight: 1.5 }}>
                <strong style={{ color: '#00ff88' }}>Ray-Ban Meta — upload glasses video</strong>
                <p style={{ margin: '6px 0 0 0' }}>Same models and APIs as on desktop—detection, boxes, overlays, health panel, and details all run in the cloud. No power drop on phone.</p>
                <p style={{ margin: '8px 0 0 0', fontSize: 11, color: '#00ff88' }}>On phone: open this site, tap below, pick the video from your gallery. Playback gets boxes + overlays + left/right panels.</p>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'inline-block', padding: '14px 24px', background: 'rgba(84, 255, 175, 0.25)', color: '#999', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: '2px solid #00ff88', minHeight: 44, boxSizing: 'border-box', lineHeight: 1.2 }}>
                  Upload glasses video
                  <input type="file" accept="video/*" onChange={handleRaybanVideoUpload} style={{ display: 'none' }} aria-label="Upload video from glasses" />
                </label>
                <p style={{ margin: '8px 0 0 0', fontSize: 11, color: '#888' }}>Works on phone: choose from Photo Library. Or use a camera below on desktop.</p>
              </div>
            </>
          ) : (
            <p style={{ marginBottom: 16 }}>Click &quot;Refresh camera list&quot;, select <strong>Camo</strong> (or your webcam), then &quot;Start camera&quot;.</p>
          )}
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              onClick={refreshVideoDevices}
              style={{
                padding: '8px 16px',
                background: 'rgba(255,255,255,0.1)',
                color: '#fff',
                border: '1px solid #666',
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              Refresh camera list
            </button>
            {videoDevices.length > 0 && (
              <>
                <label style={{ display: 'block', textAlign: 'left', fontSize: 11, color: '#888', marginTop: 12, marginBottom: 4 }}>
                  {cameraSource === 'rayban' ? 'Glasses feed (e.g. Camo from phone with Meta View)' : 'Camera'}
                </label>
                <select
                  value={selectedVideoId}
                  onChange={(e) => setSelectedVideoId(e.target.value)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: 10,
                    marginTop: 4,
                    background: '#222',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: 8,
                  }}
                >
                  {videoDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={startCamera}
            style={{
              padding: '12px 24px',
              background: '#00ff88',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              fontWeight: 'bold',
            }}
          >
            Start camera
          </button>
          {error && <p style={{ color: '#ff8866', marginTop: 16, textAlign: 'left' }}>{error}</p>}
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
          <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <OverlayCanvas
              width={videoSize.w}
              height={videoSize.h}
              items={displayedItems}
              focusedLabel={focusedItem}
              snippets={overlaySnippets}
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            style={{ position: 'absolute', inset: 0, cursor: 'pointer', pointerEvents: 'auto' }}
            onClick={handleVideoClick}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLElement).click()}
            aria-label="Click a product box to see details"
          />
          {/* Meta glasses mode: LIVE badge + subtle POV vignette */}
          {cameraSource === 'rayban' && (
            <>
              <div
                style={{
                  position: 'absolute',
                  top: 52,
                  right: 16,
                  zIndex: 14,
                  pointerEvents: 'none',
                  padding: '4px 10px',
                  background: 'rgba(0,0,0,0.6)',
                  border: '1px solid rgba(0,255,136,0.5)',
                  borderRadius: 20,
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#00ff88',
                  letterSpacing: '0.1em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#00ff88', animation: raybanVideoUrl ? 'none' : 'pulse 1.5s ease-in-out infinite' }} />
                {raybanVideoUrl ? 'GLASSES' : 'LIVE'}
              </div>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 5,
                  pointerEvents: 'none',
                  background: 'radial-gradient(ellipse 85% 80% at 50% 50%, transparent 50%, rgba(0,0,0,0.25) 100%)',
                }}
              />
            </>
          )}
          {currentProfile && (
            <HealthActionPanel itemDetails={itemDetails} currentProfile={currentProfile} />
          )}
          {/* Top bar: camera source + profile */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 15,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              pointerEvents: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {cameraSource === 'rayban' ? (
                <>
                  <span style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Source</span>
                  {raybanVideoUrl ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff88' }} />
                      <span style={{ fontSize: 12, color: '#00ff88', fontWeight: 600 }}>Playing glasses video</span>
                    </span>
                  ) : !metaGlassesConnected ? (
                    <span style={{ fontSize: 12, color: '#ffaa00' }}>Connecting to Ray-Ban Meta…</span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 8px #00ff88', animation: 'pulse 1.5s ease-in-out infinite' }} />
                      <span style={{ fontSize: 12, color: '#00ff88', fontWeight: 600 }}>Live from Ray-Ban Meta</span>
                      <span style={{ fontSize: 11, color: '#888' }}>Battery 87%</span>
                    </span>
                  )}
                </>
              ) : (
                <span style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Camera</span>
              )}
              <button
                type="button"
                onClick={() => setCameraSource('phone')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: cameraSource === 'phone' ? 'rgba(0,255,136,0.25)' : 'rgba(255,255,255,0.08)',
                  color: cameraSource === 'phone' ? '#00ff88' : '#aaa',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Phone
              </button>
              <button
                type="button"
                onClick={() => setCameraSource('rayban')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: cameraSource === 'rayban' ? 'rgba(0,255,136,0.25)' : 'rgba(255,255,255,0.08)',
                  color: cameraSource === 'rayban' ? '#00ff88' : '#aaa',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Ray-Ban Meta
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={stopCamera}
                style={{
                  padding: '6px 14px',
                  background: 'rgba(120,0,0,0.4)',
                  color: '#ffaaaa',
                  border: '1px solid rgba(255,100,100,0.3)',
                  borderRadius: 10,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Stop camera
              </button>
              <button
                type="button"
                onClick={() => setShowProfiles(true)}
                style={{
                  padding: '8px 14px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10,
                  color: '#e0e0e0',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {currentProfile?.name ?? 'Who\'s shopping?'}
              </button>
            </div>
          </div>
          <ItemDetailPanel
            details={itemDetails}
            onClose={() => { setItemDetails(null); setFocusedItem(null); }}
            onAskVoice={startVoiceQuestion}
            isVoiceLoading={voiceListening || voiceLoading}
            detailsLoading={detailsLoading}
            currentProfile={currentProfile}
          />
          {/* Always show detection panel when camera is on so user sees boxes/data status */}
          {showProfiles && (
            <ProfilesPanel
              currentProfile={currentProfile}
              onSelectProfile={(p) => { setCurrentProfile(p); setShowProfiles(false); }}
              onClose={() => setShowProfiles(false)}
            />
          )}
          {!itemDetails && (
            <div
              style={{
                position: 'absolute',
                left: 16,
                bottom: 80,
                width: 220,
                background: 'rgba(18,20,24,0.78)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: 12,
                borderRadius: 16,
                maxHeight: 180,
                overflow: 'auto',
                zIndex: 10,
              }}
            >
              <div style={{ fontSize: 11, color: '#00ff88', marginBottom: 6 }}>
                {cameraSource === 'rayban'
                  ? (detectionActive
                    ? (raybanVideoUrl ? `Glasses video · ${detectedItems.length} items` : `Companion · from Ray-Ban Meta · ${detectedItems.length} items`)
                    : 'Companion · waiting for feed or upload…')
                  : detectionActive
                    ? `${isGrocerEyeConfigured() ? 'GrocerEye' : isDedalusApiKey(env.geminiApiKey) ? 'Dedalus' : 'Gemini'} · ${detectedItems.length} items`
                    : 'Detection off'}
              </div>
              {!detectionActive && cameraSource !== 'rayban' && (
                <div style={{ fontSize: 11, color: '#888' }}>Set GrocerEye URL or Gemini API key in .env</div>
              )}
              {cameraSource === 'rayban' && detectionActive && (
                <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>Receiving live view from glasses</div>
              )}
              {detectionError && (
                <div style={{ fontSize: 11, color: '#ff8866', marginBottom: 6 }}>{detectionError}</div>
              )}
              {detectionActive && displayedItems.length === 0 && !detectionError && (
                <div style={{ fontSize: 12, color: '#888' }}>Point camera at products…</div>
              )}
              {displayedItems.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Tap to focus</div>
                  {displayedItems.slice(0, 8).map((item, i) => (
                    <button
                      type="button"
                      key={`${item.label}-${i}`}
                      onClick={() => {
                      const video = videoRef.current;
                      const snapshot = video ? captureFrameToJpeg(video, 0.65) : undefined;
                      showItemDetails(item.label, snapshot ?? undefined);
                    }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '4px 8px',
                        marginBottom: 2,
                        background: focusedItem === item.label ? '#00ff88' : 'transparent',
                        color: focusedItem === item.label ? '#000' : '#fff',
                        border: 'none',
                        borderRadius: 4,
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
          {voicePopup && (
            <VoiceAnswerPopup
              question={voicePopup.question}
              answer={voicePopup.answer}
              productName={voicePopup.productName}
              onClose={() => setVoicePopup(null)}
            />
          )}
          <CopilotNotification message={notification} />
        </>
      )}
    </div>
  );
}
