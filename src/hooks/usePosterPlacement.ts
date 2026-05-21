/**
 * Custom hook for managing poster placement in AR
 */

import { useCallback } from 'react';
import { usePosterStore } from '@/store/posterStore';
import { HitTestResult } from '@/types';
import { isValidPlacementDistance } from '@/xr/hitTest';

interface UsePosterPlacementReturn {
  placePoster: (hitTestResult: HitTestResult) => string | null;
  canPlacePoster: (hitTestResult: HitTestResult | null) => boolean;
}

/**
 * Hook to handle poster placement logic
 */
export const usePosterPlacement = (): UsePosterPlacementReturn => {
  const { addPoster, posters, maxPosters, getCurrentPosterImage } = usePosterStore();

  /**
   * Check if a poster can be placed at the given hit test result
   */
  const canPlacePoster = useCallback(
    (hitTestResult: HitTestResult | null): boolean => {
      if (!hitTestResult) {
        return false;
      }

      // Check if max posters reached
      if (posters.length >= maxPosters) {
        console.warn('Maximum number of posters reached');
        return false;
      }

      // Check if placement distance is valid
      if (!isValidPlacementDistance(hitTestResult.distance)) {
        console.warn('Placement distance out of valid range');
        return false;
      }

      return true;
    },
    [posters.length, maxPosters]
  );

  /**
   * Place a poster at the given hit test result location
   */
  const placePoster = useCallback(
    (hitTestResult: HitTestResult): string | null => {
      if (!canPlacePoster(hitTestResult)) {
        return null;
      }

      const { position, rotation } = hitTestResult;

      // Convert Vector3 and Euler to arrays
      const positionArray: [number, number, number] = [
        position.x,
        position.y,
        position.z,
      ];

      const rotationArray: [number, number, number] = [
        rotation.x,
        rotation.y,
        rotation.z,
      ];

      // Add poster to store using current poster image
      const posterId = addPoster({
        imageUrl: getCurrentPosterImage(),
        position: positionArray,
        rotation: rotationArray,
      });

      if (posterId) {
        console.log('Poster placed at:', positionArray);
      }

      return posterId;
    },
    [canPlacePoster, addPoster]
  );

  return {
    placePoster,
    canPlacePoster,
  };
};

// Made with Bob