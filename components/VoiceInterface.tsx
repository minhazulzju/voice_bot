'use client';

import { useRef, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import GlowSphere from './GlowSphere';
import { WebSpeechSTTClient } from '@/lib/web-speech-stt';
import { AudioProcessor } from '@/lib/audio-processor';
import { generateReply } from '@/lib/text-generation';
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
    // Azure TTS runs via our server route; no client secret required
    ttsClientRef.current = new AzureTTSClient({
      voiceName: 'en-US-JennyNeural',
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    });

    const client = new WebSpeechSTTClient({
      onTranscript: handleTranscript,
      onOpen: () => setConnectionStatus('connected'),
      onError: handleError,
      onClose: () => setConnectionStatus('disconnected'),
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
      const reply = await generateReply({ prompt: userText });

      console.log('Got reply:', reply);
      setAssistantFeedback(reply); // Update assistant feedback
      setTranscripts((prev) => [...prev, { role: 'assistant', text: reply }]);

      if (ttsClientRef.current) {
        setPhase('speaking');
        try {
          console.log('Starting TTS...');
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
    // Remember the last *listening* phase so we can keep visuals stable during processing/speaking
    if (phase === 'listening') {
      prevVisualPhaseRef.current = phase;
      // capture audio intensity and visual settings while listening for freezing during processing/speaking
      lastListeningAudioRef.current = audioIntensity;
      lastListeningBrightnessRef.current = brightness;
      lastListeningBloomRef.current = bloom;
    }
  }, [phase, audioIntensity, brightness, bloom]);

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
    <div className="w-full h-screen bg-white relative"> {/* Changed background to white */}
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
            luminanceThreshold={0.08}
            luminanceSmoothing={0.8}
            height={300}
          />
        </EffectComposer>
      </Canvas>

      {/* Subtitles and Feedback */}
      <div className="absolute bottom-4 w-full text-center text-black"> {/* Changed text color to black for visibility */}
        <p className="text-lg font-semibold">{userSubtitle}</p>
        <p className="text-sm text-gray-600 mt-2">{assistantFeedback}</p>
      </div>
    </div>
  );
}
