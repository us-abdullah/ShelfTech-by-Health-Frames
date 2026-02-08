/**
 * Gemini Live API over WebSocket (mirrors VisionClaw iOS GeminiLiveService).
 * Use with Camo camera feed: send JPEG frames + PCM audio; receive audio + tool calls.
 */

const WS_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';

export type ConnectionState = 'disconnected' | 'connecting' | 'settingUp' | 'ready' | 'error';

export interface GeminiLiveCallbacks {
  onStateChange?: (state: ConnectionState, message?: string) => void;
  onAudioReceived?: (pcmBase64: string) => void;
  onInputTranscription?: (text: string) => void;
  onOutputTranscription?: (text: string) => void;
  onToolCall?: (toolCall: { id: string; name: string; args: Record<string, unknown> }) => void;
  onTurnComplete?: () => void;
  onInterrupted?: () => void;
  onDisconnected?: (reason?: string) => void;
}

const EXECUTE_TOOL_DECLARATION = {
  name: 'execute',
  description:
    'Your only way to take action. Use for: sending messages, searching the web, adding to lists, setting reminders, creating notes, research, smart home, app interactions. When in doubt, use this tool.',
  parameters: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description:
          'Clear, detailed description of what to do. Include all relevant context: names, content, platforms, quantities.',
      },
    },
    required: ['task'],
  },
  behavior: 'BLOCKING',
};

