export class AudioProcessor {
  private audioContext: AudioContext;
  private analyser: AnalyserNode;
  private dataArray: Uint8Array<ArrayBuffer>;
  private outputAudioContext: AudioContext;
  private audioQueue: Float32Array[] = [];
  private isPlaying = false;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount) as unknown as Uint8Array<ArrayBuffer>;
    
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000,
    });
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
    if (this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    if (this.outputAudioContext.state !== 'closed') {
      this.outputAudioContext.close();
    }
  }
}
