'use client';

import { useRef, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import GlowSphere from './GlowSphere';
import { WebSpeechSTTClient } from '@/lib/web-speech-stt';
import { AudioProcessor } from '@/lib/audio-processor';
import { generateReply, detectLanguage } from '@/lib/text-generation';
import { AzureTTSClient } from '@/lib/azure-tts';

type Phase = 'idle' | 'listening' | 'processing' | 'speaking';
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export default function VoiceInterface() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [brightness, setBrightness] = useState<number>(1.0);
  const [bloom, setBloom] = useState<number>(1.0);
  const prevVisualPhaseRef = useRef<Phase>('idle');
  const lastListeningAudioRef = useRef<number>(0);
  const lastListeningBrightnessRef = useRef<number>(brightness);
  const lastListeningBloomRef = useRef<number>(bloom);
  const transcriptsContainerRef = useRef<HTMLDivElement | null>(null);
  const [audioIntensity, setAudioIntensity] = useState(0);
  const lastNonSpeakingAudioRef = useRef<number>(0);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [transcripts, setTranscripts] = useState<Array<{ role: string; text: string }>>([]);
  const [latency, setLatency] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [userSubtitle, setUserSubtitle] = useState<string>('');
  const [assistantFeedback, setAssistantFeedback] = useState<string>('');

  const clientRef = useRef<WebSpeechSTTClient | null>(null);
  const ttsClientRef = useRef<AzureTTSClient | null>(null);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const animationFrameRef = useRef<number>();
  const lastMessageTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    // Auto-start conversation when component mounts
    startSession();
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (clientRef.current) {
      clientRef.current.disconnect();
    }
    if (ttsClientRef.current) {
      ttsClientRef.current.close();
    }
    if (audioProcessorRef.current) {
      audioProcessorRef.current.close();
    }
  };

  const startSession = async () => {
    cleanup();
    setConnectionStatus('connecting');

    audioProcessorRef.current = new AudioProcessor();
    
    // Initialize TTS with both voices available - will select based on response language
    ttsClientRef.current = new AzureTTSClient({
      voiceName: 'en-US-JennyNeural', // Default to English
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    });

    const client = new WebSpeechSTTClient({
      onTranscript: handleTranscript,
      onOpen: () => setConnectionStatus('connected'),
      onError: handleError,
      onClose: () => setConnectionStatus('disconnected'),
      language: 'en-US', // Web Speech API will auto-detect, but allow both
    });

    clientRef.current = client;

    try {
      await client.connect();
      const stream = client.getMediaStream();
      if (stream && audioProcessorRef.current) {
        audioProcessorRef.current.connectMediaStream(stream);
        startAudioAnalysis();
      }
    } catch (error) {
      setConnectionStatus('error');
      console.error('Failed to connect:', error);
    }
  };

  const handleTranscript = async (text: string, isFinal: boolean) => {
    const now = Date.now();
    setLatency(now - lastMessageTimeRef.current);
    lastMessageTimeRef.current = now;

    setUserSubtitle(text); // Update user subtitle

    setTranscripts((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'user') {
        return [...prev.slice(0, -1), { role: 'user', text: isFinal ? text : `${text} …` }];
      }
      return [...prev, { role: 'user', text: isFinal ? text : `${text} …` }];
    });

    if (!isFinal) {
      setPhase('listening');
      return;
    }

    // Final transcript received — user finished speaking. Generate response and speak.
    console.log('Final transcript received:', text);
    setPhase('processing');
    await generateAndSpeak(text);
  };

  const handleError = (error: Error) => {
    console.error('Client error:', error);
    setConnectionStatus('error');
  };

  const generateAndSpeak = async (userText: string) => {
    try {
      console.log('Generating empathetic reply for:', userText);
      setIsGenerating(true);
      const reply = await generateReply({ prompt: userText }); // Auto-detects language

      console.log('Got reply:', reply);
      setAssistantFeedback(reply); // Update assistant feedback
      setTranscripts((prev) => [...prev, { role: 'assistant', text: reply }]);

      if (ttsClientRef.current) {
        setPhase('speaking');
        try {
          // Auto-detect response language and set appropriate voice
          const responseLanguage = detectLanguage(reply);
          const voiceName = responseLanguage === 'zh-CN' ? 'zh-CN-YunyangNeural' : 'en-US-JennyNeural';
          
          // Update TTS client with the correct voice
          ttsClientRef.current = new AzureTTSClient({
            voiceName,
            outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
          });
          
          console.log(`Starting TTS with ${responseLanguage} voice (${voiceName})...`);
          await ttsClientRef.current.synthesizeAndPlay(reply);
          console.log('TTS completed, restarting listening');
        } catch (error) {
          console.error('Azure TTS failed', error);
          setTranscripts((prev) => [
            ...prev.slice(0, -1),
            { role: 'assistant', text: reply + ' (audio failed)' },
          ]);
        }
      }
    } catch (error) {
      console.error('Failed to generate reply', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setAssistantFeedback(`Sorry, I ran into an issue: ${errorMsg}`); // Update feedback on error
      setTranscripts((prev) => [...prev, { role: 'assistant', text: `Sorry, I ran into an issue: ${errorMsg}` }]);
    } finally {
      setIsGenerating(false);
      // After response, restart listening for next user input
      setPhase('idle');
      // Restart Web Speech recognition for next turn
      if (clientRef.current) {
        console.log('Restarting recognition for next turn');
        clientRef.current.disconnect();
        // Small delay to ensure clean restart
        setTimeout(() => {
          clientRef.current?.connect().catch((err) => console.error('Failed to restart listening:', err));
        }, 500);
      }
    }
  };

  const startAudioAnalysis = () => {
    const updateIntensity = () => {
      if (audioProcessorRef.current) {
        const intensity = audioProcessorRef.current.getAudioIntensity();
        setAudioIntensity(intensity);
      }
      animationFrameRef.current = requestAnimationFrame(updateIntensity);
    };
    updateIntensity();

    // NOTE: Disabled custom silence detection - relying on Web Speech API's built-in 
    // end-of-speech detection which works better for natural conversation flow
    // The Web Speech API automatically detects when user finishes speaking
  };

  const getPhaseNumber = (): number => {
    const effectivePhase = (phase === 'speaking' || phase === 'processing') ? prevVisualPhaseRef.current : phase;
    switch (effectivePhase) {
      case 'listening': return 1;
      case 'processing': return 1.5;
      default: return 0;
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-400';
      case 'connecting': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  useEffect(() => {
    // Dramatically increase bloom and brightness when user is talking
    if (phase === 'listening') {
      // Dynamic bloom based on audio intensity (much stronger effect)
      const dynamicBloom = 1.5 + audioIntensity * 4.5; // Range: 1.5 to 6.0
      const dynamicBrightness = 1.0 + audioIntensity * 2.0; // Range: 1.0 to 3.0
      
      setBrightness(dynamicBrightness);
      setBloom(dynamicBloom);
      
      prevVisualPhaseRef.current = phase;
      lastListeningAudioRef.current = audioIntensity;
      lastListeningBrightnessRef.current = dynamicBrightness;
      lastListeningBloomRef.current = dynamicBloom;
    } else {
      // Idle or processing: subtle glow
      setBrightness(1.0);
      setBloom(1.0);
    }
  }, [phase, audioIntensity]);

  // Auto-scroll transcripts container so newest (top) message is visible
  useEffect(() => {
    const el = transcriptsContainerRef.current;
    if (!el) return;
    // scroll to top because we render newest messages first
    try {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      el.scrollTop = 0;
    }
  }, [transcripts]);

  // Show listening status as "connected" when idle or processing/speaking
  const displayStatus = () => {
    const visualPhase = phase === 'speaking' ? prevVisualPhaseRef.current : phase;
    if (connectionStatus === 'connected') {
      return `${connectionStatus.toUpperCase()} - ${visualPhase.toUpperCase()}`;
    }
    return connectionStatus.toUpperCase();
  };

  const visualPhase = (phase === 'speaking' || phase === 'processing') ? prevVisualPhaseRef.current : phase;
  const effectiveAudioIntensity = (phase === 'speaking' || phase === 'processing') ? lastListeningAudioRef.current : audioIntensity;
  const effectiveBrightness = (phase === 'speaking' || phase === 'processing') ? lastListeningBrightnessRef.current : brightness;
  const effectiveBloom = (phase === 'speaking' || phase === 'processing') ? lastListeningBloomRef.current : bloom;

  return (
    <div className="w-full h-screen bg-white relative">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={["#ffffff"]} /> {/* Updated canvas background to white */}
        <ambientLight intensity={0.9} />
        <pointLight position={[10, 10, 10]} intensity={0.9} />
        <pointLight position={[-10, -10, 5]} intensity={0.6} />

        <GlowSphere audioIntensity={effectiveAudioIntensity} phase={getPhaseNumber()} brightness={effectiveBrightness} />

        <EffectComposer>
          <Bloom
            intensity={effectiveBloom}
            luminanceThreshold={0.05}
            luminanceSmoothing={0.6}
            height={400}
            radius={0.85}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
