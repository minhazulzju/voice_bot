'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { vertexShader, fragmentShader } from './shaders';

interface GlowSphereProps {
  audioIntensity: number;
  phase: number; // 0 = idle, 1 = listening, 2 = speaking
  brightness?: number;
}

export default function GlowSphere({ audioIntensity, phase, brightness = 1.0 }: GlowSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const timeRef = useRef(0);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAudioIntensity: { value: 0 },
      uPhase: { value: 0 },
      uBrightness: { value: 1.0 },
      // Vibrant, Siri-like colors for white background
      uColorPrimary: { value: new THREE.Color('#00fff7') }, // Cyan
      uColorSecondary: { value: new THREE.Color('#ff2d92') }, // Magenta-pink
      uColorTertiary: { value: new THREE.Color('#3a4fff') }, // Blue
      uColorQuaternary: { value: new THREE.Color('#b800ff') }, // Purple
    }),
    []
  );

  useFrame((state) => {
    timeRef.current = state.clock.elapsedTime;
    
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      materialRef.current.uniforms.uAudioIntensity.value = THREE.MathUtils.lerp(
        materialRef.current.uniforms.uAudioIntensity.value,
        audioIntensity,
        0.1
      );
      materialRef.current.uniforms.uPhase.value = THREE.MathUtils.lerp(
        materialRef.current.uniforms.uPhase.value,
        phase,
        0.05
      );
      materialRef.current.uniforms.uBrightness.value = THREE.MathUtils.lerp(
        materialRef.current.uniforms.uBrightness.value,
        brightness,
        0.06
      );
    }

    // Slow elegant rotation for modern feel (keeps orb visually lively but centered)
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.0022;
      meshRef.current.rotation.x += 0.0012;
    }

    // Siri-like breathing effect
    if (groupRef.current) {
      let targetScale = 1;

      if (phase === 1) {
        // Listening mode: subtle breathing animation (Siri-style)
        // Gentle pulse even without audio, plus reactive response to voice
        const breathingPulse = 1 + Math.sin(timeRef.current * 2.5) * 0.15; // Slow breathing
        const audioReactive = audioIntensity * 1.5; // Voice reactivity
        targetScale = breathingPulse + audioReactive;
      } else if (phase === 0) {
        // Idle: completely stable, no animation
        targetScale = 1;
      } else {
        // Processing/speaking: responsive to audio
        targetScale = 1 + audioIntensity * 1.5;
      }

      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.18);
    }
  });

  return (
    <>
      {/* Ambient and point lights to keep scene vivid and modern */}
      <ambientLight intensity={0.9} />
      <pointLight position={[5, 5, 5]} intensity={0.8} color={'#ffffff'} />
      <pointLight position={[-4, -2, 3]} intensity={0.6} color={'#b800ff'} />

      <group ref={groupRef} position={[0, 0, 0]}>
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[1.4, 64]} />
          <shaderMaterial
            ref={materialRef}
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            uniforms={uniforms}
            transparent
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Additive inner core for bright, modern highlight */}
        <mesh scale={[0.78, 0.78, 0.78]}> 
          <icosahedronGeometry args={[0.9, 32]} />
          <meshBasicMaterial blending={THREE.AdditiveBlending} transparent opacity={0.6} color={'#ffffff'} />
        </mesh>
      </group>

      {/* outer ring removed to keep single orb UI */}
    </>
  );
}
