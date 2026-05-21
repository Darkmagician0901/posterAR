/**
 * useGestures Hook
 * Handles touch gestures for poster manipulation (drag, pinch, rotate)
 */

import { useGesture } from '@use-gesture/react';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { MIN_POSTER_SCALE, MAX_POSTER_SCALE } from '@/utils/constants';
import { usePosterStore } from '@/store/posterStore';

interface GestureState {
  isDragging: boolean;
  isPinching: boolean;
  isRotating: boolean;
  scale: number;
  rotation: number;
}

interface UseGesturesOptions {
  posterId: string;
  enabled?: boolean;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
}

/**
 * Hook for handling poster gestures
 */
export const useGestures = (options: UseGesturesOptions) => {
  const { posterId, enabled = true, onGestureStart, onGestureEnd } = options;
  const { updatePoster, getPosterById } = usePosterStore();
  const { camera } = useThree();

  const poster = getPosterById(posterId);
  if (!poster) {
    return { bind: () => ({}), gestureState: null };
  }

  // Track gesture state
  const gestureState: GestureState = {
    isDragging: false,
    isPinching: false,
    isRotating: false,
    scale: poster.scale[0],
    rotation: poster.rotation[2],
  };

  // Configure gesture handlers
  const bind = useGesture(
    {
      // Drag gesture - move poster in XY plane
      onDrag: ({ offset: [x, y], first, last, event }) => {
        if (!enabled) return;
        
        event.stopPropagation();

        if (first && onGestureStart) {
          onGestureStart();
          gestureState.isDragging = true;
        }

        // Convert screen space to world space
        // Scale the movement based on distance from camera
        const distance = new Vector3(...poster.position).distanceTo(camera.position);
        const scaleFactor = distance * 0.001;

        const newPosition: [number, number, number] = [
          poster.position[0] + x * scaleFactor,
          poster.position[1] - y * scaleFactor,
          poster.position[2],
        ];

        updatePoster(posterId, { position: newPosition });

        if (last) {
          gestureState.isDragging = false;
          if (onGestureEnd) onGestureEnd();
        }
      },

      // Pinch gesture - scale poster
      onPinch: ({ offset: [scale], first, last, event }) => {
        if (!enabled) return;
        
        event.stopPropagation();

        if (first && onGestureStart) {
          onGestureStart();
          gestureState.isPinching = true;
        }

        // Clamp scale within limits
        const baseScale = poster.scale[0];
        const newScale = Math.max(
          MIN_POSTER_SCALE,
          Math.min(MAX_POSTER_SCALE, baseScale * scale)
        );

        // Maintain aspect ratio
        const aspectRatio = poster.scale[1] / poster.scale[0];
        const newScaleArray: [number, number, number] = [
          newScale,
          newScale * aspectRatio,
          poster.scale[2],
        ];

        updatePoster(posterId, { scale: newScaleArray });
        gestureState.scale = newScale;

        if (last) {
          gestureState.isPinching = false;
          if (onGestureEnd) onGestureEnd();
        }
      },

      // Rotate gesture - two-finger rotation
      onPinchEnd: ({ da: [angle], first, last, event }) => {
        if (!enabled) return;
        
        event.stopPropagation();

        if (first && onGestureStart) {
          onGestureStart();
          gestureState.isRotating = true;
        }

        // Convert angle to radians and apply to Z rotation
        const newRotation: [number, number, number] = [
          poster.rotation[0],
          poster.rotation[1],
          poster.rotation[2] + (angle * Math.PI) / 180,
        ];

        updatePoster(posterId, { rotation: newRotation });
        gestureState.rotation = newRotation[2];

        if (last) {
          gestureState.isRotating = false;
          if (onGestureEnd) onGestureEnd();
        }
      },
    },
    {
      drag: {
        from: () => [0, 0],
        pointer: { touch: true },
      },
      pinch: {
        scaleBounds: { min: 0.5, max: 2 },
        rubberband: true,
        pointer: { touch: true },
      },
    }
  );

  return { bind, gestureState };
};

// Made with Bob