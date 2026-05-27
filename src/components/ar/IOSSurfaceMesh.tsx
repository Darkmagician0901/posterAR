/**
 * IOSSurfaceMesh
 *
 * R3F component that renders the segmented surface as a YOLO-style colored
 * quad: a translucent fill, a thick outline, and a small class label. Reads
 * its transform from a ref updated each frame by the IMU stabilizer, so the
 * mesh appears to lock onto the detected wall / floor even between
 * segmenter inferences.
 *
 * The ref shape matches `StabilizedTransform` from imuStabilizer — but we
 * don't import that type here to keep the component reusable for the
 * desktop mock path.
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  DoubleSide,
  Group,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  Color,
  EdgesGeometry,
  LineBasicMaterial,
  PlaneGeometry,
} from 'three';

export interface SurfaceMeshState {
  position: Vector3;
  quaternion: Quaternion;
  size: { width: number; height: number };
  classId: 'wall' | 'floor' | 'ceiling' | null;
  visible: boolean;
}

const CLASS_COLOR: Record<'wall' | 'floor' | 'ceiling', string> = {
  wall:    '#22c55e',
  floor:   '#06b6d4',
  ceiling: '#a855f7',
};

interface Props {
  stateRef: React.MutableRefObject<SurfaceMeshState>;
}

export const IOSSurfaceMesh: React.FC<Props> = ({ stateRef }) => {
  const groupRef = useRef<Group>(null);
  const fillRef = useRef<Mesh>(null);
  const outlineRef = useRef<LineSegments>(null);

  const fillMaterial = useMemo(() => {
    return new MeshBasicMaterial({
      color: new Color(CLASS_COLOR.wall),
      transparent: true,
      opacity: 0.22,
      side: DoubleSide,
      depthWrite: false,
    });
  }, []);

  const outlineMaterial = useMemo(() => {
    return new LineBasicMaterial({
      color: new Color(CLASS_COLOR.wall),
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
  }, []);

  const fillGeometry = useMemo(() => new PlaneGeometry(1, 1), []);
  const outlineGeometry = useMemo(() => new EdgesGeometry(fillGeometry), [fillGeometry]);

  // Currently-bound class so we only swap colors on transition.
  const currentClass = useRef<'wall' | 'floor' | 'ceiling' | null>(null);

  useFrame(() => {
    const state = stateRef.current;
    if (!groupRef.current) return;
    if (!state.visible) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;
    groupRef.current.position.copy(state.position);
    groupRef.current.quaternion.copy(state.quaternion);
    groupRef.current.scale.set(state.size.width, state.size.height, 1);

    if (state.classId && state.classId !== currentClass.current) {
      const c = new Color(CLASS_COLOR[state.classId]);
      fillMaterial.color.copy(c);
      outlineMaterial.color.copy(c);
      currentClass.current = state.classId;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={fillRef} geometry={fillGeometry} material={fillMaterial} />
      <lineSegments ref={outlineRef} geometry={outlineGeometry} material={outlineMaterial} />
    </group>
  );
};
