export interface SceneObject3D {
  geometry: "box" | "sphere" | "torus" | "cylinder" | "dodecahedron";
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color?: string;
  metalness?: number;
  roughness?: number;
  animation?: "none" | "float" | "rotate";
  speed?: number;
}

export interface Slide {
  id: string;
  order: number;
  type?: "2d" | "3d";
  html?: string;
  sceneObjects?: SceneObject3D[];
  title?: string;
  subtitle?: string;
  backgroundColor?: string;
}

const REVEAL_CDN = "https://cdn.jsdelivr.net/npm/reveal.js@5.1.0";
const THREE_CDN =
  "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

function normalizeSlide(s: Slide): Slide {
  // Legacy slides without type are 2d
  if (!s.type) return { ...s, type: "2d", html: s.html || "" };
  return s;
}

function build3DSection(slide: Slide, idx: number): string {
  const bg = slide.backgroundColor || "#111111";
  const overlayHtml = [
    slide.title ? `<h1 style="margin:0;font-size:2.5em;font-weight:900;">${slide.title}</h1>` : "",
    slide.subtitle ? `<p style="margin:0.3em 0 0;font-size:1.2em;opacity:0.8;">${slide.subtitle}</p>` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `<div class="three-slide" data-scene-idx="${idx}" style="position:relative;width:100%;height:100%;background:${bg};">
  <canvas id="three-canvas-${idx}" style="position:absolute;top:0;left:0;width:100%;height:100%;"></canvas>
  <div style="position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center;color:#fff;pointer-events:none;">
    ${overlayHtml}
  </div>
</div>`;
}

function buildThreeScripts(slides: Slide[]): string {
  const sceneDefs = slides
    .map((s, i) => {
      if (s.type !== "3d") return null;
      return { idx: i, objects: s.sceneObjects || [] };
    })
    .filter(Boolean);

  if (sceneDefs.length === 0) return "";

  const sceneJSON = JSON.stringify(sceneDefs);

  return `<script type="module">
import * as THREE from '${THREE_CDN}';

const sceneDefs = ${sceneJSON};
const scenes = {};

function createGeometry(type) {
  switch(type) {
    case 'sphere': return new THREE.SphereGeometry(0.6, 32, 32);
    case 'torus': return new THREE.TorusGeometry(0.5, 0.2, 16, 48);
    case 'cylinder': return new THREE.CylinderGeometry(0.4, 0.4, 1, 32);
    case 'dodecahedron': return new THREE.DodecahedronGeometry(0.6);
    default: return new THREE.BoxGeometry(1, 1, 1);
  }
}

function initScene(def) {
  const canvas = document.getElementById('three-canvas-' + def.idx);
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const w = canvas.parentElement.clientWidth || 960;
  const h = canvas.parentElement.clientHeight || 540;
  renderer.setSize(w, h);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
  camera.position.z = 5;

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8);
  dl.position.set(3, 4, 5);
  scene.add(dl);

  const meshes = [];
  for (const obj of def.objects) {
    const geo = createGeometry(obj.geometry);
    const mat = new THREE.MeshStandardMaterial({
      color: obj.color || '#00d4aa',
      metalness: obj.metalness ?? 0.3,
      roughness: obj.roughness ?? 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    if (obj.position) mesh.position.set(...obj.position);
    if (obj.rotation) mesh.rotation.set(...obj.rotation);
    if (obj.scale) mesh.scale.set(...obj.scale);
    mesh.userData.animation = obj.animation || 'none';
    mesh.userData.speed = obj.speed || 1;
    scene.add(mesh);
    meshes.push(mesh);
  }

  scenes[def.idx] = { renderer, scene, camera, meshes, active: false, raf: null };
}

function animate(idx) {
  const s = scenes[idx];
  if (!s || !s.active) return;
  s.raf = requestAnimationFrame(() => animate(idx));
  const t = performance.now() * 0.001;
  for (const mesh of s.meshes) {
    const sp = mesh.userData.speed;
    if (mesh.userData.animation === 'rotate') {
      mesh.rotation.y += 0.01 * sp;
      mesh.rotation.x += 0.005 * sp;
    } else if (mesh.userData.animation === 'float') {
      mesh.position.y += Math.sin(t * sp) * 0.003;
    }
  }
  s.renderer.render(s.scene, s.camera);
}

function startScene(idx) {
  const s = scenes[idx];
  if (!s || s.active) return;
  s.active = true;
  // Resize to current container
  const canvas = document.getElementById('three-canvas-' + idx);
  if (canvas) {
    const w = canvas.parentElement.clientWidth || 960;
    const h = canvas.parentElement.clientHeight || 540;
    s.renderer.setSize(w, h);
    s.camera.aspect = w / h;
    s.camera.updateProjectionMatrix();
  }
  animate(idx);
}

function stopScene(idx) {
  const s = scenes[idx];
  if (!s) return;
  s.active = false;
  if (s.raf) cancelAnimationFrame(s.raf);
}

// Init all scenes
for (const def of sceneDefs) initScene(def);

// Activate scene on current slide
Reveal.on('slidechanged', (e) => {
  // Stop all
  for (const idx of Object.keys(scenes)) stopScene(Number(idx));
  // Start if 3D
  const el = e.currentSlide.querySelector('.three-slide');
  if (el) startScene(Number(el.dataset.sceneIdx));
});

// Initial
document.addEventListener('DOMContentLoaded', () => {
  const first = document.querySelector('.reveal .slides section .three-slide');
  if (first) startScene(Number(first.dataset.sceneIdx));
});

window.addEventListener('resize', () => {
  for (const [idx, s] of Object.entries(scenes)) {
    const canvas = document.getElementById('three-canvas-' + idx);
    if (canvas && s.active) {
      const w = canvas.parentElement.clientWidth || 960;
      const h = canvas.parentElement.clientHeight || 540;
      s.renderer.setSize(w, h);
      s.camera.aspect = w / h;
      s.camera.updateProjectionMatrix();
    }
  }
});
<\/script>`;
}

export function buildRevealHtml(slides: Slide[], theme = "black"): string {
  const sorted = [...slides].map(normalizeSlide).sort((a, b) => a.order - b.order);
  const has3D = sorted.some((s) => s.type === "3d");
  const hasThreeBg = sorted.some((s) => s.type === "2d" && (s.html || "").includes("three-bg"));

  const sections = sorted
    .map((s, i) => {
      if (s.type === "3d") {
        return `        <section data-background-color="${s.backgroundColor || "#111111"}">${build3DSection(s, i)}</section>`;
      }
      return `        <section>${s.html || ""}</section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Presentation</title>
  <link rel="stylesheet" href="${REVEAL_CDN}/dist/reset.css" />
  <link rel="stylesheet" href="${REVEAL_CDN}/dist/reveal.css" />
  <link rel="stylesheet" href="${REVEAL_CDN}/dist/theme/${theme}.css" />
  <style>
    .reveal h1, .reveal h2, .reveal h3 { text-transform: none; }
    .reveal ul { text-align: left; }
    .reveal img { max-width: 100%; max-height: 50vh; border-radius: 8px; object-fit: cover; }
    /* Override any inline styles the LLM may sneak in */
    .reveal section * { min-height: unset !important; background: unset !important; padding: revert !important; margin: revert !important; }
    .reveal section *[style] { font-size: inherit !important; color: inherit !important; }
    /* But allow 3D slide styles */
    .reveal section .three-slide, .reveal section .three-slide * { background: unset; padding: unset; margin: unset; font-size: unset; color: unset; min-height: unset; }
    .reveal section .three-slide *[style] { font-size: unset !important; color: unset !important; background: unset !important; padding: unset !important; margin: unset !important; }

    /* Layout utilities */
    .columns { display: flex; gap: 2rem; align-items: center; text-align: left; }
    .col { flex: 1; }
    .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-top: 1.5rem; }
    .stat { text-align: center; }
    .stat h3 { font-size: 2.5em; font-weight: 900; margin: 0; }
    .stat p { font-size: 0.8em; opacity: 0.7; margin: 0.3em 0 0; }
    .accent { color: #00d4aa; }
    .img-right, .img-left { display: flex; gap: 2rem; align-items: center; text-align: left; }
    .img-left { flex-direction: row-reverse; }
    .img-right img, .img-left img { max-width: 45%; }
    .quote-slide { display: flex; flex-direction: column; justify-content: center; align-items: center; }
    .quote-slide blockquote { font-size: 1.3em; font-style: italic; border-left: 4px solid #00d4aa; padding-left: 1em; margin: 0; }
    .centered { display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 60vh; }

    /* Three.js background (legacy 2D particle bg) */
    #three-canvas { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none; opacity: 0; transition: opacity 0.8s; }
    #three-canvas.active { opacity: 1; }
  </style>
</head>
<body>
  ${hasThreeBg ? '<canvas id="three-canvas"></canvas>' : ""}
  <div class="reveal">
    <div class="slides">
${sections}
    </div>
  </div>
  <script src="${REVEAL_CDN}/dist/reveal.js"><\/script>
  <script>
    Reveal.initialize({ hash: true, transition: 'slide' });
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'goToSlide' && typeof e.data.index === 'number') {
        Reveal.slide(e.data.index);
      }
    });
  <\/script>
  ${hasThreeBg ? `<script type="module">
import * as THREE from '${THREE_CDN}';
const canvas = document.getElementById('three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

// Particles
const geo = new THREE.BufferGeometry();
const count = 800;
const pos = new Float32Array(count * 3);
for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 15;
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
const mat = new THREE.PointsMaterial({ color: 0x00d4aa, size: 0.04, transparent: true, opacity: 0.8 });
const points = new THREE.Points(geo, mat);
scene.add(points);

function animate() {
  requestAnimationFrame(animate);
  points.rotation.y += 0.001;
  points.rotation.x += 0.0005;
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Toggle canvas based on current slide having .three-bg
Reveal.on('slidechanged', (e) => {
  canvas.classList.toggle('active', !!e.currentSlide.querySelector('.three-bg'));
});
// Initial check
document.addEventListener('DOMContentLoaded', () => {
  const first = document.querySelector('.reveal .slides section');
  if (first && first.querySelector('.three-bg')) canvas.classList.add('active');
});
<\/script>` : ""}
  ${has3D ? buildThreeScripts(sorted) : ""}
</body>
</html>`;
}
