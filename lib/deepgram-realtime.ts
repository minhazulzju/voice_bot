type TranscriptHandler = (text: string, isFinal: boolean) => void;

interface DeepgramRealtimeOptions {
  apiKey: string;
  model?: string;
  endpointingMs?: number;
  sampleRate?: number;
  onTranscript: TranscriptHandler;
  onOpen?: () => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export class DeepgramRealtimeClient {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private isConnected = false;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpointingMs: number;
  private readonly sampleRate: number;
  private readonly onTranscript: TranscriptHandler;
  private readonly onOpen?: () => void;
  private readonly onError?: (error: Error) => void;
  private readonly onClose?: () => void;

  constructor(options: DeepgramRealtimeOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model || 'nova-2-general';
    this.endpointingMs = options.endpointingMs ?? 500;
    this.sampleRate = options.sampleRate ?? 24000;
    this.onTranscript = options.onTranscript;
    this.onOpen = options.onOpen;
    this.onError = options.onError;
    this.onClose = options.onClose;
  }

  async connect() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.sampleRate,
      });

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: this.sampleRate,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const url = `wss://api.deepgram.com/v1/listen?model=${encodeURIComponent(
        this.model
      )}&encoding=linear16&sample_rate=${this.sampleRate}&endpointing=${this.endpointingMs}&api_key=${encodeURIComponent(
        this.apiKey
      )}`;

      // Deepgram WebSocket connection with API key in query params
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.addEventListener('open', this.handleOpen);
      this.ws.addEventListener('message', this.handleMessage);
      this.ws.addEventListener('error', this.handleError);
      this.ws.addEventListener('close', this.handleClose);
    } catch (error) {
      console.error('Deepgram connect failed', error);
      this.onError?.(error as Error);
    }
  }

  getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  disconnect() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.isConnected = false;
  }

  private handleOpen = () => {
    console.log('Deepgram WebSocket connected successfully');
    this.isConnected = true;
    this.setupAudioPipeline();
    this.onOpen?.();
  };

  private handleMessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);

      // Deepgram returns Results messages containing transcripts.
      if (data.type === 'Results' && data.channel?.alternatives?.length) {
        const alt = data.channel.alternatives[0];
        const transcript: string = alt.transcript || '';
        if (transcript) {
          this.onTranscript(transcript, Boolean(data.is_final));
        }
      }
    } catch (error) {
      console.error('Failed to parse Deepgram message', error);
    }
  };

  private handleError = () => {
    console.error('Deepgram WebSocket error - check API key validity');
    this.onError?.(new Error('Deepgram WebSocket error'));
  };

  private handleClose = () => {
    console.log('Deepgram WebSocket disconnected');
    this.isConnected = false;
    this.onClose?.();
  };

  private setupAudioPipeline() {
    if (!this.audioContext || !this.mediaStream) return;

    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (event) => {
      if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      const input = event.inputBuffer.getChannelData(0);
      const pcm16 = this.float32ToPCM16(input);
      this.ws.send(pcm16.buffer);
    };

    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  private float32ToPCM16(float32Array: Float32Array): Int16Array {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm16;
  }
}
