/**
 * ElevenLabs Text-to-Speech (TTS) client
 * Converts text responses to audio and plays them
 */

interface ElevenLabsTTSOptions {
  apiKey: string;
  voiceId?: string;
  modelId?: string;
}

export class ElevenLabsTTSClient {
  private readonly apiKey: string;
  private readonly voiceId: string;
  private readonly modelId: string;
  private audioContext: AudioContext | null = null;
  private audioQueue: Float32Array[] = [];
  private isPlaying = false;

  constructor(options: ElevenLabsTTSOptions) {
    this.apiKey = options.apiKey;
    this.voiceId = options.voiceId || 'JBFqnCBsd6RMkjVDRZzb'; // Default voice
    // Use faster model for low-latency TTS
    this.modelId = options.modelId || 'eleven_turbo_v2';
  }

  async synthesizeAndPlay(text: string): Promise<void> {
    try {
      console.log('ElevenLabs: Synthesizing text:', text);

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey,
          },
          body: JSON.stringify({
            text: text,
            model_id: this.modelId,
            // Lower quality params to prioritize speed
            voice_settings: {
              stability: 0.3,
              similarity_boost: 0.6,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} ${errorData}`);
      }

      const audioBuffer = await response.arrayBuffer();
      console.log('ElevenLabs: Audio received, playing...');

      // Play the audio
      await this.playAudio(audioBuffer);
    } catch (error) {
      console.error('ElevenLabs synthesis failed:', error);
      throw error;
    }
  }

  private async playAudio(audioBuffer: ArrayBuffer): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // Resume audio context if suspended (common in browsers)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
      console.log('Audio context resumed');
    }

    try {
      const audioBuffer_ = await this.audioContext.decodeAudioData(
        audioBuffer.slice(0) // Copy buffer
      );

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer_;

      const gainNode = this.audioContext.createGain();
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      console.log('ElevenLabs: Starting audio playback, duration:', audioBuffer_.duration.toFixed(2), 'sec');

      source.start(0);

      // Wait for playback to finish
      await new Promise<void>((resolve) => {
        source.onended = () => {
          console.log('ElevenLabs: Playback complete');
          resolve();
        };
      });
    } catch (error) {
      console.error('ElevenLabs audio playback failed:', error);
      throw error;
    }
  }

  close() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
