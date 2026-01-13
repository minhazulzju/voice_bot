export class AudioProcessor {
  private audioContext: AudioContext;
  private analyser: AnalyserNode;
  private dataArray: Uint8Array<ArrayBuffer>;
  private outputAudioContext: AudioContext;
  private audioQueue: Float32Array[] = [];
  private isPlaying = false;
  
  // Silence detection properties
  private silenceThreshold: number = 0.08; // Amplitude threshold for silence (lower threshold = wait for stronger silence)
  private silenceDuration: number = 3500; // 3.5 seconds of silence to trigger end (give user more time)
  private lastSoundTime: number = 0;
  private hasDetectedSound: boolean = false; // Only start counting silence after first sound
  private onSilenceDetected?: () => void;
  private silenceCheckIntervalId?: number;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount) as unknown as Uint8Array<ArrayBuffer>;
    
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000,
    });
    
    this.lastSoundTime = Date.now();
  }

  connectMediaStream(stream: MediaStream) {
    const source = this.audioContext.createMediaStreamSource(stream);
    this.connectSource(source);
  }

  connectSource(source: MediaStreamAudioSourceNode) {
    source.connect(this.analyser);
  }

  getAudioIntensity(): number {
    this.analyser.getByteFrequencyData(this.dataArray);
    
    // Calculate RMS (Root Mean Square) for overall intensity
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i] * this.dataArray[i];
    }
    const rms = Math.sqrt(sum / this.dataArray.length);
    
    // Normalize to 0-1 range
    return Math.min(rms / 128, 1);
  }

  getFrequencyData(): Uint8Array {
    this.analyser.getByteFrequencyData(this.dataArray);
    return this.dataArray;
  }

  // Voice Activity Detection (VAD)
  detectVoiceActivity(threshold: number = 0.1): boolean {
    const intensity = this.getAudioIntensity();
    return intensity > threshold;
  }

  /**
   * Start monitoring for silence. When extended silence is detected after initial sound, the callback is triggered.
   * Only counts silence AFTER the first sound is detected to avoid triggering on startup noise.
   */
  startSilenceDetection(callback: () => void, threshold: number = 0.03, duration: number = 5000) {
    this.onSilenceDetected = callback;
    this.silenceThreshold = threshold;
    this.silenceDuration = duration;
    this.lastSoundTime = Date.now();
    this.hasDetectedSound = false; // Reset - wait for first sound before counting silence

    // Check every 150ms for silence condition (less frequent = less aggressive)
    this.silenceCheckIntervalId = window.setInterval(() => {
      const intensity = this.getAudioIntensity();

      if (intensity > this.silenceThreshold) {
        // Sound detected
        this.hasDetectedSound = true; // Mark that we've detected speech
        this.lastSoundTime = Date.now(); // Reset silence timer
      } else if (this.hasDetectedSound) {
        // Silence detected, but only count it after we've already detected sound
        const silenceTime = Date.now() - this.lastSoundTime;
        if (silenceTime >= this.silenceDuration) {
          console.log(`Extended silence detected for ${silenceTime}ms after speech, triggering end of recording`);
          this.stopSilenceDetection();
          this.onSilenceDetected?.();
        }
      }
    }, 150);
  }

  /**
   * Stop monitoring for silence.
   */
  stopSilenceDetection() {
    if (this.silenceCheckIntervalId !== undefined) {
      clearInterval(this.silenceCheckIntervalId);
      this.silenceCheckIntervalId = undefined;
    }
  }

  // Play received audio from OpenAI
  async playAudio(pcm16Data: ArrayBuffer) {
    const int16Array = new Int16Array(pcm16Data);
    const float32Array = new Float32Array(int16Array.length);
    
    // Convert PCM16 to Float32
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    this.audioQueue.push(float32Array);
    
    if (!this.isPlaying) {
      this.processAudioQueue();
    }
  }

  private async processAudioQueue() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const audioData = this.audioQueue.shift()!;

    const audioBuffer = this.outputAudioContext.createBuffer(
      1,
      audioData.length,
      this.outputAudioContext.sampleRate
    );

    audioBuffer.getChannelData(0).set(audioData);

    const source = this.outputAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    
    // Connect to analyser for visualization
    const gainNode = this.outputAudioContext.createGain();
    source.connect(gainNode);
    gainNode.connect(this.outputAudioContext.destination);

    source.onended = () => {
      this.processAudioQueue();
    };

    source.start();
  }

  stopAudio() {
    this.audioQueue = [];
    this.isPlaying = false;
  }

  close() {
    this.stopSilenceDetection();
    if (this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    if (this.outputAudioContext.state !== 'closed') {
      this.outputAudioContext.close();
    }
  }
}
