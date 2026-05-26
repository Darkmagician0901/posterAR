/**
 * useGestures
 *
 * Pinch-to-scale and two-finger rotate only. The drag handler was removed
 * because anchored posters must not be repositioned with screen-space math —
 * their pose comes from anchor.anchorSpace each frame.
 *
 * Used by the iOS fallback's PosterMesh. On the WebXR path posters live in
 * AnchorManager and don't mount this component.
 */

import { useGesture } from '@use-gesture/react';
import { MIN_POSTER_SCALE, MAX_POSTER_SCALE } from '@/utils/constants';
import { usePosterStore } from '@/store/posterStore';

interface UseGesturesOptions {
  posterId: string;
  enabled?: boolean;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
}

export const useGestures = (options: UseGesturesOptions) => {
  const { posterId, enabled = true, onGestureStart, onGestureEnd } = options;
  const { updatePoster, getPosterById } = usePosterStore();

  const poster = getPosterById(posterId);
  if (!poster) {
    return { bind: () => ({}) };
  }

  const bind = useGesture(
    {
      onPinch: ({ offset: [scale], first, last, event }) => {
        if (!enabled) return;
        event.stopPropagation();

        if (first && onGestureStart) onGestureStart();

        const baseScale = poster.scale[0];
        const newScale = Math.max(
          MIN_POSTER_SCALE,
          Math.min(MAX_POSTER_SCALE, baseScale * scale)
        );

        const aspectRatio = poster.scale[1] / poster.scale[0];
        updatePoster(posterId, {
          scale: [newScale, newScale * aspectRatio, poster.scale[2]],
        });

        if (last && onGestureEnd) onGestureEnd();
      },

      onPinchEnd: ({ da: [angle], first, last, event }) => {
        if (!enabled) return;
        event.stopPropagation();

        if (first && onGestureStart) onGestureStart();

        updatePoster(posterId, {
          rotation: [
            poster.rotation[0],
            poster.rotation[1],
            poster.rotation[2] + (angle * Math.PI) / 180,
          ],
        });

        if (last && onGestureEnd) onGestureEnd();
      },
    },
    {
      pinch: {
        scaleBounds: { min: 0.5, max: 2 },
        rubberband: true,
        pointer: { touch: true },
      },
    }
  );

  return { bind };
};
