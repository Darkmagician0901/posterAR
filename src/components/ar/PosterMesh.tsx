/**
 * PosterMesh
 *
 * iOS-fallback-only poster mesh. The WebXR (Android) path no longer mounts
 * this component — placed posters live inside AnchorManager and are driven
 * from anchor.anchorSpace each frame.
 *
 * No mesh.position.set is performed here after construction. React drives
 * position/rotation/scale from store values (set once at placement), and
 * three.js builds the matrix from those props.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useLoader } from '@react-three/fiber';
import { TextureLoader, Mesh, DoubleSide, PlaneGeometry } from 'three';
import { Poster } from '@/types';
import { usePosterStore } from '@/store/posterStore';
import { useGestures } from '@/hooks/useGestures';

interface PosterMeshProps {
  poster: Poster;
}

export const PosterMesh: React.FC<PosterMeshProps> = ({ poster }) => {
  const meshRef = useRef<Mesh>(null);
  const { selectPoster, selectedPosterId } = usePosterStore();
  const [hovered, setHovered] = useState(false);
  const [isGesturing, setIsGesturing] = useState(false);

  const texture = useLoader(TextureLoader, poster.imageUrl);

  const isSelected = selectedPosterId === poster.id;

  const { bind } = useGestures({
    posterId: poster.id,
    enabled: isSelected,
    onGestureStart: () => setIsGesturing(true),
    onGestureEnd: () => setIsGesturing(false),
  });

  const handleClick = (event: any) => {
    event.stopPropagation();
    if (!isGesturing) {
      selectPoster(poster.id);
    }
  };

  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : 'auto';
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [hovered]);

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
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        map={texture}
        side={DoubleSide}
        transparent={false}
        opacity={1}
        emissive={isSelected ? '#ffffff' : '#000000'}
        emissiveIntensity={isSelected ? 0.2 : 0}
      />
      {isSelected && (
        <lineSegments>
          <edgesGeometry args={[new PlaneGeometry(1.05, 1.05)]} />
          <lineBasicMaterial color="#00ff00" linewidth={2} />
        </lineSegments>
      )}
    </mesh>
  );
};
