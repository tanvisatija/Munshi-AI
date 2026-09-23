// "Growth Ascension": bars rise from a glowing grid, dissolve into particles that converge
// into the extruded Munshi "M", which spins once to face the camera. Lazy-loaded chunk.
//
// Budget (kept modest for mid-range laptops): 7 boxes, ~1-2k triangles for the logo,
// <= 220 points, one Bloom pass, dpr capped at 1.5 (drops to 1 and no bloom if FPS falls).
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, Html, PerformanceMonitor } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LOGO_SVG_MARKUP } from '../brand';
import { T } from './timeline';

const NAVY = '#002E6E';
const CYAN = '#00BAF2';

// ---------------------------------------------------------------- easing

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const easeInCubic = (x) => x ** 3;
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
const easeOutBack = (x) => {
  const c1 = 1.4;
  return 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};

// ---------------------------------------------------------------- logo geometry from the SVG

// Same strokes as src/assets/munshi_ai_logo.svg, used if that file is missing or unreadable.
const FALLBACK_LOGO = {
  width: 34,
  segments: [
    { a: [148, 366], b: [148, 172], color: '#FFFFFF' },
    { a: [148, 172], b: [256, 280], color: '#FFFFFF' },
    { a: [256, 280], b: [332, 176], color: '#FFFFFF' },
    { a: [332, 176], b: [396, 116], color: CYAN },
  ],
  triangles: [[[396, 116], [350, 122], [380, 148]]],
};

/** Pull straight stroke segments ("M x y L x y") and filled triangles out of the logo SVG. */
function parseLogo(svg) {
  if (!svg) return FALLBACK_LOGO;
  const segments = [];
  const triangles = [];
  let width = 34;
  for (const tag of svg.match(/<path\b[^>]*>/g) || []) {
    const d = tag.match(/\sd="([^"]+)"/)?.[1] || '';
    const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    const stroke = tag.match(/\sstroke="([^"]+)"/)?.[1];
    const sw = Number(tag.match(/\sstroke-width="([^"]+)"/)?.[1]);
    if (stroke && nums.length === 4 && /^\s*M/i.test(d)) {
      segments.push({ a: [nums[0], nums[1]], b: [nums[2], nums[3]], color: stroke });
      if (sw) width = sw;
    } else if (!stroke && nums.length === 6 && /Z\s*$/i.test(d)) {
      triangles.push([[nums[0], nums[1]], [nums[2], nums[3]], [nums[4], nums[5]]]);
    }
  }
  return segments.length ? { width, segments, triangles } : FALLBACK_LOGO;
}

const LOGO_RADIUS = 1.2;
const SVG_SCALE = (LOGO_RADIUS * 2) / 512;
const toLocal = ([x, y]) => new THREE.Vector2((x - 256) * SVG_SCALE, -(y - 256) * SVG_SCALE);

/** Rounded capsule outline between two points: a stroke with round caps, as a 2D shape. */
function capsule(a, b, r) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const s = new THREE.Shape();
  s.absarc(b.x, b.y, r, ang - Math.PI / 2, ang + Math.PI / 2, false);
  s.absarc(a.x, a.y, r, ang + Math.PI / 2, ang + (3 * Math.PI) / 2, false);
  s.closePath();
  return s;
}

const EXTRUDE = { depth: 0.16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.018, bevelSegments: 2, curveSegments: 8 };

function buildLogo() {
  const logo = parseLogo(LOGO_SVG_MARKUP);
  const r = (logo.width / 2) * SVG_SCALE;
  const byColor = new Map();
  const targets = [];
  const add = (color, geo) => {
    const key = color.toUpperCase() === '#FFFFFF' ? 'white' : 'accent';
    if (!byColor.has(key)) byColor.set(key, []);
    byColor.get(key).push(geo);
  };
  for (const s of logo.segments) {
    const a = toLocal(s.a);
    const b = toLocal(s.b);
    add(s.color, new THREE.ExtrudeGeometry(capsule(a, b, r), EXTRUDE));
    // Points along the stroke: where particles converge.
    for (let i = 0; i <= 12; i += 1) targets.push(new THREE.Vector3().lerpVectors(new THREE.Vector3(a.x, a.y, 0), new THREE.Vector3(b.x, b.y, 0), i / 12));
  }
  for (const tri of logo.triangles) {
    const shape = new THREE.Shape(tri.map(toLocal));
    add(CYAN, new THREE.ExtrudeGeometry(shape, { ...EXTRUDE, bevelEnabled: false }));
  }
  const merged = {};
  for (const [key, list] of byColor) {
    const g = mergeGeometries(list.map((x) => x.toNonIndexed()), false);
    g.translate(0, 0, -EXTRUDE.depth / 2);
    merged[key] = g;
    list.forEach((x) => x.dispose());
  }
  const disc = new THREE.CylinderGeometry(LOGO_RADIUS, LOGO_RADIUS, 0.1, 48);
  disc.rotateX(Math.PI / 2);
  disc.translate(0, 0, -0.16);
  const rim = new THREE.TorusGeometry(LOGO_RADIUS, 0.035, 8, 64);
  rim.translate(0, 0, -0.1);
  return { white: merged.white, accent: merged.accent, disc, rim, targets };
}

