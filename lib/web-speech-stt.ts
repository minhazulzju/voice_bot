/**
 * Web Speech API wrapper for speech-to-text (STT)
 * Built into most modern browsers - no API key needed!
 */

type TranscriptHandler = (text: string, isFinal: boolean) => void;

interface WebSpeechSTTOptions {
  onTranscript: TranscriptHandler;
  onOpen?: () => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  language?: string;
}

export class WebSpeechSTTClient {
  private recognition: any = null;
  private mediaStream: MediaStream | null = null;
  private isListening = false;

  private readonly onTranscript: TranscriptHandler;
  private readonly onOpen?: () => void;
  private readonly onError?: (error: Error) => void;
  private readonly onClose?: () => void;
  private readonly language: string;

  constructor(options: WebSpeechSTTOptions) {
    this.onTranscript = options.onTranscript;
    this.onOpen = options.onOpen;
    this.onError = options.onError;
    this.onClose = options.onClose;
    this.language = options.language || 'en-US';

    // Initialize Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.setupRecognition();
    } else {
      console.error('Web Speech API not supported in this browser');
      this.onError?.(new Error('Web Speech API not supported'));
    }
  }

  private setupRecognition() {
    if (!this.recognition) return;

    // Key: NOT continuous. Stop after each final transcript so we only respond once per user input.
    this.recognition.continuous = false;
    // Disable interim results to avoid showing inaccurate partial transcripts.
    this.recognition.interimResults = false;
    // Ask for multiple alternatives to improve final accuracy when available.
    try {
      this.recognition.maxAlternatives = 5;
    } catch (e) {
      // Some implementations may not allow setting maxAlternatives
    }
    this.recognition.lang = this.language;

    this.recognition.onstart = () => {
      console.log('Web Speech Recognition started');
      this.isListening = true;
      this.onOpen?.();
    };

    this.recognition.onresult = (event: any) => {
      // With interimResults disabled, results should be final when onresult fires.
      let collected = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        collected += event.results[i][0].transcript + ' ';
      }

      const text = collected.trim();
      const isFinal = true;

      if (text) {
        console.log('Web Speech final transcript:', { text, isFinal });
        this.onTranscript(text, isFinal);
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('Web Speech error:', event.error);
      this.onError?.(new Error(`Speech recognition error: ${event.error}`));
    };

    this.recognition.onend = () => {
      console.log('Web Speech Recognition ended');
      this.isListening = false;
      this.onClose?.();
    };
  }

  async connect() {
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      console.log('Microphone access granted');

      // Start recognition
      if (this.recognition) {
        this.recognition.start();
      }
    } catch (error) {
      console.error('Microphone access failed:', error);
      this.onError?.(error as Error);
    }
  }

  getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  disconnect() {
    if (this.recognition) {
      this.recognition.stop();
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.isListening = false;
  }

  /**
   * Restart listening for the next user turn.
   * Useful for multi-turn conversations.
   */
  async restart() {
    this.disconnect();
    await this.connect();
  }
}
