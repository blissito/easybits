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

export const SCENE_EFFECT_IDS = [
  "particleField",
  "morphingSphere",
  "galaxySpiral",
  "networkNodes",
  "torusKnot",
  "waveGrid",
  "floatingBlobs",
  "starfield",
  "dnaHelix",
  "geometricStorm",
] as const;

export type SceneEffectId = (typeof SCENE_EFFECT_IDS)[number];

export interface SceneEffect3D {
  effect: SceneEffectId;
  primaryColor?: string;
  secondaryColor?: string;
  speed?: number;
  density?: number;
  backgroundColor?: string;
}

export interface Slide {
  id: string;
  order: number;
  type?: "2d" | "3d";
  html?: string;
  /** Legacy 3D system */
  sceneObjects?: SceneObject3D[];
  /** New effect-based 3D system */
  sceneEffect?: SceneEffect3D;
  title?: string;
  subtitle?: string;
  backgroundColor?: string;
}

const REVEAL_CDN = "https://cdn.jsdelivr.net/npm/reveal.js@5.1.0";
const THREE_CDN =
  "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

function normalizeSlide(s: Slide): Slide {
  if (!s.type) return { ...s, type: "2d", html: s.html || "" };
  return s;
}

function build3DSection(slide: Slide, idx: number): string {
  const bg = slide.backgroundColor || slide.sceneEffect?.backgroundColor || "#111111";
  const overlayHtml = [
    slide.title ? `<h1 style="margin:0;font-size:2.5em;font-weight:900;">${slide.title}</h1>` : "",
    slide.subtitle ? `<p style="margin:0.3em 0 0;font-size:1.2em;opacity:0.8;">${slide.subtitle}</p>` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `<div class="three-slide" data-scene-idx="${idx}" style="position:relative;width:960px;height:700px;background:${bg};">
  <canvas id="three-canvas-${idx}" style="position:absolute;top:0;left:0;width:100%;height:100%;"></canvas>
  <div style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;color:#fff;pointer-events:none;">
    ${overlayHtml}
  </div>
</div>`;
}

/* ---------- Effect Code Generators ---------- */

function buildEffectCode(effect: SceneEffect3D): string {
  const pc = effect.primaryColor || "#00d4aa";
  const sc = effect.secondaryColor || "#9870ed";
  const sp = effect.speed ?? 1.0;
  const dn = effect.density ?? 1.0;

  switch (effect.effect) {
    case "particleField":
      return `(function(scene, camera, renderer, mouse, sp, dn) {
  const count = Math.floor(600 * dn);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) {
    pos[i] = (Math.random() - 0.5) * 10;
    vel[i] = (Math.random() - 0.5) * 0.02;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: '${pc}', size: 0.06, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return function(t) {
    const p = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const x = p[i3], y = p[i3+1], z = p[i3+2];
      // Curl-like noise flow
      p[i3]   += (Math.sin(y * 0.8 + t * sp) * 0.003 + vel[i3]) * sp;
      p[i3+1] += (Math.cos(x * 0.8 + t * sp) * 0.003 + vel[i3+1]) * sp;
      p[i3+2] += (Math.sin(z * 0.8 + t * sp * 0.5) * 0.002 + vel[i3+2]) * sp;
      // Wrap bounds
      if (Math.abs(p[i3]) > 5) p[i3] *= -0.9;
      if (Math.abs(p[i3+1]) > 5) p[i3+1] *= -0.9;
      if (Math.abs(p[i3+2]) > 5) p[i3+2] *= -0.9;
    }
    geo.attributes.position.needsUpdate = true;
    pts.rotation.y += 0.001 * sp;
  };
})`;

    case "morphingSphere":
      return `(function(scene, camera, renderer, mouse, sp, dn) {
  const detail = Math.floor(64 * dn);
  const geo = new THREE.SphereGeometry(1.5, detail, detail);
  const base = geo.attributes.position.array.slice();
  const mat = new THREE.MeshPhysicalMaterial({ color: '${pc}', metalness: 0.4, roughness: 0.2, wireframe: false, transparent: true, opacity: 0.85 });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  // Wireframe overlay
  const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '${sc}', wireframe: true, transparent: true, opacity: 0.15 }));
  scene.add(wire);
  const light = new THREE.PointLight('${sc}', 2, 10);
  light.position.set(2, 2, 2);
  scene.add(light);
  return function(t) {
    const p = geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const bx = base[i], by = base[i+1], bz = base[i+2];
      const noise = Math.sin(bx * 3 + t * sp * 1.5) * Math.cos(by * 3 + t * sp) * Math.sin(bz * 2 + t * sp * 0.8);
      const scale = 1 + noise * 0.25;
      p[i] = bx * scale;
      p[i+1] = by * scale;
      p[i+2] = bz * scale;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    mesh.rotation.y += 0.003 * sp;
    wire.rotation.y = mesh.rotation.y;
    light.position.x = Math.sin(t * sp) * 3;
    light.position.z = Math.cos(t * sp) * 3;
  };
})`;

    case "galaxySpiral":
      return `(function(scene, camera, renderer, mouse, sp, dn) {
  const arms = 3;
  const count = Math.floor(1200 * dn);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const c1 = new THREE.Color('${pc}');
  const c2 = new THREE.Color('${sc}');
  for (let i = 0; i < count; i++) {
    const arm = i % arms;
    const angle = (arm / arms) * Math.PI * 2 + (i / count) * Math.PI * 4;
    const radius = (i / count) * 4 + Math.random() * 0.5;
    const spread = Math.random() * 0.4;
    pos[i*3]   = Math.cos(angle) * radius + (Math.random()-0.5) * spread;
    pos[i*3+1] = (Math.random()-0.5) * 0.3;
    pos[i*3+2] = Math.sin(angle) * radius + (Math.random()-0.5) * spread;
    const mix = i / count;
    const c = c1.clone().lerp(c2, mix);
    colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.04, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  // Core glow
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), new THREE.MeshBasicMaterial({ color: '${pc}', transparent: true, opacity: 0.6 }));
  scene.add(core);
  camera.position.set(0, 3, 5);
  return function(t) {
    pts.rotation.y += 0.002 * sp;
    core.scale.setScalar(1 + Math.sin(t * sp * 2) * 0.1);
  };
})`;

    case "networkNodes":
      return `(function(scene, camera, renderer, mouse, sp, dn) {
  const nodeCount = Math.floor(30 * dn);
  const nodes = [];
  const c1 = new THREE.Color('${pc}');
  const c2 = new THREE.Color('${sc}');
  for (let i = 0; i < nodeCount; i++) {
    const geo = new THREE.SphereGeometry(0.08 + Math.random() * 0.08, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: c1.clone().lerp(c2, Math.random()) });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((Math.random()-0.5)*6, (Math.random()-0.5)*4, (Math.random()-0.5)*4);
    mesh.userData.vel = new THREE.Vector3((Math.random()-0.5)*0.005, (Math.random()-0.5)*0.005, (Math.random()-0.5)*0.005);
    scene.add(mesh);
    nodes.push(mesh);
  }
  // Lines
  const lineMat = new THREE.LineBasicMaterial({ color: '${pc}', transparent: true, opacity: 0.2 });
  const lineGeo = new THREE.BufferGeometry();
  const linePos = new Float32Array(nodeCount * nodeCount * 6);
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  scene.add(lines);
  return function(t) {
    let li = 0;
    for (let i = 0; i < nodeCount; i++) {
      const n = nodes[i];
      n.position.add(n.userData.vel.clone().multiplyScalar(sp));
      // Bounce
      ['x','y','z'].forEach(a => { if (Math.abs(n.position[a]) > 3.5) n.userData.vel[a] *= -1; });
      n.scale.setScalar(1 + Math.sin(t * sp * 2 + i) * 0.15);
    }
    // Update connections
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i+1; j < nodeCount; j++) {
        const d = nodes[i].position.distanceTo(nodes[j].position);
        if (d < 2.0) {
          linePos[li++] = nodes[i].position.x; linePos[li++] = nodes[i].position.y; linePos[li++] = nodes[i].position.z;
          linePos[li++] = nodes[j].position.x; linePos[li++] = nodes[j].position.y; linePos[li++] = nodes[j].position.z;
        }
      }
    }
    for (let k = li; k < linePos.length; k++) linePos[k] = 0;
    lineGeo.attributes.position.needsUpdate = true;
    lineGeo.setDrawRange(0, li / 3);
  };
})`;

    case "torusKnot":
      return `(function(scene, camera, renderer, mouse, sp, dn) {
  const geo = new THREE.TorusKnotGeometry(1.2, 0.35, Math.floor(128 * dn), 32, 2, 3);
  const mat = new THREE.MeshPhysicalMaterial({
    color: '${pc}', metalness: 0.6, roughness: 0.15, clearcoat: 1.0, clearcoatRoughness: 0.1
  });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  const wire = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1.25, 0.37, Math.floor(64 * dn), 16, 2, 3),
    new THREE.MeshBasicMaterial({ color: '${sc}', wireframe: true, transparent: true, opacity: 0.1 })
  );
  scene.add(wire);
  const pl = new THREE.PointLight('${sc}', 3, 8);
  scene.add(pl);
  return function(t) {
    mesh.rotation.x += 0.005 * sp;
    mesh.rotation.y += 0.008 * sp;
    wire.rotation.x = mesh.rotation.x;
    wire.rotation.y = mesh.rotation.y;
    pl.position.set(Math.sin(t * sp) * 3, Math.cos(t * sp * 0.7) * 2, Math.sin(t * sp * 0.5) * 3);
    mat.color.setHSL((t * sp * 0.02) % 1, 0.7, 0.5);
  };
})`;

    case "waveGrid":
      return `(function(scene, camera, renderer, mouse, sp, dn) {
  const size = Math.floor(25 * Math.sqrt(dn));
  const geo = new THREE.BufferGeometry();
  const count = size * size;
  const pos = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const c1 = new THREE.Color('${pc}');
  const c2 = new THREE.Color('${sc}');
  let idx = 0;
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      pos[idx*3] = (x - size/2) * 0.35;
      pos[idx*3+1] = 0;
      pos[idx*3+2] = (z - size/2) * 0.35;
      idx++;
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.9 });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  camera.position.set(0, 4, 6);
  camera.lookAt(0, 0, 0);
  return function(t) {
    const p = geo.attributes.position.array;
    const c = geo.attributes.color.array;
    let i = 0;
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        const px = (x - size/2) * 0.35;
        const pz = (z - size/2) * 0.35;
        const d = Math.sqrt(px*px + pz*pz);
        const y = Math.sin(d * 1.5 - t * sp * 2) * 0.6 + Math.sin(px * 0.5 + t * sp) * 0.3;
        p[i*3+1] = y;
        const norm = (y + 1) / 2;
        const col = c1.clone().lerp(c2, norm);
        c[i*3] = col.r; c[i*3+1] = col.g; c[i*3+2] = col.b;
        i++;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
})`;

    case "floatingBlobs":
      return `(function(scene, camera, renderer, mouse, sp, dn) {
  const blobCount = Math.floor(5 * dn);
  const blobs = [];
  const c1 = new THREE.Color('${pc}');
  const c2 = new THREE.Color('${sc}');
  for (let i = 0; i < blobCount; i++) {
    const geo = new THREE.SphereGeometry(0.5 + Math.random() * 0.5, 32, 32);
    const base = geo.attributes.position.array.slice();
    const mat = new THREE.MeshPhysicalMaterial({
      color: c1.clone().lerp(c2, i / blobCount),
      metalness: 0.1, roughness: 0.3, transparent: true, opacity: 0.7,
      transmission: 0.3, thickness: 1
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((Math.random()-0.5)*3, (Math.random()-0.5)*2, (Math.random()-0.5)*2);
    mesh.userData.base = base;
    mesh.userData.offset = Math.random() * 10;
    mesh.userData.orbitSpeed = (Math.random() - 0.5) * 0.3;
    mesh.userData.orbitRadius = 1 + Math.random() * 1.5;
    scene.add(mesh);
    blobs.push(mesh);
  }
  const pl = new THREE.PointLight('${pc}', 2, 10);
  scene.add(pl);
  return function(t) {
    for (const blob of blobs) {
      const off = blob.userData.offset;
      // Orbit
      blob.position.x = Math.sin(t * sp * 0.3 + off) * blob.userData.orbitRadius;
      blob.position.y = Math.cos(t * sp * 0.2 + off) * 0.8;
      blob.position.z = Math.cos(t * sp * 0.3 + off) * blob.userData.orbitRadius * 0.5;
      // Morph
      const p = blob.geometry.attributes.position.array;
      const b = blob.userData.base;
      for (let i = 0; i < p.length; i += 3) {
        const n = Math.sin(b[i]*4 + t*sp + off) * Math.cos(b[i+1]*4 + t*sp*0.7) * 0.15;
        p[i] = b[i] * (1+n); p[i+1] = b[i+1] * (1+n); p[i+2] = b[i+2] * (1+n);
      }
      blob.geometry.attributes.position.needsUpdate = true;
      blob.geometry.computeVertexNormals();
    }
    pl.position.set(Math.sin(t*sp)*2, 1, Math.cos(t*sp)*2);
  };
})`;

    case "starfield":
      return `(function(scene, camera, renderer, mouse, sp, dn) {
  const count = Math.floor(1000 * dn);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i*3]   = (Math.random()-0.5) * 20;
    pos[i*3+1] = (Math.random()-0.5) * 20;
    pos[i*3+2] = (Math.random()-0.5) * 20;
    sizes[i] = Math.random() * 0.08 + 0.02;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: '${pc}', size: 0.05, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
  const stars = new THREE.Points(geo, mat);
  scene.add(stars);
  // Streak lines for warp effect
  const streakGeo = new THREE.BufferGeometry();
  const streakCount = Math.floor(200 * dn);
  const sPos = new Float32Array(streakCount * 6);
  for (let i = 0; i < streakCount; i++) {
    const x = (Math.random()-0.5) * 15;
    const y = (Math.random()-0.5) * 15;
    const z = (Math.random()-0.5) * 15;
    sPos[i*6] = x; sPos[i*6+1] = y; sPos[i*6+2] = z;
    sPos[i*6+3] = x; sPos[i*6+4] = y; sPos[i*6+5] = z - 0.5;
  }
  streakGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const streakMat = new THREE.LineBasicMaterial({ color: '${sc}', transparent: true, opacity: 0.3 });
  const streaks = new THREE.LineSegments(streakGeo, streakMat);
  scene.add(streaks);
  return function(t) {
    const p = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      p[i*3+2] += 0.05 * sp;
      if (p[i*3+2] > 10) p[i*3+2] = -10;
    }
    geo.attributes.position.needsUpdate = true;
    const s = streakGeo.attributes.position.array;
    for (let i = 0; i < streakCount; i++) {
      s[i*6+2] += 0.08 * sp;
      s[i*6+5] += 0.08 * sp;
      if (s[i*6+2] > 10) { s[i*6+2] = -10; s[i*6+5] = -10.5; }
    }
    streakGeo.attributes.position.needsUpdate = true;
    stars.rotation.z += 0.0005 * sp;
  };
})`;

    case "dnaHelix":
      return `(function(scene, camera, renderer, mouse, sp, dn) {
  const pairs = Math.floor(30 * dn);
  const c1 = new THREE.Color('${pc}');
  const c2 = new THREE.Color('${sc}');
  const group = new THREE.Group();
  const spheres = [];
  const connectors = [];
  for (let i = 0; i < pairs; i++) {
    const angle = (i / pairs) * Math.PI * 4;
    const y = (i / pairs) * 8 - 4;
    const r = 1.2;
    // Strand A
    const sA = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: c1 }));
    sA.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
    sA.userData.baseAngle = angle;
    sA.userData.baseY = y;
    sA.userData.strand = 'A';
    group.add(sA);
    spheres.push(sA);
    // Strand B
    const sB = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: c2 }));
    sB.position.set(Math.cos(angle + Math.PI) * r, y, Math.sin(angle + Math.PI) * r);
    sB.userData.baseAngle = angle + Math.PI;
    sB.userData.baseY = y;
    sB.userData.strand = 'B';
    group.add(sB);
    spheres.push(sB);
    // Connector every 3rd pair
    if (i % 3 === 0) {
      const cGeo = new THREE.CylinderGeometry(0.02, 0.02, r * 2, 4);
      cGeo.rotateZ(Math.PI / 2);
      const cMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.3 });
      const connector = new THREE.Mesh(cGeo, cMat);
      connector.position.set(0, y, 0);
      connector.rotation.y = angle;
      connector.userData.baseAngle = angle;
      connector.userData.baseY = y;
      group.add(connector);
      connectors.push(connector);
    }
  }
  scene.add(group);
  camera.position.set(0, 0, 6);
  return function(t) {
    group.rotation.y += 0.005 * sp;
    // Slight wave
    for (const s of spheres) {
      s.position.y = s.userData.baseY + Math.sin(t * sp + s.userData.baseAngle) * 0.1;
    }
    for (const c of connectors) {
      c.position.y = c.userData.baseY + Math.sin(t * sp + c.userData.baseAngle) * 0.1;
    }
  };
})`;

    case "geometricStorm":
      return `(function(scene, camera, renderer, mouse, sp, dn) {
  const count = Math.floor(20 * dn);
  const geos = [
    new THREE.TetrahedronGeometry(0.3),
    new THREE.OctahedronGeometry(0.3),
    new THREE.IcosahedronGeometry(0.3),
    new THREE.DodecahedronGeometry(0.25),
    new THREE.BoxGeometry(0.4, 0.4, 0.4),
  ];
  const c1 = new THREE.Color('${pc}');
  const c2 = new THREE.Color('${sc}');
  const meshes = [];
  for (let i = 0; i < count; i++) {
    const geo = geos[i % geos.length];
    const mat = new THREE.MeshPhysicalMaterial({
      color: c1.clone().lerp(c2, Math.random()),
      metalness: 0.5, roughness: 0.2, transparent: true, opacity: 0.8
    });
    const mesh = new THREE.Mesh(geo, mat);
    const angle = (i / count) * Math.PI * 2;
    const radius = 1.5 + Math.random() * 2;
    mesh.position.set(Math.cos(angle) * radius, (Math.random()-0.5) * 3, Math.sin(angle) * radius);
    mesh.userData.orbitAngle = angle;
    mesh.userData.orbitRadius = radius;
    mesh.userData.orbitSpeed = 0.2 + Math.random() * 0.3;
    mesh.userData.rotSpeed = (Math.random()-0.5) * 0.05;
    mesh.userData.yOffset = mesh.position.y;
    scene.add(mesh);
    meshes.push(mesh);
  }
  const pl = new THREE.PointLight('${pc}', 2, 10);
  scene.add(pl);
  return function(t) {
    for (const m of meshes) {
      m.userData.orbitAngle += m.userData.orbitSpeed * 0.01 * sp;
      m.position.x = Math.cos(m.userData.orbitAngle) * m.userData.orbitRadius;
      m.position.z = Math.sin(m.userData.orbitAngle) * m.userData.orbitRadius;
      m.position.y = m.userData.yOffset + Math.sin(t * sp + m.userData.orbitAngle) * 0.3;
      m.rotation.x += m.userData.rotSpeed * sp;
      m.rotation.y += m.userData.rotSpeed * sp * 1.3;
    }
    pl.position.set(Math.sin(t * sp * 0.5) * 2, 1, Math.cos(t * sp * 0.5) * 2);
  };
})`;

    default:
      return `(function(scene) { return function() {}; })`;
  }
}

function buildEffectScripts(slides: Slide[]): string {
  const effectDefs = slides
    .map((s, i) => {
      if (s.type !== "3d" || !s.sceneEffect) return null;
      return { idx: i, effect: s.sceneEffect };
    })
    .filter(Boolean) as { idx: number; effect: SceneEffect3D }[];

  if (effectDefs.length === 0) return "";

  // Build per-effect init code
  const initBlocks = effectDefs.map((def) => {
    const sp = def.effect.speed ?? 1.0;
    const dn = def.effect.density ?? 1.0;
    return `{
    const idx = ${def.idx};
    const canvas = document.getElementById('three-canvas-' + idx);
    if (canvas) {
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const rc = typeof Reveal !== 'undefined' ? Reveal.getConfig() : {};
      const w = rc.width || 960, h = rc.height || 700;
      renderer.setSize(w, h);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
      camera.position.z = 5;
      scene.add(new THREE.AmbientLight(0xffffff, 0.4));
      const dl = new THREE.DirectionalLight(0xffffff, 0.8);
      dl.position.set(3, 4, 5);
      scene.add(dl);
      const tickFn = ${buildEffectCode(def.effect)}(scene, camera, renderer, mouse, ${sp}, ${dn});
      scenes[idx] = { renderer, scene, camera, active: false, raf: null, tickFn };
    }
  }`;
  }).join("\n  ");

  return `<script type="module">
import * as THREE from '${THREE_CDN}';

const scenes = {};
const mouse = { x: 0, y: 0 };
document.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
});

// Init effect scenes
${initBlocks}

function animate(idx) {
  const s = scenes[idx];
  if (!s || !s.active) return;
  s.raf = requestAnimationFrame(() => animate(idx));
  const t = performance.now() * 0.001;
  // Mouse parallax
  s.camera.position.x += (mouse.x * 0.8 - s.camera.position.x) * 0.05;
  s.camera.position.y += (-mouse.y * 0.5 - s.camera.position.y) * 0.05;
  s.camera.lookAt(0, 0, 0);
  s.tickFn(t);
  s.renderer.render(s.scene, s.camera);
}

function startScene(idx) {
  const s = scenes[idx];
  if (!s || s.active) return;
  s.active = true;
  const rc = typeof Reveal !== 'undefined' ? Reveal.getConfig() : {};
  const w = rc.width || 960, h = rc.height || 700;
  s.renderer.setSize(w, h);
  s.camera.aspect = w / h;
  s.camera.updateProjectionMatrix();
  animate(idx);
}

function stopScene(idx) {
  const s = scenes[idx];
  if (!s) return;
  s.active = false;
  if (s.raf) cancelAnimationFrame(s.raf);
}

Reveal.on('slidechanged', (e) => {
  for (const idx of Object.keys(scenes)) stopScene(Number(idx));
  const el = e.currentSlide.querySelector('.three-slide');
  if (el) startScene(Number(el.dataset.sceneIdx));
});

document.addEventListener('DOMContentLoaded', () => {
  const first = document.querySelector('.reveal .slides section .three-slide');
  if (first) startScene(Number(first.dataset.sceneIdx));
});

window.addEventListener('resize', () => {
  const rc = typeof Reveal !== 'undefined' ? Reveal.getConfig() : {};
  const w = rc.width || 960, h = rc.height || 700;
  for (const [idx, s] of Object.entries(scenes)) {
    if (s.active) {
      s.renderer.setSize(w, h);
      s.camera.aspect = w / h;
      s.camera.updateProjectionMatrix();
    }
  }
});
<\/script>`;
}

/* ---------- Legacy Three.js Scripts (sceneObjects) ---------- */

function buildLegacyThreeScripts(slides: Slide[]): string {
  const sceneDefs = slides
    .map((s, i) => {
      if (s.type !== "3d" || s.sceneEffect) return null;
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
  const revealConfig = typeof Reveal !== 'undefined' ? Reveal.getConfig() : {};
  const w = revealConfig.width || 960;
  const h = revealConfig.height || 700;
  renderer.setSize(w, h);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
  camera.position.z = 5;

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

  scenes[def.idx] = { renderer, scene, camera, meshes, active: false, raf: null, mouse: { x: 0, y: 0 }, baseCamera: { x: camera.position.x, y: camera.position.y } };
}

const mouse = { x: 0, y: 0 };
document.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
});

function animate(idx) {
  const s = scenes[idx];
  if (!s || !s.active) return;
  s.raf = requestAnimationFrame(() => animate(idx));
  const t = performance.now() * 0.001;

  s.camera.position.x += (mouse.x * 0.8 - s.camera.position.x) * 0.05;
  s.camera.position.y += (-mouse.y * 0.5 - s.camera.position.y) * 0.05;
  s.camera.lookAt(0, 0, 0);

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
  const rc = typeof Reveal !== 'undefined' ? Reveal.getConfig() : {};
  const w = rc.width || 960;
  const h = rc.height || 700;
  s.renderer.setSize(w, h);
  s.camera.aspect = w / h;
  s.camera.updateProjectionMatrix();
  animate(idx);
}

function stopScene(idx) {
  const s = scenes[idx];
  if (!s) return;
  s.active = false;
  if (s.raf) cancelAnimationFrame(s.raf);
}

for (const def of sceneDefs) initScene(def);

Reveal.on('slidechanged', (e) => {
  for (const idx of Object.keys(scenes)) stopScene(Number(idx));
  const el = e.currentSlide.querySelector('.three-slide');
  if (el) startScene(Number(el.dataset.sceneIdx));
});

document.addEventListener('DOMContentLoaded', () => {
  const first = document.querySelector('.reveal .slides section .three-slide');
  if (first) startScene(Number(first.dataset.sceneIdx));
});

window.addEventListener('resize', () => {
  const rc = typeof Reveal !== 'undefined' ? Reveal.getConfig() : {};
  const w = rc.width || 960;
  const h = rc.height || 700;
  for (const [idx, s] of Object.entries(scenes)) {
    if (s.active) {
      s.renderer.setSize(w, h);
      s.camera.aspect = w / h;
      s.camera.updateProjectionMatrix();
    }
  }
});
<\/script>`;
}

function buildThreeScripts(slides: Slide[]): string {
  const hasEffects = slides.some((s) => s.type === "3d" && s.sceneEffect);
  const hasLegacy = slides.some((s) => s.type === "3d" && !s.sceneEffect && s.sceneObjects?.length);

  let result = "";
  if (hasEffects) result += buildEffectScripts(slides);
  if (hasLegacy) result += buildLegacyThreeScripts(slides);
  return result;
}

export function buildRevealHtml(slides: Slide[], theme = "black"): string {
  const sorted = [...slides].map(normalizeSlide).sort((a, b) => a.order - b.order);
  const has3D = sorted.some((s) => s.type === "3d");
  const hasThreeBg = sorted.some((s) => s.type === "2d" && (s.html || "").includes("three-bg"));

  const sections = sorted
    .map((s, i) => {
      if (s.type === "3d") {
        return `        <section data-background-color="${s.backgroundColor || s.sceneEffect?.backgroundColor || "#111111"}">${build3DSection(s, i)}</section>`;
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
    /* Override any inline styles the LLM may sneak in (exclude 3D slides) */
    .reveal section:not(:has(.three-slide)) * { min-height: unset !important; background: unset !important; padding: revert !important; margin: revert !important; }
    .reveal section:not(:has(.three-slide)) *[style] { font-size: inherit !important; color: inherit !important; }
    /* 3D slides fill the entire section */
    .reveal section:has(.three-slide) { padding: 0 !important; position: relative !important; overflow: hidden !important; }

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
  <a href="https://easybits.cloud" target="_blank" rel="noopener"
     style="position:fixed;bottom:12px;right:16px;z-index:9999;font-family:system-ui,sans-serif;font-size:11px;color:rgba(255,255,255,0.85);text-decoration:none;letter-spacing:0.02em;pointer-events:auto;background:rgba(0,0,0,0.5);padding:4px 10px;border-radius:6px;backdrop-filter:blur(4px);"
     onmouseover="this.style.background='rgba(0,0,0,0.7)';this.style.color='#fff'" onmouseout="this.style.background='rgba(0,0,0,0.5)';this.style.color='rgba(255,255,255,0.85)'"
  >Powered by EasyBits</a>
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

const bgMouse = { x: 0, y: 0 };
document.addEventListener('mousemove', (e) => {
  bgMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  bgMouse.y = (e.clientY / window.innerHeight) * 2 - 1;
});

function animate() {
  requestAnimationFrame(animate);
  points.rotation.y += 0.001;
  points.rotation.x += 0.0005;
  camera.position.x += (bgMouse.x * 0.8 - camera.position.x) * 0.05;
  camera.position.y += (-bgMouse.y * 0.5 - camera.position.y) * 0.05;
  camera.lookAt(0, 0, 0);
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