const GROCERY_SYSTEM_INSTRUCTION = `You are an AI assistant for someone grocery shopping with a live camera (e.g. phone or AR glasses). You can see through their camera and have a voice conversation.

You help with: identifying products, nutrition questions, dietary restrictions (halal, haram, allergies), comparing prices, and adding items to lists. Keep responses concise and natural.

You have exactly ONE tool: execute. Use it for: adding to shopping lists, searching the web for prices or ingredients, sending messages, reminders, notes, or any persistent action. Always speak a brief acknowledgment before calling execute (e.g. "Sure, adding that to your list." then call execute). Never pretend to do actions yourself.`;

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private callbacks: GeminiLiveCallbacks = {};
  private sendQueue: string[] = [];
  private isModelSpeaking = false;
  private connectTimeoutId: ReturnType<typeof setTimeout> | null = null;

  get speaking(): boolean {
    return this.isModelSpeaking;
  }

  configure(callbacks: GeminiLiveCallbacks): void {
    this.callbacks = callbacks;
  }

  connect(apiKey: string): Promise<boolean> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve(true);
    }
    const url = `${WS_BASE}?key=${encodeURIComponent(apiKey)}`;
    this.callbacks.onStateChange?.('connecting');
    return new Promise((resolve) => {
      let resolved = false;
      const resolveOnce = (ok: boolean) => {
        if (resolved) return;
        resolved = true;
        resolve(ok);
      };
      const ws = new WebSocket(url);
      this.ws = ws;
      this.connectTimeoutId = setTimeout(() => {
        this.connectTimeoutId = null;
        resolveOnce(false);
        this.callbacks.onStateChange?.('error', 'Connection timed out');
        if (this.ws === ws) ws.close();
      }, 15000);

      ws.onopen = () => {
        this.callbacks.onStateChange?.('settingUp');
        this.sendSetup(apiKey);
      };

      ws.onclose = (ev) => {
        this.ws = null;
        this.callbacks.onStateChange?.('disconnected');
        this.callbacks.onDisconnected?.(`Connection closed: ${ev.code} ${ev.reason || ''}`);
        resolveOnce(false);
      };

      ws.onerror = () => {
        this.callbacks.onStateChange?.('error', 'WebSocket error');
        resolveOnce(false);
      };

      ws.onmessage = (event) => {
        try {
          const data = typeof event.data === 'string' ? event.data : '';
          const json = JSON.parse(data) as Record<string, unknown>;
          this.handleMessage(json, resolveOnce);
        } catch {
          // ignore parse errors
        }
      };

      // Timeout: if setupComplete didn't arrive in 15s, fail
      setTimeout(() => {
        resolveOnce(false);
        this.callbacks.onStateChange?.('error', 'Connection timed out');
        if (this.ws === ws) ws.close();
      }, 15000);
    });
  }

  private sendSetup(_apiKey: string): void {
    const setup = {
      setup: {
        model: MODEL,
        generationConfig: {
          responseModalities: ['AUDIO'],
          thinkingConfig: { thinkingBudget: 0 },
        },
        systemInstruction: {
          parts: [{ text: GROCERY_SYSTEM_INSTRUCTION }],
        },
        tools: [{ functionDeclarations: [EXECUTE_TOOL_DECLARATION] }],
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
            endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
            silenceDurationMs: 500,
            prefixPaddingMs: 40,
          },
          activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
          turnCoverage: 'TURN_INCLUDES_ALL_INPUT',
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    };
    this.sendJSON(setup);
  }

  private sendJSON(obj: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.sendQueue.push(JSON.stringify(obj));
      return;
    }
    this.ws.send(JSON.stringify(obj));
  }

  private flushSendQueue(): void {
    while (this.sendQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(this.sendQueue.shift()!);
    }
  }

  private handleMessage(
    json: Record<string, unknown>,
    resolveConnect: (ok: boolean) => void
  ): void {
    if (json.setupComplete != null) {
      if (this.connectTimeoutId != null) {
        clearTimeout(this.connectTimeoutId);
        this.connectTimeoutId = null;
      }
      this.callbacks.onStateChange?.('ready');
      this.flushSendQueue();
      resolveConnect(true);
      return;
    }

    if (json.goAway != null) {
      this.callbacks.onStateChange?.('disconnected');
      this.callbacks.onDisconnected?.('Server closing');
      return;
    }

    const toolCall = json.toolCall as Record<string, unknown> | undefined;
    if (toolCall?.functionCalls != null) {
      const calls = toolCall.functionCalls as Array<{ id: string; name: string; args?: Record<string, unknown> }>;
      for (const c of calls) {
        this.callbacks.onToolCall?.({
          id: c.id,
          name: c.name,
          args: c.args ?? {},
        });
      }
      return;
    }

    const serverContent = json.serverContent as Record<string, unknown> | undefined;
    if (!serverContent) return;

    if (serverContent.interrupted === true) {
      this.isModelSpeaking = false;
      this.callbacks.onInterrupted?.();
      return;
    }

    const modelTurn = serverContent.modelTurn as Record<string, unknown> | undefined;
    if (modelTurn?.parts != null) {
      const parts = modelTurn.parts as Array<Record<string, unknown>>;
      for (const part of parts) {
        const inlineData = part.inlineData as Record<string, unknown> | undefined;
        if (inlineData?.mimeType != null && String(inlineData.mimeType).startsWith('audio/') && typeof inlineData.data === 'string') {
          this.isModelSpeaking = true;
          this.callbacks.onAudioReceived?.(inlineData.data);
        }
        if (typeof part.text === 'string') {
          this.callbacks.onOutputTranscription?.(part.text);
        }
      }
    }

    if (serverContent.turnComplete === true) {
      this.isModelSpeaking = false;
      this.callbacks.onTurnComplete?.();
    }

    const inputTranscription = serverContent.inputTranscription as Record<string, unknown> | undefined;
    if (inputTranscription?.text != null && String(inputTranscription.text).trim() !== '') {
      this.callbacks.onInputTranscription?.(String(inputTranscription.text).trim());
    }
    const outputTranscription = serverContent.outputTranscription as Record<string, unknown> | undefined;
    if (outputTranscription?.text != null && String(outputTranscription.text).trim() !== '') {
      this.callbacks.onOutputTranscription?.(String(outputTranscription.text).trim());
    }
  }

  sendVideoFrame(jpegBase64: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.sendJSON({
      realtimeInput: {
        video: {
          mimeType: 'image/jpeg',
          data: jpegBase64,
        },
      },
    });
  }

  sendAudio(pcmBase64: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.sendJSON({
      realtimeInput: {
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data: pcmBase64,
        },
      },
    });
  }

  sendToolResponse(callId: string, name: string, result: { result?: string; error?: string }): void {
    this.sendJSON({
      toolResponse: {
        functionResponses: [
          {
            id: callId,
            name,
            response: result,
          },
        ],
      },
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.sendQueue = [];
    this.isModelSpeaking = false;
    this.callbacks.onStateChange?.('disconnected');
  }
}
