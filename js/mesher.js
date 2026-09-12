/* ============================================================
   区块网格构建：面剔除 + 环境光遮蔽(AO) + 天光/方块光顶点属性
   ============================================================ */

// 六个面：n 法线, tu/tv 切向轴, corners 为 (cu,cv)（逆时针，从外侧看）
const FACES = [
  { n: [1, 0, 0], tu: [0, 0, 1], tv: [0, 1, 0], flipU: true, shade: 0.82, corners: [[1, 0], [0, 0], [0, 1], [1, 1]], key: 'side' },
  { n: [-1, 0, 0], tu: [0, 0, 1], tv: [0, 1, 0], flipU: false, shade: 0.82, corners: [[0, 0], [1, 0], [1, 1], [0, 1]], key: 'side' },
  { n: [0, 1, 0], tu: [1, 0, 0], tv: [0, 0, 1], flipU: false, shade: 1.0, corners: [[0, 0], [0, 1], [1, 1], [1, 0]], key: 'top' },
  { n: [0, -1, 0], tu: [1, 0, 0], tv: [0, 0, 1], flipU: false, shade: 0.55, corners: [[0, 1], [0, 0], [1, 0], [1, 1]], key: 'bottom' },
  { n: [0, 0, 1], tu: [1, 0, 0], tv: [0, 1, 0], flipU: false, shade: 0.7, corners: [[0, 0], [1, 0], [1, 1], [0, 1]], key: 'side' },
  { n: [0, 0, -1], tu: [1, 0, 0], tv: [0, 1, 0], flipU: true, shade: 0.7, corners: [[1, 0], [0, 0], [0, 1], [1, 1]], key: 'side' },
];
const AO_LEVELS = [0.5, 0.68, 0.84, 1.0];

