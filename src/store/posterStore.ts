/**
 * posterStore — Zustand store for poster state.
 *
 * Single source of truth for:
 *   - `posters`: the posters currently placed in the scene (capped at
 *     `maxPosters`, from VITE_MAX_POSTERS). The AR layer mirrors mutations
 *     here into the three.js scene via a store subscription (see
 *     ARExperience.tsx) — removing or rescaling a poster in the store updates
 *     the rendered mesh.
 *   - `uploadedPosters`: user-uploaded images available in the gallery.
 *   - `currentPosterImage`: the image the next placement will use.
 *
 * Note: `position`/`rotation`/`scale` on a placed poster mirror the values
 * passed at creation; the authoritative world transform of a placed poster is
 * the three.js group matrix owned by PosterPlacement, not this store.
 */

import { create } from 'zustand';
import { Poster, CreatePosterOptions } from '@/types';
import {
  DEFAULT_POSTER_DEPTH,
  DEFAULT_POSTER_HEIGHT,
  DEFAULT_POSTER_IMAGE,
  DEFAULT_POSTER_WIDTH,
  MAX_POSTERS,
} from '@/utils/constants';

/**
 * Uploaded poster image
 */
export interface UploadedPoster {
  id: string;
  imageUrl: string;
  name: string;
  uploadedAt: number;
  width: number;
  height: number;
}

interface PosterStore {
  // State
  posters: Poster[];
  selectedPosterId: string | null;
  maxPosters: number;
  uploadedPosters: UploadedPoster[];
  currentPosterImage: string;

  // Actions
  addPoster: (options: CreatePosterOptions) => string | null;
  removePoster: (id: string) => void;
  updatePoster: (id: string, updates: Partial<Poster>) => void;
  selectPoster: (id: string | null) => void;
  clearPosters: () => void;
  getPosterById: (id: string) => Poster | undefined;
  
  // Upload management
  addUploadedPoster: (poster: Omit<UploadedPoster, 'id' | 'uploadedAt'>) => string;
  removeUploadedPoster: (id: string) => void;
  setCurrentPosterImage: (imageUrl: string) => void;
}

/**
 * Generate unique poster ID
 */
const generatePosterId = (): string => {
  return `poster-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

/**
 * Default poster configuration (dimensions come from utils/constants.ts).
 */
const DEFAULT_POSTER_SCALE: [number, number, number] = [
  DEFAULT_POSTER_WIDTH,
  DEFAULT_POSTER_HEIGHT,
  DEFAULT_POSTER_DEPTH,
];
const DEFAULT_POSTER_POSITION: [number, number, number] = [0, 1.5, -2];
const DEFAULT_POSTER_ROTATION: [number, number, number] = [0, 0, 0];

/**
 * Generate unique uploaded poster ID
 */
const generateUploadedPosterId = (): string => {
  return `uploaded-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

/**
 * Poster store using Zustand
 */
export const usePosterStore = create<PosterStore>((set, get) => ({
  // Initial state
  posters: [],
  selectedPosterId: null,
  maxPosters: MAX_POSTERS,
  uploadedPosters: [],
  currentPosterImage: DEFAULT_POSTER_IMAGE,

  // Add a new poster
  addPoster: (options: CreatePosterOptions) => {
    const { posters, maxPosters } = get();

    // Check if max posters limit reached
    if (posters.length >= maxPosters) {
      console.warn(`Maximum number of posters (${maxPosters}) reached`);
      return null;
    }

    const id = generatePosterId();
    const now = Date.now();

    const newPoster: Poster = {
      id,
      imageUrl: options.imageUrl,
      position: options.position || DEFAULT_POSTER_POSITION,
      rotation: options.rotation || DEFAULT_POSTER_ROTATION,
      scale: options.scale || DEFAULT_POSTER_SCALE,
      createdAt: now,
      updatedAt: now,
    };

    set((state) => ({
      posters: [...state.posters, newPoster],
      selectedPosterId: id,
    }));

    return id;
  },

  // Remove a poster by ID
  removePoster: (id: string) => {
    set((state) => ({
      posters: state.posters.filter((poster) => poster.id !== id),
      selectedPosterId: state.selectedPosterId === id ? null : state.selectedPosterId,
    }));
  },

  // Update poster properties
  updatePoster: (id: string, updates: Partial<Poster>) => {
    set((state) => ({
      posters: state.posters.map((poster) =>
        poster.id === id
          ? { ...poster, ...updates, updatedAt: Date.now() }
          : poster
      ),
    }));
  },

  // Select/deselect a poster
  selectPoster: (id: string | null) => {
    set({ selectedPosterId: id });
  },

  // Clear all posters
  clearPosters: () => {
    set({ posters: [], selectedPosterId: null });
  },

  // Get poster by ID
  getPosterById: (id: string) => {
    return get().posters.find((poster) => poster.id === id);
  },

  // Add uploaded poster
  addUploadedPoster: (poster: Omit<UploadedPoster, 'id' | 'uploadedAt'>) => {
    const id = generateUploadedPosterId();
    const uploadedPoster: UploadedPoster = {
      ...poster,
      id,
      uploadedAt: Date.now(),
    };

    set((state) => ({
      uploadedPosters: [...state.uploadedPosters, uploadedPoster],
      currentPosterImage: uploadedPoster.imageUrl,
    }));

    return id;
  },

  // Remove uploaded poster
  removeUploadedPoster: (id: string) => {
    set((state) => {
      const posterToRemove = state.uploadedPosters.find((p) => p.id === id);
      const newUploadedPosters = state.uploadedPosters.filter((p) => p.id !== id);

      // If the removed poster was the active selection, fall back to the
      // first remaining upload, or the bundled default when none are left.
      let newCurrentImage = state.currentPosterImage;
      if (posterToRemove && posterToRemove.imageUrl === state.currentPosterImage) {
        newCurrentImage = newUploadedPosters.length > 0
          ? newUploadedPosters[0].imageUrl
          : DEFAULT_POSTER_IMAGE;
      }

      return {
        uploadedPosters: newUploadedPosters,
        currentPosterImage: newCurrentImage,
      };
    });
  },

  // Set current poster image
  setCurrentPosterImage: (imageUrl: string) => {
    set({ currentPosterImage: imageUrl });
  },
}));
