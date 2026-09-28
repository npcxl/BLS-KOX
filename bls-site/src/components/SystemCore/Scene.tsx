import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CORE_NODES } from '../../content/site';
import type { SystemCoreModelSource } from './model';
import { GlbCore } from './model';

/* ------------------------------------------------------------------ helpers */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const seg = (t: number, from: number, to: number) => easeOut(clamp01((t - from) / (to - from)));
/** The whole one-shot intro: 2.2s, then the scene stays alive with idle motion. */
const INTRO_DONE = 2.2;

const ORBIT_RADIUS = 1.92;
const NODE_RADIUS = 2.92;

const ORBIT_TILTS: [number, number, number][] = [
  [0.34, 0, 0],
  [-0.22, 0, 0.52],
  [0.12, 0, -0.62],
];

const ORBIT_SPEED = [0.085, -0.062, 0.048];

const NODE_POSITIONS = CORE_NODES.map((node) => {
  const rad = (node.angle * Math.PI) / 180;
  return {
    id: node.id,
    position: [
      Math.cos(rad) * NODE_RADIUS,
      Math.sin(rad * 2) * 0.22,
      Math.sin(rad) * NODE_RADIUS,
    ] as [number, number, number],
  };
});

const NODE_VECTORS = NODE_POSITIONS.map(({ position }) => new THREE.Vector3(...position));

/** Tiny procedural studio environment — no HDR asset, no network dependency. */
function useStudioEnvironment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  const envMap = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const base = ctx.createLinearGradient(0, 0, 0, canvas.height);
    base.addColorStop(0, '#ffffff');
    base.addColorStop(0.48, '#eef5ff');
    base.addColorStop(1, '#cfdff6');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const key = ctx.createRadialGradient(74, 38, 2, 74, 38, 78);
    key.addColorStop(0, '#ffffff');
    key.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = key;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const fill = ctx.createRadialGradient(196, 92, 2, 196, 92, 70);
    fill.addColorStop(0, 'rgba(105,177,255,0.55)');
    fill.addColorStop(1, 'rgba(105,177,255,0)');
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;

    const pmrem = new THREE.PMREMGenerator(gl);
    const target = pmrem.fromEquirectangular(texture);
    texture.dispose();
    pmrem.dispose();
    return target.texture;
  }, [gl]);

  useEffect(() => {
    if (!envMap) return;
    scene.environment = envMap;
    return () => {
      scene.environment = null;
    };
  }, [envMap, scene]);

  return envMap;
}

/* ---------------------------------------------------------------------- rig */

