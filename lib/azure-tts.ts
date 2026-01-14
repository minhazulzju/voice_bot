/**
 * Azure Speech Text-to-Speech client (browser-side)
 * Calls our Next.js route to synthesize and plays audio.
 */

interface AzureTTSOptions {
  voiceName?: string; // e.g., 'en-US-JennyNeural'
  outputFormat?: string; // e.g., 'audio-24khz-48kbitrate-mono-mp3'
  apiPath?: string; // override route path
}

export class AzureTTSClient {
  private readonly voiceName: string;
  private readonly outputFormat: string;
  private readonly apiPath: string;
  private audioContext: AudioContext | null = null;

  constructor(options: AzureTTSOptions = {}) {
    this.voiceName = options.voiceName || 'en-US-JennyNeural';
    this.outputFormat = options.outputFormat || 'audio-24khz-48kbitrate-mono-mp3';
    this.apiPath = options.apiPath || '/api/azure-tts';
  }

  async synthesizeAndPlay(text: string): Promise<void> {
    try {
      const res = await fetch(this.apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceName: this.voiceName, outputFormat: this.outputFormat }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.warn(`Azure TTS route error: ${res.status} ${err}. Falling back to browser SpeechSynthesis.`);
        await this.fallbackSpeak(text);
        return;
      }
      const audioBuffer = await res.arrayBuffer();
      await this.playAudio(audioBuffer);
    } catch (e) {
      console.error('Azure TTS failed:', e);
      // Fallback to browser speech synthesis so the app keeps speaking
      await this.fallbackSpeak(text);
    }
  }

  private async playAudio(audioBuffer: ArrayBuffer): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    const decoded = await this.audioContext.decodeAudioData(audioBuffer.slice(0));
    const source = this.audioContext.createBufferSource();
    source.buffer = decoded;
    const gainNode = this.audioContext.createGain();
    source.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    source.start(0);
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
    });
  }

  close() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  private async fallbackSpeak(text: string): Promise<void> {
    const synth: SpeechSynthesis | undefined = (window as any).speechSynthesis;
    if (!synth) {
      console.error('SpeechSynthesis not supported in this browser. Unable to speak fallback.');
      return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    // Try to select a matching voice if available
    try {
      const voices = synth.getVoices();
      const match = voices.find(v => v.name === this.voiceName) || voices.find(v => v.lang.startsWith('en')) || voices[0];
      if (match) utter.voice = match;
    } catch {}
    utter.lang = 'en-US';
    utter.rate = 1.0;
    utter.pitch = 1.0;

    await new Promise<void>((resolve) => {
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      synth.speak(utter);
    });
  }
}
