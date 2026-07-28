/**
 * audioUpload — validates an author-picked audio file before it becomes a
 * data: URL on a frame. Pure (no DOM), so it is unit-tested directly.
 */

/** Largest audio a frame may carry. The whole draft lives in localStorage
 *  (~5 MB), so clips stay small until Blob-backed audio lands. */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

/** The fields we read off a File, so tests need not build a real one. */
type AudioFileLike = { size: number; type: string };

export function validateAudioUpload(
  file: AudioFileLike,
): { ok: true } | { ok: false; reason: string } {
  if (!file.type.startsWith('audio/')) {
    return { ok: false, reason: 'That file is not audio — pick an mp3, m4a, wav, or ogg.' };
  }
  if (file.size > MAX_AUDIO_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return { ok: false, reason: `Audio must be under 2 MB — this one is ${mb} MB.` };
  }
  return { ok: true };
}
