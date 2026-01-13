'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const VoiceInterface = dynamic(() => import('@/components/VoiceInterface'), {
  ssr: false,
});

export default function Home() {
  return (
    <main className="w-full h-screen bg-black overflow-hidden">
      <Suspense fallback={<div className="w-full h-screen flex items-center justify-center text-cyber-blue">Loading AuraVoice AI...</div>}>
        <VoiceInterface />
      </Suspense>
    </main>
  );
}
