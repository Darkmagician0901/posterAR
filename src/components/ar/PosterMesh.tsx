/**
 * PosterMesh Component
 * Renders a 3D poster mesh in AR space with gesture controls
 */

import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { TextureLoader, Mesh, DoubleSide, PlaneGeometry } from 'three';
import { Poster } from '@/types';
import { usePosterStore } from '@/store/posterStore';
import { useGestures } from '@/hooks/useGestures';

interface PosterMeshProps {
  poster: Poster;
}

/**
 * 3D mesh component for displaying a poster in AR with gesture support
 */
export const PosterMesh: React.FC<PosterMeshProps> = ({ poster }) => {
  const meshRef = useRef<Mesh>(null);
  const { selectPoster, selectedPosterId } = usePosterStore();
  const [hovered, setHovered] = useState(false);
  const [isGesturing, setIsGesturing] = useState(false);

  // Load poster texture
  const texture = useLoader(TextureLoader, poster.imageUrl);

  // Check if this poster is selected
  const isSelected = selectedPosterId === poster.id;

  // Gesture controls
  const { bind } = useGestures({
    posterId: poster.id,
    enabled: isSelected,
    onGestureStart: () => setIsGesturing(true),
    onGestureEnd: () => setIsGesturing(false),
  });

  // Handle click/tap
  const handleClick = (event: any) => {
    event.stopPropagation();
    if (!isGesturing) {
      selectPoster(poster.id);
    }
  };

  // Update cursor on hover
  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = 'pointer';
    } else {
      document.body.style.cursor = 'auto';
    }
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [hovered]);

  // Subtle animation for selected poster
  useFrame((state) => {
    if (meshRef.current && isSelected && !isGesturing) {
      // Gentle floating animation when not gesturing
      meshRef.current.position.y = poster.position[1] + Math.sin(state.clock.elapsedTime * 2) * 0.01;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={poster.position}
      rotation={poster.rotation}
      scale={poster.scale}
      onClick={handleClick}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      castShadow
      receiveShadow
      {...(isSelected ? bind() : {})}
    >
      {/* Plane geometry for the poster */}
      <planeGeometry args={[1, 1]} />
      
      {/* Material with the poster texture */}
      <meshStandardMaterial
        map={texture}
        side={DoubleSide}
        transparent={false}
        opacity={1}
        emissive={isSelected ? '#ffffff' : '#000000'}
        emissiveIntensity={isSelected ? 0.2 : 0}
      />
      
      {/* Selection indicator - subtle outline */}
      {isSelected && (
        <lineSegments>
          <edgesGeometry args={[new PlaneGeometry(1.05, 1.05)]} />
          <lineBasicMaterial color="#00ff00" linewidth={2} />
        </lineSegments>
      )}
    </mesh>
  );
};

// Made with Bob