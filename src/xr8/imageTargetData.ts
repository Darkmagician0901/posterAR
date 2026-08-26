/**
 * imageTargetData.ts — loads self-hosted image-target fingerprints.
 *
 * A "fingerprint" is what 8th Wall's open-source `image-target-cli` produces
 * from a source picture: a JSON descriptor plus a set of processed images (a
 * cropped 480x640 luminance/grayscale version the tracker matches against, and
 * a thumbnail). The engine can't detect a marker from the original photo — it
 * needs this precomputed feature data.
 *
 * Generating a fingerprint is an OFFLINE, one-time step done by a human:
 *
 *     npx @8thwall/image-target-cli@latest
 *
 * then drop the resulting files into `public/image-targets/` and list the JSON
 * in `public/image-targets/manifest.json`. See the README in that folder.
 *
 * The one wrinkle this module exists to handle: each fingerprint JSON carries
 * an `imagePath` that the engine resolves RELATIVE TO THE PAGE URL, not
 * relative to the JSON file. Left alone, a target living in `/image-targets/`
 * would make the engine request `/<imagePath>` from the site root and fail to
 * load its own feature image. So paths are rewritten to be rooted in the
 * manifest's directory before the data reaches the engine.
 */

/** Where the fingerprints live, relative to the site root. */
export const IMAGE_TARGET_DIR = '/image-targets';

/** Path to the manifest listing which fingerprint JSONs to load. */
export const IMAGE_TARGET_MANIFEST = `${IMAGE_TARGET_DIR}/manifest.json`;

/**
 * A fingerprint JSON as produced by `image-target-cli`. Only the fields this
 * app touches are named; everything else is passed through to the engine
 * untouched, because the engine — not us — defines the schema.
 */
export interface ImageTargetData {
  /** Target name; becomes the id of a "space". */
  name?: string;
  /** Relative path to the tracker's feature image. Rewritten on load. */
  imagePath?: string;
  /** 'PLANAR' for a flat printed picture; also CYLINDER / CONICAL. */
  type?: string;
  [key: string]: unknown;
}

/** Result of a load attempt — always resolves, never throws at the call site. */
export interface ImageTargetLoadResult {
  /** Fingerprints ready to hand to `configureImageTargets`. */
  targets: ImageTargetData[];
  /**
   * Why the list is empty or short, in plain language for the HUD. Null when
   * everything listed in the manifest loaded.
   */
  problem: string | null;
}

/** Shape of `public/image-targets/manifest.json`. */
interface Manifest {
  /** Filenames (or paths) of the fingerprint JSONs to load. */
  targets?: string[];
}

/**
 * Rewrites a fingerprint's `imagePath` so the engine resolves it correctly.
 *
 * @param target — The fingerprint JSON as read from disk.
 * @param dir — Site-root-relative directory the fingerprint lives in.
 * @returns A copy with `imagePath` rooted at `dir`. Absolute paths and full
 *   URLs are left alone — those already resolve unambiguously.
 */
export function resolveImagePath(target: ImageTargetData, dir: string): ImageTargetData {
  const p = target.imagePath;
  if (typeof p !== 'string' || p === '') return target;
  if (p.startsWith('/') || /^https?:\/\//i.test(p)) return target;
  return { ...target, imagePath: `${dir}/${p}` };
}

/**
 * Loads every fingerprint listed in the manifest.
 *
 * Failures are reported, never thrown: a missing manifest is the normal state
 * of a fresh checkout (fingerprints are generated locally, not committed as
 * placeholders), and the testbed should say so on screen rather than crash the
 * AR session.
 *
 * @param manifestUrl — Override for the manifest location; defaults to
 *   {@link IMAGE_TARGET_MANIFEST}.
 * @returns The loaded fingerprints and, when something went wrong, a
 *   human-readable explanation.
 */
export async function loadImageTargets(
  manifestUrl: string = IMAGE_TARGET_MANIFEST,
): Promise<ImageTargetLoadResult> {
  const dir = manifestUrl.slice(0, manifestUrl.lastIndexOf('/'));

  let manifest: Manifest;
  try {
    const res = await fetch(manifestUrl, { cache: 'no-cache' });
    if (!res.ok) {
      return {
        targets: [],
        problem: `No markers installed (${manifestUrl} → HTTP ${res.status}). Generate one with "npx @8thwall/image-target-cli@latest" — see public/image-targets/README.md.`,
      };
    }
    manifest = (await res.json()) as Manifest;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { targets: [], problem: `Could not read ${manifestUrl}: ${msg}` };
  }

  const names = Array.isArray(manifest.targets) ? manifest.targets : [];
  if (names.length === 0) {
    return {
      targets: [],
      problem: `${manifestUrl} lists no targets. Add your fingerprint JSON filename to "targets".`,
    };
  }

  const failures: string[] = [];
  const targets: ImageTargetData[] = [];

  // Sequential rather than parallel: there are only ever a handful of targets,
  // and a stable, ordered failure list is more useful than a marginal speedup.
  for (const name of names) {
    const url = name.startsWith('/') ? name : `${dir}/${name}`;
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) {
        failures.push(`${name} (HTTP ${res.status})`);
        continue;
      }
      const data = (await res.json()) as ImageTargetData;
      targets.push(resolveImagePath(data, dir));
    } catch (err) {
      failures.push(`${name} (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  return {
    targets,
    problem: failures.length ? `Failed to load: ${failures.join(', ')}` : null,
  };
}
