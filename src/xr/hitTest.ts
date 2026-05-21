/**
 * WebXR Hit Test Utilities
 * Handles surface detection and ray casting for AR placement
 */

import { Vector3, Euler, Matrix4, Quaternion } from 'three';
import { HitTestResult } from '@/types';

/**
 * Request a hit test source for the session
 */
export const requestHitTestSource = async (
  session: XRSession,
  referenceSpace: XRReferenceSpace
): Promise<XRHitTestSource | null> => {
  try {
    // Request hit test source from viewer space (where the user is looking)
    if (!session.requestHitTestSource) {
      console.warn('Hit test not supported in this session');
      return null;
    }
    const hitTestSource = await session.requestHitTestSource({
      space: referenceSpace,
    });
    return hitTestSource || null;
  } catch (error) {
    console.error('Failed to request hit test source:', error);
    return null;
  }
};

/**
 * Request a transient hit test source for touch input
 */
export const requestTransientHitTestSource = async (
  session: XRSession
): Promise<XRTransientInputHitTestSource | null> => {
  try {
    if (!session.requestHitTestSourceForTransientInput) {
      console.warn('Transient hit test not supported in this session');
      return null;
    }
    const hitTestSource = await session.requestHitTestSourceForTransientInput({
      profile: 'generic-touchscreen',
    });
    return hitTestSource || null;
  } catch (error) {
    console.error('Failed to request transient hit test source:', error);
    return null;
  }
};

/**
 * Process hit test results and convert to world position
 */
export const processHitTestResults = (
  hitTestResults: XRHitTestResult[],
  referenceSpace: XRReferenceSpace
): HitTestResult | null => {
  if (hitTestResults.length === 0) {
    return null;
  }

  // Get the first hit test result (closest surface)
  const hitTestResult = hitTestResults[0];
  const pose = hitTestResult.getPose(referenceSpace);

  if (!pose) {
    return null;
  }

  // Extract position from the pose matrix
  const matrix = new Matrix4().fromArray(pose.transform.matrix);
  const position = new Vector3();
  const quaternion = new Quaternion();
  const rotation = new Euler();
  const scale = new Vector3();

  matrix.decompose(position, quaternion, scale);
  rotation.setFromQuaternion(quaternion);

  // Calculate distance from origin (camera)
  const distance = position.length();

  return {
    position,
    rotation,
    distance,
    confidence: 1.0, // WebXR doesn't provide confidence, assume high
  };
};

/**
 * Get hit test results for the current frame
 */
export const getHitTestResults = (
  frame: XRFrame,
  hitTestSource: XRHitTestSource | null
): XRHitTestResult[] => {
  if (!hitTestSource) {
    return [];
  }

  try {
    return frame.getHitTestResults(hitTestSource);
  } catch (error) {
    console.error('Error getting hit test results:', error);
    return [];
  }
};

/**
 * Get transient hit test results (for touch input)
 */
export const getTransientHitTestResults = (
  frame: XRFrame,
  hitTestSource: XRTransientInputHitTestSource | null
): XRTransientInputHitTestResult[] => {
  if (!hitTestSource) {
    return [];
  }

  try {
    return frame.getHitTestResultsForTransientInput(hitTestSource);
  } catch (error) {
    console.error('Error getting transient hit test results:', error);
    return [];
  }
};

/**
 * Convert XR pose to Three.js position and rotation
 */
export const poseToTransform = (pose: XRPose): { position: Vector3; rotation: Euler } => {
  const matrix = new Matrix4().fromArray(pose.transform.matrix);
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();

  matrix.decompose(position, quaternion, scale);
  
  const rotation = new Euler();
  rotation.setFromQuaternion(quaternion);

  return { position, rotation };
};

/**
 * Check if a point is within reasonable placement distance
 */
export const isValidPlacementDistance = (
  distance: number,
  minDistance: number = 0.3,
  maxDistance: number = 10.0
): boolean => {
  return distance >= minDistance && distance <= maxDistance;
};

// Made with Bob