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
        throw new Error(`Azure TTS route error: ${res.status} ${err}`);
      }
      const audioBuffer = await res.arrayBuffer();
      await this.playAudio(audioBuffer);
    } catch (e) {
      console.error('Azure TTS failed:', e);
      throw e;
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
}