/* ---------- 区块着色器材质 ---------- */
function makeChunkMaterial(atlas, opts) {
  const uniforms = {
    uAtlas: { value: atlas.texture },
    uDay: { value: 1 },
    uTime: { value: 0 },
    uTorch: { value: new THREE.Color(1.0, 0.82, 0.55) },
    uUnderwater: { value: 0 },
    uOpacity: { value: opts.transparent ? 0.78 : 1 },
    uAlphaTest: { value: opts.alphaTest },
    uSkyBoost: { value: 1 },
    uAmbient: { value: opts.ambient === undefined ? 0.055 : opts.ambient },
    fogColor: { value: new THREE.Color(0x87c5ff) },
    fogNear: { value: 40 },
    fogFar: { value: 130 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexColors: false,
    fog: true,
    transparent: !!opts.transparent,
    depthWrite: true,
    side: THREE.FrontSide,
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSky;
      attribute float aBlock;
      attribute float aFlags;
      uniform float uTime;
      varying vec3 vColor;
      varying float vSky;
      varying float vBlock;
      varying vec2 vUv2;
      varying float vFlags;
      #include <fog_pars_vertex>
      void main() {
        vUv2 = uv;
        vec3 p = position;
        if (aFlags > 0.5 && p.y > 0.5) {
          p.y += sin(uTime * 1.7 + p.x * 0.9 + p.z * 1.1) * 0.045;
        }
        if (aFlags > 1.5) {
          p.x += sin(uTime * 0.9 + p.y * 2.0) * 0.012;
          p.z += cos(uTime * 1.1 + p.y * 2.0) * 0.012;
        }
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vColor = aColor; vSky = aSky; vBlock = aBlock; vFlags = aFlags;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D uAtlas;
      uniform float uDay;
      uniform float uTime;
      uniform vec3 uTorch;
      uniform float uUnderwater;
      uniform float uOpacity;
      uniform float uAlphaTest;
      uniform float uSkyBoost;
      uniform float uAmbient;
      varying vec3 vColor;
      varying float vSky;
      varying float vBlock;
      varying vec2 vUv2;
      varying float vFlags;
      #include <fog_pars_fragment>
      void main() {
        vec4 tex = texture2D(uAtlas, vUv2);
        if (tex.a < uAlphaTest) discard;
        float sky = clamp(vSky / 15.0 * uDay, 0.0, 1.0);
        float blk = clamp(vBlock / 15.0, 0.0, 1.0);
        float l = max(sky * uSkyBoost, blk);
        vec3 c = vColor * tex.rgb * (uAmbient + (1.0 - uAmbient) * l);   // ★ 必须乘上贴图颜色，否则所有方块都是灰白的
        float torchMix = clamp((blk - sky) * 1.5, 0.0, 0.6);
        c = mix(c, c * uTorch * 1.25, torchMix);
        if (vFlags > 1.5) {
          float pulse = 0.85 + 0.35 * sin(uTime * 2.2 + vUv2.y * 6.283);
          c = mix(c, vec3(0.72, 0.42, 1.0), 0.45) * pulse;
        }
        // 夜晚偏冷的月光
        c = mix(c, c * vec3(0.72, 0.80, 1.05), (1.0 - uDay) * 0.55 * clamp(sky, 0.0, 1.0));
        if (uUnderwater > 0.5) c = mix(c, c * vec3(0.20, 0.42, 0.72), 0.85);
        gl_FragColor = vec4(c, tex.a * uOpacity);
        #include <fog_fragment>
      }`,
  });
  mat.userData.uniforms = uniforms;
  mat.fogColorUniforms = true;
  return mat;
}

/* ---------- 网格构建器 ---------- */
/* 所有维度共用同一套方块材质：既省显存，也避免反复编译着色器程序 */
const SHARED_MATS = { atlas: null, opaque: null, transparent: null };
function getSharedMaterials(atlas) {
  if (!SHARED_MATS.opaque || SHARED_MATS.atlas !== atlas) {
    SHARED_MATS.atlas = atlas;
    SHARED_MATS.opaque = makeChunkMaterial(atlas, { transparent: false, alphaTest: 0.35, ambient: 0.055 });
    SHARED_MATS.transparent = makeChunkMaterial(atlas, { transparent: true, alphaTest: 0.02, ambient: 0.055 });
  }
  return SHARED_MATS;
}

class Mesher {
  constructor(atlas, world, opts = {}) {
    this.atlas = atlas;
    this.world = world;
    const shared = getSharedMaterials(atlas);
    this.matOpaque = shared.opaque;
    this.matTransparent = shared.transparent;
    this.matWater = this.matTransparent;
    this.ambient = opts.ambient === undefined ? 0.055 : opts.ambient;
  }
  /* 流体液面高度（供网格使用） */
  liquidHeight(wx, wy, wz, def) {
    if (!def.liquid) return 1;
    const st = this.world.getState(wx, wy, wz);
    if (!st) return 1;
    if (st.falling) return 1;
    return Math.max(0.23, 1 - (st.level | 0) * 0.11);
  }
  setDay(v) {
    this.matOpaque.userData.uniforms.uDay.value = v;
    this.matTransparent.userData.uniforms.uDay.value = v;
  }
  setTime(t, underwater) {
    this.matOpaque.userData.uniforms.uTime.value = t;
    this.matTransparent.userData.uniforms.uTime.value = t;
    this.matOpaque.userData.uniforms.uUnderwater.value = underwater ? 1 : 0;
    this.matTransparent.userData.uniforms.uUnderwater.value = underwater ? 1 : 0;
  }
  fogUniforms() { return this.matOpaque.userData.uniforms; }

  /* 生物群系着色 */
  tintFor(def, biome) {
    if (!def.tint) return [1, 1, 1];
    const pal = BIOME_COLORS[biome] || BIOME_COLORS[0];
    if (def.tint === 'grass' || def.tint === 'foliage_grass') return pal.grass;
    if (def.tint === 'foliage') return pal.foliage;
    if (def.tint === 'spruce') return [0.42, 0.62, 0.45];
    if (def.tint === 'crop') return [0.85, 0.95, 0.6];
    return [1, 1, 1];
  }

  build(chunk) {
    const w = this.world;
    const O = { pos: [], col: [], uv: [], sky: [], blk: [], flags: [], idx: [] };
    const Tr = { pos: [], col: [], uv: [], sky: [], blk: [], flags: [], idx: [] };
    const baseX = chunk.x * CHUNK_W, baseZ = chunk.z * CHUNK_W;
    const skyArr = chunk.sky, blkArr = chunk.blockLight;
    const idxOf = (lx, y, lz) => (y * CHUNK_W + lz) * CHUNK_W + lx;

    for (let y = chunk.minY; y <= chunk.maxY; y++) {
      for (let lz = 0; lz < CHUNK_W; lz++) {
        for (let lx = 0; lx < CHUNK_W; lx++) {
          const bi = idxOf(lx, y, lz);
          const id = chunk.blocks[bi];
          if (id === 0) continue;
          const def = BLOCKS[id];
          const wx = baseX + lx, wz = baseZ + lz;
          const biome = chunk.biome[lz * CHUNK_W + lx];
          const tint = this.tintFor(def, biome);
          const texOverride = w.stateTiles(wx, y, wz, def);   // 红石线/点亮的灯/中继器/作物阶段/嵌眼框架
          let target = O;
          if (def.shape === 'cross' || def.shape === 'crop' || def.shape === 'torch') target = O;
          else if (def.transparent) target = Tr;

          if (def.shape === 'cross' || def.shape === 'crop' || def.shape === 'torch') {
            this.emitCross(target, lx, y, lz, def, tint, skyArr[bi], blkArr[bi], 0, texOverride);
            continue;
          }
          if (def.shape === 'portal') {
            this.emitCross(target, lx, y, lz, def, tint, skyArr[bi], blkArr[bi], 2, texOverride);
            continue;
          }
          if (def.shape === 'flat') {
            // 薄板：顶面 + 侧面
            this.emitBox(target, lx, y, lz, wx, wz, def, tint, 0, 0.0625, w, null, 0, texOverride);
            continue;
          }
          if (def.shape === 'liquid') {
            const h = this.liquidHeight(wx, y, wz, def);
            this.emitBox(target, lx, y, lz, wx, wz, def, tint, 0, h, w, def, 0, texOverride);
            continue;
          }
          if (def.shape === 'slab' || def.shape === 'bed') {
            this.emitBox(target, lx, y, lz, wx, wz, def, tint, 0, def.shape === 'bed' ? 0.5625 : 0.5, w, null, 0, texOverride);
            continue;
          }
          if (id === B.cactus) { this.emitBox(target, lx, y, lz, wx, wz, def, tint, 0, 1, w, null, 0.0625, texOverride); continue; }
          this.emitBox(target, lx, y, lz, wx, wz, def, tint, 0, 1, w, null, 0, texOverride);
        }
      }
    }
    return { opaque: this.finish(O), transparent: this.finish(Tr) };
  }

  emitBox(G, lx, y, lz, wx, wz, def, tint, y0, y1, world, liquidDef, inset, texOverride) {
    const w = world, ins = inset || 0;
    const TEX = texOverride || def.tex;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const nx = wx + F.n[0], ny = y + F.n[1], nz = wz + F.n[2];   // 世界坐标（用于邻居/光照查询）
      const ndef = w.getBlockDef(nx, ny, nz);
      const nid = ndef.id;
      if (ndef.opaque && ndef.solid) continue;
      if (liquidDef && nid === def.id) {
        // 同种液体：只有相邻液面不低于自己时才隐藏这一面（能看到台阶）
        const nH = this.liquidHeight(nx, ny, nz, ndef);
        if (nH >= y1 - 0.02) continue;
      }
      if (!liquidDef && def.liquid && nid === def.id) continue;
      if (def.shape === 'cactus' && ndef.id === B.cactus && F.n[1] === 0) continue;
      const tile = F.key === 'top' ? (TEX.top ?? TEX.all) : F.key === 'bottom' ? (TEX.bottom ?? TEX.all) : (TEX.side ?? TEX.all ?? TEX.top);
      // 草方块侧面只保留部分染色，避免泥土被整体染色
      const faceTint = (def.tint === 'grass' && F.key !== 'top')
        ? [tint[0] * 0.42 + 0.58, tint[1] * 0.42 + 0.58, tint[2] * 0.42 + 0.58]
        : tint;
      const [u0, v0, u1, v1] = this.atlas.uv(tile);
      const pSky = w.getSkyLightRaw(nx, ny, nz), pBlk = w.getBlockLightRaw(nx, ny, nz);
      const verts = [];
      for (const [cu, cv] of F.corners) {
        const px = nx + F.tu[0] * cu + F.tv[0] * cv;
        const py = ny + F.tu[1] * cu + F.tv[1] * cv;
        const pz = nz + F.tu[2] * cu + F.tv[2] * cv;
        const ox = (cu ? 1 : -1), ov = (cv ? 1 : -1);
        const s1 = this.isOpaque(px + F.tu[0] * ox, py + F.tu[1] * ox, pz + F.tu[2] * ox);
        const s2 = this.isOpaque(px + F.tv[0] * ov, py + F.tv[1] * ov, pz + F.tv[2] * ov);
        const co = this.isOpaque(px + F.tu[0] * ox + F.tv[0] * ov, py + F.tu[1] * ox + F.tv[1] * ov, pz + F.tu[2] * ox + F.tv[2] * ov);
        const ao = AO_LEVELS[(s1 && s2) ? 0 : 3 - (s1 + s2 + co)];
        const vx = lx + (F.n[0] > 0 ? 1 - ins : ins) + (F.tu[0] * cu + F.tv[0] * cv) * (1 - ins * 2);
        const vz = lz + (F.n[2] > 0 ? 1 - ins : ins) + (F.tu[2] * cu + F.tv[2] * cv) * (1 - ins * 2);
        let vy;
        if (F.n[1] > 0) vy = y + y1;
        else if (F.n[1] < 0) vy = y + y0;
        else vy = y + (F.tu[1] ? (y0 + (y1 - y0) * cu) : (y0 + (y1 - y0) * cv));
        const uu = F.flipU ? (cu ? u0 : u1) : (cu ? u1 : u0);
        const vv = cv ? v1 : v0;
        verts.push({ vx, vy, vz, uu, vv, shade: F.shade * ao });
      }
      this.pushQuad(G, verts, faceTint, pSky, pBlk, def.liquid ? 1 : 0);
    }
  }

  isOpaque(x, y, z) {
    const d = this.world.getBlockDef(x, y, z);
    return (d.opaque && d.solid) ? 1 : 0;
  }

  emitCross(G, lx, y, lz, def, tint, sky, blk, flag, texOverride) {
    const TEX = texOverride || def.tex;
    const tile = TEX.all ?? TEX.side ?? TEX.top;
    const [u0, v0, u1, v1] = this.atlas.uv(tile);
    const isPortal = def.shape === 'portal';
    const h = def.shape === 'torch' ? 0.625 : 1;
    const pad = def.shape === 'torch' ? 0.34 : (isPortal ? 0 : 0.15);
    const quads = [
      [[pad, 0, pad], [1 - pad, 0, 1 - pad]],
      [[1 - pad, 0, pad], [pad, 0, 1 - pad]],
      [[pad, 0, 1 - pad], [1 - pad, 0, pad]],
      [[1 - pad, 0, 1 - pad], [pad, 0, pad]],
    ];
    const shade = def.shape === 'torch' ? 1.0 : 0.9;
    for (const [[x0, _, z0], [x1, __, z1]] of quads) {
      const verts = [
        { vx: lx + x0, vy: y + 0, vz: lz + z0, uu: u0, vv: v0, shade },
        { vx: lx + x1, vy: y + 0, vz: lz + z1, uu: u1, vv: v0, shade },
        { vx: lx + x1, vy: y + h, vz: lz + z1, uu: u1, vv: v1, shade },
        { vx: lx + x0, vy: y + h, vz: lz + z0, uu: u0, vv: v1, shade },
      ];
      this.pushQuad(G, verts, tint, sky, blk, flag || 0, false);
    }
  }

  pushQuad(G, verts, tint, sky, blk, flags, cull = true) {
    const start = G.pos.length / 3;
    for (const v of verts) {
      G.pos.push(v.vx, v.vy, v.vz);
      G.uv.push(v.uu, v.vv);
      const s = v.shade;
      G.col.push(tint[0] * s, tint[1] * s, tint[2] * s);
      G.sky.push(sky); G.blk.push(blk); G.flags.push(flags);
    }
    G.idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }

  finish(G) {
    if (!G.idx.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(G.uv, 2));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(G.col, 3));
    geo.setAttribute('aSky', new THREE.Float32BufferAttribute(G.sky, 1));
    geo.setAttribute('aBlock', new THREE.Float32BufferAttribute(G.blk, 1));
    geo.setAttribute('aFlags', new THREE.Float32BufferAttribute(G.flags, 1));
    geo.setIndex(G.idx);
    geo.computeBoundingSphere();
    return geo;
  }
}

/* 生物群系颜色表 */
const BIOME_COLORS = {
  0: { name: '平原', grass: [0.52, 0.76, 0.34], foliage: [0.42, 0.70, 0.28], fog: 0x9fc7ff, sky: 0x7fb3ff },
  1: { name: '森林', grass: [0.40, 0.68, 0.26], foliage: [0.30, 0.60, 0.20], fog: 0x9bc4f5, sky: 0x7fb3ff },
  2: { name: '沙漠', grass: [0.75, 0.72, 0.36], foliage: [0.62, 0.62, 0.30], fog: 0xe8d9a8, sky: 0x8fc4ff },
  3: { name: '雪原', grass: [0.62, 0.76, 0.68], foliage: [0.52, 0.70, 0.62], fog: 0xdfeeff, sky: 0xa8d4ff },
  4: { name: '山地', grass: [0.46, 0.70, 0.36], foliage: [0.36, 0.62, 0.28], fog: 0xa8c8f0, sky: 0x86bcff },
  5: { name: '海洋', grass: [0.45, 0.68, 0.40], foliage: [0.36, 0.62, 0.30], fog: 0x86b8ff, sky: 0x7fb3ff },
  6: { name: '海滩', grass: [0.68, 0.74, 0.42], foliage: [0.58, 0.66, 0.34], fog: 0xe0dcb0, sky: 0x8fc4ff },
  7: { name: '热带草原', grass: [0.70, 0.74, 0.36], foliage: [0.62, 0.68, 0.30], fog: 0xd8d0a0, sky: 0x8fc4ff },
  8: { name: '下界荒地', grass: [0.55, 0.30, 0.28], foliage: [0.45, 0.25, 0.24], fog: 0x5a1010, sky: 0x3a0a0a },
  9: { name: '灵魂沙峡谷', grass: [0.45, 0.40, 0.35], foliage: [0.38, 0.34, 0.30], fog: 0x3a4a6a, sky: 0x2a3a5a },
  10: { name: '末地', grass: [0.72, 0.72, 0.55], foliage: [0.62, 0.62, 0.48], fog: 0x241a3a, sky: 0x100a1c },
};
