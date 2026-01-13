export class OpenAIRealtimeClient {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioWorkletNode: AudioWorkletNode | null = null;
  private isConnected = false;
  
  constructor(
    private apiKey: string,
    private onMessage: (data: any) => void,
    private onAudioData: (data: ArrayBuffer) => void,
    private onError: (error: Error) => void
  ) {}

  async connect() {
    try {
      // Initialize AudioContext with specific sample rate for OpenAI
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });
      
      console.log('AudioContext initialized, Rate:', this.audioContext.sampleRate);
      
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true,
          sampleRate: 24000,
        },
      });

      console.log('Microphone access granted');

      // Connect to OpenAI Realtime API via WebSocket
      const wsUrl = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';
      
      this.ws = new WebSocket(wsUrl, [
        'realtime',
        `openai-insecure-api-key.${this.apiKey}`,
        'openai-beta.realtime-v1'
      ]);

      this.ws.addEventListener('open', this.handleOpen.bind(this));
      this.ws.addEventListener('message', this.handleMessage.bind(this));
      this.ws.addEventListener('error', this.handleError.bind(this));
      this.ws.addEventListener('close', this.handleClose.bind(this));

    } catch (error) {
      console.error('Connection failed:', error);
      this.onError(error as Error);
    }
  }

  private handleOpen() {
    console.log('WebSocket connected');
    this.isConnected = true;
    
    // Initialize session
    const sessionConfig = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: 'You are AuraVoice AI, a helpful and friendly voice assistant. Respond naturally and conversationally.',
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      },
    };
    
    console.log('Sending session config:', sessionConfig);
    this.send(sessionConfig);

    this.setupAudioInput();
  }

  getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  private async setupAudioInput() {
    if (!this.audioContext || !this.mediaStream) return;

    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    const processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      if (!this.isConnected) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = this.float32ToPCM16(inputData);
      
      // Calculate basic volume to check if mic is working
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      if (rms > 0.05 && Math.random() < 0.05) { // Log occasionally on activity
         console.log('Sending audio chunk, rms:', rms.toFixed(4));
      }

      // Send audio to OpenAI
      this.send({
        type: 'input_audio_buffer.append',
        audio: this.arrayBufferToBase64(pcm16.buffer as ArrayBuffer),
      });
    };

    source.connect(processor);
    processor.connect(this.audioContext.destination);
  }

  private handleMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data);
      console.log('Received event:', data.type); // Log event types
      
      if (data.type === 'error') {
         console.error('OpenAI Error Event:', data);
      }

      // Handle different message types
      if (data.type === 'response.audio.delta') {
        // Decode and play audio
        const audioData = this.base64ToArrayBuffer(data.delta);
        this.onAudioData(audioData);
      }
      
      this.onMessage(data);
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  private handleError(event: Event) {
    this.onError(new Error('WebSocket error occurred'));
  }

  private handleClose() {
    console.log('WebSocket disconnected');
    this.isConnected = false;
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendText(text: string) {
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: text,
          },
        ],
      },
    });

    this.send({ type: 'response.create' });
  }

  interrupt() {
    this.send({ type: 'response.cancel' });
  }

  disconnect() {
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

  // Utility functions
  private float32ToPCM16(float32Array: Float32Array): Int16Array {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm16;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