// ---------------------------------------------------------------- scene pieces

const BAR_COUNT = 7;
const BARS = Array.from({ length: BAR_COUNT }, (_, i) => ({ x: -2.1 + (i * 4.2) / (BAR_COUNT - 1), h: 0.55 + i * 0.36 }));

function useDisposable(factory) {
  const value = useMemo(factory, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    Object.values(value).forEach((v) => (Array.isArray(v) ? v : [v]).forEach((x) => x?.dispose?.()));
  }, [value]);
  return value;
}

function Bars({ tRef }) {
  const meshes = useRef([]);
  const res = useDisposable(() => {
    const geo = new THREE.BoxGeometry(0.42, 1, 0.42);
    geo.translate(0, 0.5, 0);
    const mats = BARS.map(() => new THREE.MeshStandardMaterial({ color: '#0d4f96', emissive: CYAN, emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.35, transparent: true }));
    return { geo, mats };
  });
  useFrame(() => {
    const t = tRef.current;
    BARS.forEach((b, i) => {
      const m = meshes.current[i];
      if (!m) return;
      const start = T.barStart + i * T.barGap;
      const rise = easeOutBack(seg(t, start, start + T.barRise));
      const d = easeInCubic(seg(t, T.dissolveStart + i * 0.03, T.dissolveEnd));
      const w = 1 - d * 0.5;
      m.scale.set(w, Math.max(0.0001, b.h * rise * (1 - d)), w);
      res.mats[i].opacity = 1 - d;
      m.visible = d < 1 && rise > 0;
    });
  });
  return BARS.map((b, i) => (
    <mesh key={i} ref={(el) => { meshes.current[i] = el; }} geometry={res.geo} material={res.mats[i]} position={[b.x, 0, 0]} />
  ));
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function Particles({ tRef, count, targets, logoPos }) {
  const res = useDisposable(() => {
    const starts = [];
    const ctrls = [];
    const ends = [];
    const delays = [];
    for (let i = 0; i < count; i += 1) {
      const b = BARS[i % BAR_COUNT];
      const s = new THREE.Vector3(b.x + (Math.random() - 0.5) * 0.42, Math.random() * b.h, (Math.random() - 0.5) * 0.42);
      const e = targets[Math.floor(Math.random() * targets.length)].clone().add(logoPos)
        .add(new THREE.Vector3((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.1));
      // Drift upward first, then converge: a quadratic curve with a raised control point.
      const c = new THREE.Vector3((s.x + e.x) / 2 + (Math.random() - 0.5) * 0.8, Math.max(s.y, e.y) + 0.9 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8);
      starts.push(s); ctrls.push(c); ends.push(e); delays.push(Math.random() * 0.25);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const mat = new THREE.PointsMaterial({ size: 0.075, color: CYAN, map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    return { geo, mat, starts, ctrls, ends, delays, tex: mat.map };
  });
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const t = tRef.current;
    const arr = res.geo.attributes.position.array;
    for (let i = 0; i < count; i += 1) {
      const k = easeInOutCubic(seg(t, T.dissolveStart + res.delays[i], T.particleArrive + res.delays[i] * 0.4));
      const u = 1 - k;
      p.copy(res.starts[i]).multiplyScalar(u * u).addScaledVector(res.ctrls[i], 2 * u * k).addScaledVector(res.ends[i], k * k);
      arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
    }
    res.geo.attributes.position.needsUpdate = true;
    res.mat.opacity = seg(t, T.particleFadeIn, T.particleFadeIn + 0.15) * (1 - seg(t, ...T.particleFadeOut));
  });
  return <points geometry={res.geo} material={res.mat} frustumCulled={false} />;
}

function Logo({ tRef, parts, position }) {
  const group = useRef();
  const mats = useDisposable(() => ({
    white: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.18, roughness: 0.3, metalness: 0.1 }),
    accent: new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 1.1, roughness: 0.3 }),
    disc: new THREE.MeshStandardMaterial({ color: '#0a3d82', roughness: 0.55, metalness: 0.25 }),
    rim: new THREE.MeshBasicMaterial({ color: CYAN }),
  }));
  useFrame(() => {
    const t = tRef.current;
    const g = group.current;
    if (!g) return;
    // Stays in the scene from frame one (at near-zero scale) so its shaders compile up front,
    // not mid-animation when it appears.
    g.scale.setScalar(Math.max(0.0001, easeOutBack(seg(t, T.logoIn, T.logoScaleEnd))));
    g.rotation.y = -Math.PI * 2 * (1 - easeOutCubic(seg(t, T.logoIn, T.logoSpinEnd))); // one full turn, then settles
  });
  return (
    <group ref={group} position={position} scale={0.0001}>
      <mesh geometry={parts.disc} material={mats.disc} />
      <mesh geometry={parts.rim} material={mats.rim} />
      {parts.white && <mesh geometry={parts.white} material={mats.white} />}
      {parts.accent && <mesh geometry={parts.accent} material={mats.accent} />}
    </group>
  );
}

