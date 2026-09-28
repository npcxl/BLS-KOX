import { useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Reserved interface for a future Tripo3D / Blender export.
 * Drop a `.glb` into `bls-site/public/models/` and pass
 * `<SystemCore model={{ url: '/models/system-core.glb', scale: 1 }} />`.
 */
export interface SystemCoreModelSource {
  url: string;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export function GlbCore({ source }: { source: SystemCoreModelSource }) {
  const gltf = useLoader(GLTFLoader, source.url);
  const object = useMemo(() => gltf.scene.clone(true), [gltf]);
  return (
    <primitive
      object={object}
      scale={source.scale ?? 1}
      position={source.position ?? [0, 0, 0]}
      rotation={source.rotation ?? [0, 0, 0]}
    />
  );
}
