/**
 * WebXR Hit Test Pipeline
 *
 * Single hit-test source rooted at the **viewer** reference space — the
 * reticle should track wherever the user is currently looking, not a fixed
 * world origin. Per-frame pose math (reticle + anchors) is resolved against
 * the **local** reference space passed in by the caller.
 *
 * Returns raw transform matrices so callers can apply them directly to
 * three.js objects without rebuilding from decomposed components.
 */

export interface ReticlePose {
  matrix: Float32Array;
  /** True if hit landed on a detected plane with orientation roughly vertical. */
  vertical: boolean;
}

export const requestViewerHitTestSource = async (
  session: XRSession
): Promise<XRHitTestSource | null> => {
  if (!session.requestHitTestSource) {
    console.warn('hit-test feature not present on session');
    return null;
  }

  try {
    const viewerSpace = await session.requestReferenceSpace('viewer');
    const source = await session.requestHitTestSource({ space: viewerSpace });
    return source ?? null;
  } catch (error) {
    console.error('requestHitTestSource(viewer) failed:', error);
    return null;
  }
};

/**
 * Read the first hit-test result. When plane-detection is available we prefer
 * vertical planes (wall placement); otherwise fall back to the closest hit.
 */
export const readHitTestPose = (
  frame: XRFrame,
  source: XRHitTestSource,
  localSpace: XRReferenceSpace
): ReticlePose | null => {
  let results: XRHitTestResult[];
  try {
    results = frame.getHitTestResults(source);
  } catch (error) {
    console.error('getHitTestResults failed:', error);
    return null;
  }

  if (results.length === 0) return null;

  let chosen = results[0];
  let chosenVertical = false;

  for (const result of results) {
    const pose = result.getPose(localSpace);
    if (!pose) continue;

    if (isVerticalPose(pose.transform.matrix)) {
      chosen = result;
      chosenVertical = true;
      break;
    }
  }

  const pose = chosen.getPose(localSpace);
  if (!pose) return null;

  return {
    matrix: new Float32Array(pose.transform.matrix),
    vertical: chosenVertical,
  };
};

/**
 * A pose is "vertical" when its local Y axis (column 1 of the 4x4 matrix) is
 * roughly horizontal in world space — i.e. the surface normal points sideways
 * rather than up.
 */
const isVerticalPose = (m: Float32Array | number[]): boolean => {
  const upY = m[5];
  return Math.abs(upY) < 0.5;
};