function Wordmark({ tRef, position, stacked }) {
  const [show, setShow] = useState(false);
  useFrame(() => {
    if (!show && tRef.current >= T.wordmarkAt) setShow(true);
  });
  return (
    <Html position={position} center={stacked} zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          transform: stacked ? 'none' : 'translateY(-50%)',
          opacity: show ? 1 : 0,
          translate: show ? '0 0' : '0 10px',
          transition: 'opacity 420ms ease-out, translate 420ms ease-out',
          textAlign: stacked ? 'center' : 'left',
          whiteSpace: 'nowrap',
        }}
      >
        <div className="font-heading text-[34px] font-bold leading-none text-white sm:text-[44px]">
          Munshi <span className="text-cerulean">AI</span>
        </div>
        <div className="mt-2 font-heading text-sm font-bold text-cerulean-100 sm:text-base">Your business, understood.</div>
      </div>
    </Html>
  );
}

/** Frames the content for any aspect ratio, then dollies in slowly for the whole sequence. */
function useLayout() {
  const { size, camera } = useThree();
  return useMemo(() => {
    const aspect = size.width / Math.max(size.height, 1);
    const stacked = aspect < 0.9;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const contentW = stacked ? 4.7 : 5.8;
    const contentH = stacked ? 4.8 : 3.4;
    const dist = Math.max(contentW / 2 / (tanHalf * aspect), contentH / 2 / tanHalf) * (stacked ? 1.08 : 1.18);
    return {
      stacked,
      dist,
      logoPos: stacked ? new THREE.Vector3(0, 2.15, 0) : new THREE.Vector3(-1.45, 1.35, 0),
      wordPos: stacked ? [0, 0.35, 0] : [0.05, 1.35, 0],
      lookY: stacked ? 1.75 : 1.3,
    };
  }, [size.width, size.height, camera.fov]);
}

function Rig({ tRef, layout }) {
  useFrame(({ camera }) => {
    const k = easeInOutSine(Math.min(tRef.current / T.cameraDolly, 1));
    camera.position.set(0, 0.3 + 0.5 * k, layout.dist * (1.08 - 0.14 * k)); // low, looking slightly up, drifting in
    camera.lookAt(0, layout.lookY + 0.15 * k, 0);
  });
  return null;
}

/** Drives the shared timeline and reports the first rendered frame. */
function Clock({ tRef, onReady }) {
  const start = useRef(null);
  useFrame(({ clock, gl, scene, camera }) => {
    if (start.current == null) {
      gl.compile(scene, camera); // precompile every material before the sequence starts
      start.current = clock.elapsedTime;
      onReady?.();
    }
    tRef.current = clock.elapsedTime - start.current;
  });
  return null;
}

function World({ tRef, onReady, low }) {
  const layout = useLayout();
  const parts = useDisposable(buildLogo);
  return (
    <>
      <color attach="background" args={[NAVY]} />
      <fog attach="fog" args={[NAVY, 9, 26]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 6]} intensity={1.1} />
      {/* Cyan rim light from behind the bars */}
      <directionalLight position={[0, 3, -6]} intensity={2.6} color={CYAN} />
      <Grid
        position={[0, 0, 0]}
        infiniteGrid
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#0d5c93"
        sectionSize={2.5}
        sectionThickness={1}
        sectionColor={CYAN}
        fadeDistance={24}
        fadeStrength={1.4}
      />
      <Bars tRef={tRef} />
      <Particles key={low ? "low" : "full"} tRef={tRef} count={low ? 110 : 220} targets={parts.targets} logoPos={layout.logoPos} />
      <Logo tRef={tRef} parts={parts} position={layout.logoPos} />
      <Wordmark tRef={tRef} position={layout.wordPos} stacked={layout.stacked} />
      <Rig tRef={tRef} layout={layout} />
      <Clock tRef={tRef} onReady={onReady} />
    </>
  );
}

export default function Scene3D({ onReady, onContextLost, paused = false }) {
  const tRef = useRef(0);
  const [low, setLow] = useState(false);
  return (
    <Canvas
      className="!absolute inset-0"
      flat
      frameloop={paused ? 'never' : 'always'}
      dpr={low ? 1 : [1, 1.5]}
      gl={{ antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' }}
      camera={{ fov: 45, near: 0.1, far: 60, position: [0, 0.3, 9] }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          onContextLost?.();
        });
      }}
    >
      {/* Drops resolution, particles and bloom if the machine can't keep up. */}
      <PerformanceMonitor onDecline={() => setLow(true)} />
      <World tRef={tRef} onReady={onReady} low={low} />
      {!low && (
        <EffectComposer multisampling={0} disableNormalPass>
          <Bloom mipmapBlur intensity={1.15} luminanceThreshold={0.32} luminanceSmoothing={0.2} radius={0.7} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