function Rig({
  reduceMotion,
  model,
  onProject,
}: {
  reduceMotion: boolean;
  model?: SystemCoreModelSource;
  onProject?: (points: { id: string; x: number; y: number }[]) => void;
}) {
  useStudioEnvironment();

  const tilt = useRef<THREE.Group>(null!);
  const core = useRef<THREE.Group>(null!);
  const coreMat = useRef<THREE.MeshPhysicalMaterial>(null!);
  const glowMat = useRef<THREE.MeshBasicMaterial>(null!);
  const orbitGroups = useRef<(THREE.Group | null)[]>([]);
  const orbitInner = useRef<(THREE.Group | null)[]>([]);
  const orbitMat = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const runnerMat = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const nodeGroups = useRef<(THREE.Group | null)[]>([]);
  const nodeMat = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const linkMat = useRef<THREE.LineBasicMaterial>(null!);

  const pointerTarget = useRef({ x: 0, y: 0 });
  const pointerCurrent = useRef({ x: 0, y: 0 });

  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const worldVec = useMemo(() => new THREE.Vector3(), []);
  const projectedRef = useRef<{ id: string; x: number; y: number }[]>([]);

  const linkGeometry = useMemo(() => {
    const points: number[] = [];
    NODE_POSITIONS.forEach(({ position }) => points.push(0, 0, 0, ...position));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return geometry;
  }, []);

  useEffect(() => () => linkGeometry.dispose(), [linkGeometry]);

  /* Pointer tracking is local to the canvas — the page never follows the mouse. */
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const el = gl.domElement;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointerTarget.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerTarget.current.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    };
    const onLeave = () => {
      pointerTarget.current.x = 0;
      pointerTarget.current.y = 0;
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [gl]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const t = reduceMotion ? INTRO_DONE : state.clock.getElapsedTime();
    const alive = t > INTRO_DONE;

    /* ---- intro ---- */
    const coreIn = seg(t, 0.05, 0.6);
    const coreStable = seg(t, 0.5, 0.95);
    const linkIn = seg(t, 1.85, 2.3);

    if (core.current) {
      const breathe = alive ? 1 + Math.sin(state.clock.getElapsedTime() * 0.9) * 0.006 : 1;
      const s = (0.9 + 0.1 * coreIn) * breathe;
      core.current.scale.setScalar(s);
    }
    if (coreMat.current) coreMat.current.opacity = coreIn * 0.98;
    if (glowMat.current) glowMat.current.opacity = 0.14 + coreStable * 0.16;
    if (linkMat.current) linkMat.current.opacity = linkIn * 0.22;

    /* ---- orbits ---- */
    const orbitSegments: [number, number][] = [
      [0.5, 0.95],
      [0.85, 1.3],
      [1.2, 1.65],
    ];
    orbitSegments.forEach(([from, to], index) => {
      const reveal = seg(t, from, to);
      const group = orbitGroups.current[index];
      const inner = orbitInner.current[index];
      const material = orbitMat.current[index];
      const runner = runnerMat.current[index];

      if (group) {
        const s = 0.24 + 0.76 * reveal;
        group.scale.setScalar(s);
      }
      if (inner && alive) inner.rotation.z += ORBIT_SPEED[index] * dt;
      else if (inner && !reduceMotion) inner.rotation.z = ORBIT_SPEED[index] * Math.max(0, t - 0.5);
      if (material) material.opacity = reveal * 0.34;
      if (runner) runner.opacity = reveal * (0.75 + Math.sin(state.clock.getElapsedTime() * 2 + index) * 0.12);
    });

    /* ---- outer nodes: they separate from the core like droplets ---- */
    const nodeReveal = seg(t, 1.5, 2.05);
    nodeGroups.current.forEach((group, index) => {
      if (!group) return;
      const radial = 0.72 + 0.28 * nodeReveal;
      const base = NODE_VECTORS[index];
      const bob = alive ? Math.sin(state.clock.getElapsedTime() * 0.7 + index * 1.1) * 0.02 : 0;
      group.scale.setScalar(Math.max(0.001, 0.35 + 0.65 * nodeReveal));
      group.position.set(base.x * radial, base.y * radial + bob, base.z * radial);
    });
    nodeMat.current.forEach((material, index) => {
      if (material) material.opacity = seg(t, 1.5 + index * 0.03, 2.0 + index * 0.03) * 0.9;
    });

    /* ---- reconcile DOM labels with the real camera projection ---- */
    if (onProject) {
      const list = projectedRef.current;
      list.length = 0;
      nodeGroups.current.forEach((group, index) => {
        if (!group) return;
        group.getWorldPosition(worldVec);
        worldVec.project(camera);
        list.push({
          id: NODE_POSITIONS[index].id,
          x: (worldVec.x * 0.5 + 0.5) * size.width,
          y: (-worldVec.y * 0.5 + 0.5) * size.height,
        });
      });
      onProject(list);
    }

    /* ---- pointer tilt: Y ±4°, X ±2°, critically damped ---- */
    const amp = reduceMotion ? 0 : 1;
    pointerCurrent.current.x += (pointerTarget.current.x - pointerCurrent.current.x) * Math.min(1, dt * 4.2);
    pointerCurrent.current.y += (pointerTarget.current.y - pointerCurrent.current.y) * Math.min(1, dt * 4.2);
    if (tilt.current) {
      const targetY = THREE.MathUtils.degToRad(4) * pointerCurrent.current.x * amp;
      const targetX = -THREE.MathUtils.degToRad(2) * pointerCurrent.current.y * amp;
      tilt.current.rotation.y += (targetY - tilt.current.rotation.y) * Math.min(1, dt * 5);
      tilt.current.rotation.x += (targetX - tilt.current.rotation.x) * Math.min(1, dt * 5);
    }
  });

  return (
    <group ref={tilt}>
      <ambientLight intensity={0.75} />
      <directionalLight position={[3.4, 4.2, 3.2]} intensity={1.15} color="#ffffff" />
      <directionalLight position={[-3.6, -1.6, -2.4]} intensity={0.4} color="#69b1ff" />
      <pointLight position={[0, 0, 0]} intensity={0.6} color="#4096ff" distance={4} />

      {/* core */}
      <group ref={core}>
        {model ? (
          <GlbCore source={model} />
        ) : (
          <>
            <mesh>
              <sphereGeometry args={[1.34, 64, 64]} />
              <meshPhysicalMaterial
                ref={coreMat}
                color="#ffffff"
                transparent
                opacity={0}
                roughness={0.06}
                metalness={0}
                transmission={0.94}
                thickness={1.15}
                ior={1.44}
                clearcoat={1}
                clearcoatRoughness={0.05}
                envMapIntensity={1.25}
              />
            </mesh>
            <mesh>
              <icosahedronGeometry args={[0.66, 3]} />
              <meshBasicMaterial ref={glowMat} color="#4096ff" transparent opacity={0.16} wireframe />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.5, 32, 32]} />
              <meshStandardMaterial
                color="#e6f4ff"
                emissive="#69b1ff"
                emissiveIntensity={0.5}
                roughness={0.35}
                metalness={0.05}
                transparent
                opacity={0.72}
              />
            </mesh>
          </>
        )}
      </group>

      {/* three orbits — one per backend */}
      {ORBIT_TILTS.map((rotation, index) => (
        <group
          key={index}
          ref={(el) => {
            orbitGroups.current[index] = el;
          }}
          rotation={rotation}
        >
          <group
            ref={(el) => {
              orbitInner.current[index] = el;
            }}
          >
            <mesh>
              <torusGeometry args={[ORBIT_RADIUS, 0.0055, 8, 160]} />
              <meshBasicMaterial
                ref={(el) => {
                  orbitMat.current[index] = el;
                }}
                color="#4096ff"
                transparent
                opacity={0}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[ORBIT_RADIUS, 0, 0]}>
              <sphereGeometry args={[0.055, 20, 20]} />
              <meshBasicMaterial
                ref={(el) => {
                  runnerMat.current[index] = el;
                }}
                color="#1677ff"
                transparent
                opacity={0}
                depthWrite={false}
              />
            </mesh>
          </group>
        </group>
      ))}

      {/* outer nodes + links */}
      <lineSegments geometry={linkGeometry}>
        <lineBasicMaterial ref={linkMat} color="#4096ff" transparent opacity={0} depthWrite={false} />
      </lineSegments>

      {NODE_POSITIONS.map((node, index) => (
        <group
          key={node.id}
          ref={(el) => {
            nodeGroups.current[index] = el;
          }}
          position={node.position}
        >
          <mesh>
            <sphereGeometry args={[0.088, 24, 24]} />
            <meshStandardMaterial
              ref={(el) => {
                nodeMat.current[index] = el;
              }}
              color="#ffffff"
              roughness={0.12}
              metalness={0.1}
              emissive="#69b1ff"
              emissiveIntensity={0.28}
              transparent
              opacity={0}
              envMapIntensity={1.4}
            />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.17, 0.0035, 8, 64]} />
            <meshBasicMaterial color="#69b1ff" transparent opacity={0.3} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------- canvas */

export interface SystemCoreSceneProps {
  reduceMotion?: boolean;
  className?: string;
  model?: SystemCoreModelSource;
  onProject?: (points: { id: string; x: number; y: number }[]) => void;
}

export default function SystemCoreScene({
  reduceMotion = false,
  className,
  model,
  onProject,
}: SystemCoreSceneProps) {
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0.35, 6.6], fov: 36 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%' }}
      >
        <Rig reduceMotion={reduceMotion} model={model} onProject={onProject} />
      </Canvas>
    </div>
  );
}
