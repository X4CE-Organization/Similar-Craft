/* ============================================================
   世界管理：区块加载/卸载、方块读写、光照接入、爆炸、存档
   ============================================================ */

const EMPTY_DEF = { id: 0, opaque: false, solid: false, transparent: true, light: 0, liquid: false, shape: 'cube', hardness: 0, noCollide: true, tex: null };

/* 末地城战利品 */
function rollLoot(tier) {
  const inv = new Array(27).fill(null);
  const put = (id, count, meta) => {
    const slot = randInt(27);
    if (inv[slot]) return put(id, count, meta);
    inv[slot] = makeStack(id, count, meta || null);
  };
  if (tier === 2) {
    put('diamond', 4 + randInt(5));
    put('emerald', 3 + randInt(4));
    put('ender_pearl', 1 + randInt(3));
    put('shulker_shell', 1 + randInt(3));
    put('gold_ingot', 3 + randInt(6));
    if (Math.random() < 0.6) put('elytra', 1);
    const gear = choice([['diamond_chestplate', 'protection'], ['diamond_leggings', 'protection'], ['diamond_helmet', 'protection'], ['diamond_boots', 'protection'], ['diamond_sword', 'sharpness'], ['diamond_pickaxe', 'efficiency']]);
    const st = makeStack(gear[0], 1);
    applyEnchant(st, { type: gear[1], lv: 1 + randInt(3) });
    put(gear[0], 1, st.meta);
  } else {
    put('diamond', 2 + randInt(4));
    put('iron_ingot', 3 + randInt(6));
    put('gold_ingot', 2 + randInt(5));
    put('quartz', 4 + randInt(8));
    put('ender_pearl', 1 + randInt(2));
    if (Math.random() < 0.4) put('shulker_shell', 1);
  }
  return inv;
}

class Chunk {
  constructor(world, x, z) {
    this.world = world; this.x = x; this.z = z;
    this.blocks = new Uint8Array(CHUNK_W * CHUNK_W * WORLD_H);
    this.sky = new Uint8Array(CHUNK_W * CHUNK_W * WORLD_H);
    this.blockLight = new Uint8Array(CHUNK_W * CHUNK_W * WORLD_H);
    this.biome = new Uint8Array(CHUNK_W * CHUNK_W);
    this.heightmap = new Int16Array(CHUNK_W * CHUNK_W);
    this.minY = 0; this.maxY = WORLD_H - 1;
    this.status = 0;      // 0 未生成 1 已生成 2 光照完成
    this.dirty = true;
    this.group = new THREE.Group();
    this.group.position.set(x * CHUNK_W, 0, z * CHUNK_W);   // 位置照常自动更新：关掉它会导致重建后的网格丢失世界矩阵
    this.meshOpaque = null; this.meshTransparent = null;
    this.entities = [];
  }
  idx(lx, y, lz) { return (y * CHUNK_W + lz) * CHUNK_W + lx; }
  get(lx, y, lz) { if (y < 0 || y >= WORLD_H) return 0; return this.blocks[this.idx(lx, y, lz)]; }
  set(lx, y, lz, id) { if (y < 0 || y >= WORLD_H) return; this.blocks[this.idx(lx, y, lz)] = id; }
}

class World {
  constructor(scene, seed, type) {
    this.type = type || 'overworld';
    this.root = new THREE.Group();          // 每个维度一个根节点，切换维度时隐藏/显示
    scene.add(this.root);
    this.scene = this.root;                 // 区块、生物、掉落物都挂在本维度根节点上
    this.seed = seed >>> 0;
    this.gen = new WorldGen(this.seed, this.type);
    this.chunks = new Map();
    this.light = new LightEngine(this);
    this.dimConfig = DIMENSIONS[this.type] || DIMENSIONS.overworld;
    this.mesher = new Mesher(MC.atlas, this, { ambient: this.dimConfig.ambient });
    this.fluids = new FluidEngine(this);
    this.liquidTickAcc = 0;
    this.states = new Map();       // 方块状态（红石、耕地、熔炉等）
    this.liquids = new Map();      // 流体状态单独放（数量可能很多，单独压缩）
    this.edits = new Map();        // 玩家改动（保存用）
    this.editsByChunk = new Map(); // chunkKey -> Map(posKey -> id)，加速区块生成时应用改动
    this.itemEntities = [];
    this.mobs = [];
    this.arrows = [];
    this.crystals = [];
    this.shulkerPoints = new Set();   // 待生成的潜影贝位置（末地城）
    this.bossSpawned = false;
    this.particles = [];
    this.renderDistance = 6;
    this.loadBudget = 2;
    this.meshBudget = 3;
    this._lastChunkKey = ''; this._lastChunk = null;
    this.tickTimer = 0; this.randomTickAcc = 0;
    this.activeFurnaces = new Set();
    this.crops = new Set();        // 作物位置（用于随机刻生长）
    this.time = 0;                 // 0..1 一天中的进度
    this.dayCount = 1;
    this.weather = { rain: false, time: 0, next: 300 + Math.random() * 600, thunder: 0 };
    this.totalPlaced = 0;
    this.skyLightLevel = this.dimConfig.skyLight;   // 下界是均匀的昏暗环境光
    this.isDayLight = this.dimConfig.hasSun;
  }

  /* ---------- 区块访问 ---------- */
  getChunk(cx, cz) { const k = chunkKey(cx, cz); const c = this.chunks.get(k); return c || null; }
  isLoaded(x, z) { return !!this.getChunk(Math.floor(x / CHUNK_W), Math.floor(z / CHUNK_W)); }
  isDay() { return Math.sin((this.time - 0.25) * TAU) > 0; }
  hasSky() { return this.dimConfig.hasSun; }
  /* 动态光源（点亮的红石灯、燃烧的熔炉） */
  getLightEmission(x, y, z, def) {
    if (!def || !def.id) return 0;
    if (def.id === B.redstone_lamp) { const st = this.states.get(posKey(x, y, z)); return st && st.lit ? 15 : 0; }
    if (def.id === B.furnace) { const st = this.states.get(posKey(x, y, z)); return st && st.burn > 0 ? 13 : 0; }
    return def.light || 0;
  }
  getChunkAt(wx, wz) {
    const cx = Math.floor(wx / CHUNK_W), cz = Math.floor(wz / CHUNK_W);
    const k = chunkKey(cx, cz);
    if (k === this._lastChunkKey) return this._lastChunk;
    const c = this.chunks.get(k) || null;
    this._lastChunkKey = k; this._lastChunk = c;
    return c;
  }
  createChunk(cx, cz) {
    const c = new Chunk(this, cx, cz);
    this.chunks.set(chunkKey(cx, cz), c);
    this.scene.add(c.group);
    this.gen.generate(c);
    // 应用玩家改动（存档恢复）
    const bucket = this.editsByChunk.get(chunkKey(cx, cz));
    if (bucket) {
      const bx = cx * CHUNK_W, bz = cz * CHUNK_W;
      bucket.forEach((v, k) => { const [x, y, z] = parsePosKey(k); c.set(x - bx, y, z - bz, v); });
    }
    // 要塞里的末影之眼（由生成器登记）
    if (this.gen.frameEyePositions && this.gen.frameEyePositions.length) {
      const bx = cx * CHUNK_W, bz = cz * CHUNK_W;
      for (const k of this.gen.frameEyePositions) {
        const [x, y, z] = parsePosKey(k);
        if (x >= bx && x < bx + CHUNK_W && z >= bz && z < bz + CHUNK_W) this.states.set(k, { eye: true });
      }
    }
    // 末地城宝箱战利品 + 潜影贝生成点
    if (this.gen.lootChests && this.gen.lootChests.length) {
      const bx = cx * CHUNK_W, bz = cz * CHUNK_W;
      for (const c of this.gen.lootChests) {
        if (c.x < bx || c.x >= bx + CHUNK_W || c.z < bz || c.z >= bz + CHUNK_W) continue;
        const k = posKey(c.x, c.y, c.z);
        if (!this.states.has(k)) this.states.set(k, { inv: rollLoot(c.tier) });
      }
    }
    if (this.gen.shulkerSpawns && this.gen.shulkerSpawns.length) {
      const bx = cx * CHUNK_W, bz = cz * CHUNK_W;
      for (const s of this.gen.shulkerSpawns) {
        if (s.x < bx || s.x >= bx + CHUNK_W || s.z < bz || s.z >= bz + CHUNK_W) continue;
        this.shulkerPoints.add(posKey(Math.floor(s.x), Math.floor(s.y), Math.floor(s.z)));
      }
    }
    c.status = 1;
    this.light.initChunk(c);
    c.status = 2;
    return c;
  }
  getBlock(x, y, z) {
    if (y < 0) return B.bedrock; if (y >= WORLD_H) return 0;
    const c = this.getChunkAt(x, z);
    if (!c) return 0;
    return c.get(x - c.x * CHUNK_W, y, z - c.z * CHUNK_W);
  }
  getBlockDef(x, y, z) {
    const id = this.getBlock(x, y, z);
    return BLOCKS[id] || EMPTY_DEF;
  }
  getSkyLightRaw(x, y, z) {
    if (y < 0) return 0; if (y >= WORLD_H) return MAX_LIGHT;
    const c = this.getChunkAt(x, z);
    if (!c) return MAX_LIGHT;
    return c.sky[(y * CHUNK_W + (z - c.z * CHUNK_W)) * CHUNK_W + (x - c.x * CHUNK_W)];
  }
  getBlockLightRaw(x, y, z) {
    if (y < 0 || y >= WORLD_H) return 0;
    const c = this.getChunkAt(x, z);
    if (!c) return 0;
    return c.blockLight[(y * CHUNK_W + (z - c.z * CHUNK_W)) * CHUNK_W + (x - c.x * CHUNK_W)];
  }
  getSkyLight(x, y, z) { return this.getSkyLightRaw(x, y, z); }
  getBlockLight(x, y, z) { return this.getBlockLightRaw(x, y, z); }
  setSkyLight(x, y, z, v) {
    const c = this.getChunkAt(x, z); if (!c) return;
    c.sky[(y * CHUNK_W + (z - c.z * CHUNK_W)) * CHUNK_W + (x - c.x * CHUNK_W)] = v;
  }
  setBlockLight(x, y, z, v) {
    const c = this.getChunkAt(x, z); if (!c) return;
    c.blockLight[(y * CHUNK_W + (z - c.z * CHUNK_W)) * CHUNK_W + (x - c.x * CHUNK_W)] = v;
  }

  /* ---------- 方块状态 ---------- */
  getState(x, y, z) { const k = posKey(x, y, z); const st = this.states.get(k); return st || this.liquids.get(k) || undefined; }
  setState(x, y, z, st) {
    const k = posKey(x, y, z);
    if (st === null || st === undefined) { this.states.delete(k); this.liquids.delete(k); return; }
    if (st.level !== undefined) { this.liquids.set(k, st); this.states.delete(k); }
    else { this.states.set(k, st); this.liquids.delete(k); }
  }
  stateTiles(x, y, z, def) {
    if (!def.hasState && def.id !== B.redstone_dust) return null;
    const st = this.states.get(posKey(x, y, z));
    if (!st) return null;
    if (def.id === B.redstone_dust) return { all: st.power > 0 ? T.DUST_ON : T.DUST_OFF };
    if (def.id === B.redstone_lamp) return { all: st.lit ? T.LAMP_ON : T.LAMP_OFF };
    if (def.id === B.repeater) return { all: st.powered ? T.REPEATER_ON : T.REPEATER_OFF };
    if (def.id === B.end_portal_frame) return { top: st.eye ? T.END_PORTAL_FRAME_EYE : T.END_PORTAL_FRAME_TOP, side: T.END_PORTAL_FRAME_SIDE, bottom: T.END_PORTAL_FRAME_SIDE };
    if (def.id === B.farmland_seed) return { all: T.WHEAT0 + clamp(st.stage | 0, 0, 3) };
    if (def.shape === 'crop') return { all: T.WHEAT0 + clamp((st.stage | 0) >> 1, 0, 3) };
    return null;
  }

  /* ---------- 世界更新（加载/卸载/网格/光照） ---------- */
  update(px, pz, budgetScale = 1) {
    const pcx = Math.floor(px / CHUNK_W), pcz = Math.floor(pz / CHUNK_W);
    const R = this.renderDistance;
    // 卸载
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.x - pcx) > R + 2 || Math.abs(c.z - pcz) > R + 2) {
        this.disposeChunk(c); this.chunks.delete(k);
      }
    }
    // 生成/光照：由近到远（每 0.25 秒重建一次待加载列表，避免每帧排序）
    this._needTimer = (this._needTimer || 0) - 1;
    if (this._needTimer <= 0 || !this._need) {
      this._needTimer = 15;
      const need = [];
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > R + 0.5) continue;
        const cx = pcx + dx, cz = pcz + dz;
        const c = this.getChunk(cx, cz);
        if (!c) need.push({ cx, cz, d });
        else if (c.status < 2) need.push({ cx, cz, d, existing: c });
      }
      need.sort((a, b) => a.d - b.d);
      this._need = need;
      this._needCenter = pcx + ',' + pcz;
    }
    const need = this._need;
    if (this._needCenter !== pcx + ',' + pcz) { this._needTimer = 0; }
    let genCount = 0;
    for (const n of need) {
      if (genCount >= Math.max(1, Math.round(this.loadBudget * budgetScale))) break;
      if (!this.getChunk(n.cx, n.cz)) { this.createChunk(n.cx, n.cz); genCount++; }
    }
    // 光照推进
    this.light.process(9000 * budgetScale + 2000);
    // 网格重建
    let meshCount = 0;
    const budget = this.light.dirty.size > 24 ? Math.max(this.meshBudget, 8) : this.meshBudget;
    const dirtyList = [];
    this.light.dirty.forEach((k) => {
      const c = this.chunks.get(k);
      if (c && c.status >= 2) dirtyList.push(c);
    });
    dirtyList.sort((a, b) => (Math.abs(a.x - pcx) + Math.abs(a.z - pcz)) - (Math.abs(b.x - pcx) + Math.abs(b.z - pcz)));
    for (const c of dirtyList) {
      if (meshCount >= Math.max(1, Math.round(budget * budgetScale))) break;
      this.rebuildMesh(c);
      this.light.dirty.delete(chunkKey(c.x, c.z));
      meshCount++;
    }
    // 新生成但未建网格的区块
    if (meshCount < this.meshBudget) {
      for (const n of need) {
        const c = this.chunks.get(chunkKey(n.cx, n.cz));
        if (c && c.status >= 2 && !c.meshOpaque && !c.meshTransparent && c.dirty) {
          this.rebuildMesh(c); c.dirty = false; meshCount++;
          if (meshCount >= this.meshBudget) break;
        }
      }
    }
  }

  rebuildMesh(chunk) {
    const geo = this.mesher.build(chunk);
    if (chunk.meshOpaque) { chunk.group.remove(chunk.meshOpaque); chunk.meshOpaque.geometry.dispose(); chunk.meshOpaque = null; }
    if (chunk.meshTransparent) { chunk.group.remove(chunk.meshTransparent); chunk.meshTransparent.geometry.dispose(); chunk.meshTransparent = null; }
    if (geo.opaque) {
      const m = new THREE.Mesh(geo.opaque, this.mesher.matOpaque);
      m.frustumCulled = true; m.matrixWorldNeedsUpdate = true;
      chunk.meshOpaque = m; chunk.group.add(m);
    }
    if (geo.transparent) {
      const m = new THREE.Mesh(geo.transparent, this.mesher.matTransparent);
      m.frustumCulled = true; m.renderOrder = 1; m.matrixWorldNeedsUpdate = true;
      chunk.meshTransparent = m; chunk.group.add(m);
    }
    chunk.dirty = false;
  }

  disposeChunk(c) {
    if (c.meshOpaque) c.meshOpaque.geometry.dispose();
    if (c.meshTransparent) c.meshTransparent.geometry.dispose();
    this.scene.remove(c.group);
    c.group.clear();
  }

  /* ---------- 修改方块 ---------- */
  setBlock(x, y, z, id, opts = {}) {
    if (y < 0 || y >= WORLD_H) return false;
    const c = this.getChunkAt(x, z);
    if (!c) return false;
    const lx = x - c.x * CHUNK_W, lz = z - c.z * CHUNK_W;
    const old = c.get(lx, y, lz);
    if (old === id) return false;
    const oldDef = BLOCKS[old] || EMPTY_DEF;
    c.set(lx, y, lz, id);
    // 关键：网格只渲染 [minY, maxY]，放置到范围外（例如地面之上的工作台）必须扩展范围，否则方块会“隐身”
    if (id !== 0) {
      if (y < c.minY) c.minY = Math.max(0, y - 1);
      if (y > c.maxY) c.maxY = Math.min(WORLD_H - 1, y + 1);
    }
    if (id === B.farmland_seed) this.crops.add(posKey(x, y, z));
    else if (old === B.farmland_seed) this.crops.delete(posKey(x, y, z));
    if (id === 0) this.setState(x, y, z, null);
    if (!opts.noRecord) {
      const k = posKey(x, y, z);
      this.edits.set(k, id);
      const ck = chunkKey(Math.floor(x / CHUNK_W), Math.floor(z / CHUNK_W));
      let bucket = this.editsByChunk.get(ck);
      if (!bucket) { bucket = new Map(); this.editsByChunk.set(ck, bucket); }
      bucket.set(k, id);
    }
    const def = BLOCKS[id] || EMPTY_DEF;
    // 简单潮湿度/支撑：破坏支撑物时移除植物
    if (!opts.noSupport) this.checkSupport(x, y, z, id, def);
    if (!opts.noLight) this.light.onBlockChange(x, y, z, oldDef, def);
    // 立刻把所在区块标脏：网格本帧就重建，方块放下就能看见（光照重算稍后跟上再重建一次）
    this.light.markDirtyAt(x, y, z);
    if (id !== B.water && id !== B.lava) this.states.delete(posKey(x, y, z));   // 液体状态由流体引擎按需写入
    if (!opts.noFluid) this.fluids.onBlockChanged(x, y, z);
    if (def.light > 0) { /* 由 relight 处理 */ }
    c.dirty = true;
    return true;
  }

  checkSupport(x, y, z, id, def) {
    const needsGround = def.shape === 'cross' || def.shape === 'crop' || def.shape === 'flat' || def.shape === 'torch' || def.shape === 'bed';
    if (!needsGround) return;
    const below = this.getBlockDef(x, y - 1, z);
    if (!(below.solid) && below.shape !== 'slab' && below.shape !== 'bed') {
      // 支撑被移除 → 自身掉落消失
      this.setBlock(x, y, z, 0, { noSupport: true, noRecord: true });
    }
  }

  /* 破坏方块（返回掉落物列表） */
  breakBlock(x, y, z, toolStack, player) {
    const def = this.getBlockDef(x, y, z);
    if (!def || def.id === 0 || def.hardness === Infinity) return [];
    const drops = this.dropsFor(x, y, z, def, toolStack, player);
    const above = this.getBlockDef(x, y + 1, z);
    if ((def.shape === 'cross' || def.shape === 'crop' || def.shape === 'torch' || def.shape === 'flat') && above.shape === 'cross') {
      // 上方植物一起掉落
      this.setBlock(x, y + 1, z, 0, { noSupport: true });
    }
    this.setBlock(x, y, z, 0, { noSupport: false });
    this.setState(x, y, z, null);
    // 上方需要支撑的方块掉落
    const up = this.getBlockDef(x, y + 1, z);
    if ((up.shape === 'cross' || up.shape === 'crop' || up.shape === 'flat' || up.shape === 'torch') && !def.solid) {
      this.setBlock(x, y + 1, z, 0, { noSupport: true });
    }
    // 破坏方块上方的植物
    if (up.shape === 'cross' || up.shape === 'crop') {
      const d2 = this.dropsFor(x, y + 1, z, up, null, player);
      this.setBlock(x, y + 1, z, 0, { noSupport: true });
      for (const d of d2) drops.push(d);
    }
    return drops;
  }

  dropsFor(x, y, z, def, toolStack, player) {
    const out = [];
    const st = this.states.get(posKey(x, y, z));
    // toolStack 可能是背包里的原始物品堆（无 .def 缓存），需要按 id 解析
    const toolDef = toolStack ? (toolStack.def || itemDef(toolStack.id)) : null;
    const toolTier = toolDef && toolDef.toolType ? toolDef.tier : 0;
    const en = toolStack && toolStack.meta && toolStack.meta.enchant;
    const fortune = en && en.type === 'fortune' ? en.lv : 0;
    const add = (id, count) => { if (count > 0) out.push({ id, count: Math.round(count) }); };
    // 需要工具等级
    if (def.tool && def.tool !== 'shears') {
      const rightTool = toolDef && toolDef.toolType === def.tool;
      if (def.minLevel > 0 && (!rightTool || toolTier < def.minLevel)) {
        if (!toolDef || toolDef.toolType !== def.tool) return out;   // 泥土用手也能挖
        return out;
      }
    }
    if (def.id === B.farmland_seed) {
      const stage = st ? st.stage | 0 : 0;
      if (stage >= 7) { add('wheat', 1); add('seeds', 1 + randInt(3)); MC.ui.unlock('farm'); MC.ach.farm = true; }
      else add('seeds', 1);
      return out;
    }
    if (def.id === B.shulker_box) {
      const st2 = this.states.get(posKey(x, y, z));
      out.push({ id: 'shulker_box', count: 1, meta: st2 && st2.inv ? { inv: st2.inv } : null });
      return out;
    }
    if (def.id === B.oak_leaves || def.id === B.birch_leaves || def.id === B.spruce_leaves) {
      if (Math.random() < 0.06) add('apple', 1);
      else if (Math.random() < 0.08) add('stick', 1);
      return out;
    }
    if (def.id === B.tall_grass || def.shape === 'cross') {
      if (Math.random() < 0.35) add('seeds', 1);
      return out;
    }
    if (def.id === B.gravel) { if (Math.random() < 0.18) add('flint', 1); else add('gravel', 1); return out; }
    if (def.drops === null) {
      add(def.name, 1 + (fortune && def.xp ? Math.floor(Math.random() * (fortune + 1)) : 0));
      if (def.xp && player) player.addXP(def.xp);
      return out;
    }
    if (def.drops === undefined) { add(def.name, 1); return out; }
    if (def.drops.length === 0) return out;
    def.drops.forEach((id, i) => {
      let chance = def.dropChance ? (def.dropChance[i] ?? 1) : 1;
      let count = def.dropCount || 1;
      if (fortune > 0 && (id === 'coal' || id === 'diamond' || id === 'redstone' || id === 'emerald' || id === 'raw_iron' || id === 'raw_gold')) {
        count += Math.floor(Math.random() * (fortune + 1));
      }
      if (Math.random() < chance) add(id, count);
    });
    if (def.xp && player) player.addXP(def.xp);
    return out;
  }

  /* 射线检测：找到可交互方块 */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const res = raycastVoxel(ox, oy, oz, dx, dy, dz, maxDist, (x, y, z) => {
      if (y < 0 || y >= WORLD_H) return false;
      const d = this.getBlockDef(x, y, z);
      return d.id !== 0 && !d.liquid;
    });
    if (res.hit) {
      res.def = this.getBlockDef(res.x, res.y, res.z);
      res.state = this.getState(res.x, res.y, res.z);
    }
    return res;
  }

  /* ---------- 爆炸 ---------- */
  explode(x, y, z, power, source) {
    const r = Math.ceil(power);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      const d = Math.hypot(dx, dy, dz);
      if (d > power * (0.75 + Math.random() * 0.45)) continue;
      const bx = x + dx, by = y + dy, bz = z + dz;
      const def = this.getBlockDef(bx, by, bz);
      if (def.id === 0 || def.blast > power * 4) continue;
      if (def.id === B.tnt) { this.igniteTNT(bx, by, bz, 0.05 + Math.random() * 0.1); continue; }
      this.setBlock(bx, by, bz, 0, { noSupport: true, noLight: true });
      this.setState(bx, by, bz, null);
    }
    this.light.requestRelight(x, y, z, Math.min(24, r + 8));
    // 冲击波伤害与击退
    const damage = (ent) => {
      const d = Math.hypot(ent.pos.x - x, ent.pos.y - y, ent.pos.z - z);
      if (d < power * 2) {
        const f = 1 - d / (power * 2);
        if (ent.hurt) ent.hurt(power * 6 * f, { x: (ent.pos.x - x) / (d + 0.1), y: 0.6, z: (ent.pos.z - z) / (d + 0.1) }, '爆炸');
      }
    };
    this.mobs.forEach(damage);
    if (MC.player && MC.player.alive) damage(MC.player);
    MC.sound.play('explode', x, y, z);
    MC.particles.explosion(x + 0.5, y + 0.5, z + 0.5, power);
    MC.ui.shake(0.3);
  }

  igniteTNT(x, y, z, delay) {
    const st = this.states.get(posKey(x, y, z)) || {};
    if (st.fuse) return;
    st.fuse = delay === undefined ? 2.5 : delay;
    this.states.set(posKey(x, y, z), st);
    MC.sound.play('fuse', x, y, z);
  }

  /* ============================================================
     下界传送门：用打火石点燃黑曜石框，用洪水填充找出内部空腔
     ============================================================ */
  ignitePortal(x, y, z, face) {
    if (!face) return false;
    // 传送门平面可能是 x-y 面（z 固定）或 y-z 面（x 固定），两种都试一次
    const planes = [];
    if (face[0] !== 0 || face[1] !== 0) planes.push({ axis: 'z', fixed: z, du: face[0], dv: face[1] });
    if (face[2] !== 0 || face[1] !== 0) planes.push({ axis: 'x', fixed: x, du: face[2], dv: face[1] });
    for (const pl of planes) {
      const r = this.tryIgnitePlane(x, y, z, pl);
      if (r) return true;
    }
    return false;
  }
  /* 在某个平面里洪水填充找黑曜石框内部，并填上传送门方块 */
  tryIgnitePlane(x, y, z, pl) {
    const fixedAxis = pl.axis;                       // 'z'：平面为 x-y；'x'：平面为 z-y
    const fixed = pl.fixed;
    // 起始格：点击面法线在该平面内的投影方向
    let su = pl.du, sv = pl.dv;
    if (su === 0 && sv === 0) return false;
    const startU = (fixedAxis === 'z' ? x : z) + su;
    const startV = y + sv;
    const cellPos = (u, v) => fixedAxis === 'z' ? { x: u, y: v, z: fixed } : { x: fixed, y: v, z: u };
    const getAt = (u, v) => { const p = cellPos(u, v); return this.getBlock(p.x, p.y, p.z); };
    // 从最小尺寸（2×3）开始搜索：内部全是空气/可替换方块，外框是黑曜石（允许缺角）
    for (let width = 2; width <= 21; width++) {
      for (let height = 3; height <= 21; height++) {
        for (let u0 = startU - width + 1; u0 <= startU; u0++) {
          for (let v0 = startV - height + 1; v0 <= startV; v0++) {
            const u1 = u0 + width - 1, v1 = v0 + height - 1;
            // 内部必须是空气等可替换方块
            let innerOk = true;
            for (let u = u0; u <= u1 && innerOk; u++) {
              for (let v = v0; v <= v1; v++) {
                const id = getAt(u, v);
                const def = BLOCKS[id];
                if (id === B.nether_portal) continue;
                if (id !== 0 && !def.replaceable) { innerOk = false; break; }
              }
            }
            if (!innerOk) continue;
            // 外框
            let frameOk = true;
            for (let u = u0 - 1; u <= u1 + 1 && frameOk; u++) {
              for (let v = v0 - 1; v <= v1 + 1; v++) {
                const onEdge = u === u0 - 1 || u === u1 + 1 || v === v0 - 1 || v === v1 + 1;
                if (!onEdge) continue;
                const id = getAt(u, v);
                if (id === B.obsidian) continue;
                const corner = (u === u0 - 1 || u === u1 + 1) && (v === v0 - 1 || v === v1 + 1);
                if (corner) continue;                 // 允许缺角
                frameOk = false; break;
              }
            }
            if (!frameOk) continue;
            // 成功：填满内部
            for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) {
              const p = cellPos(u, v);
              this.setBlock(p.x, p.y, p.z, B.nether_portal, { noSupport: true });
              this.setState(p.x, p.y, p.z, null);
            }
            MC.sound.play('portal_ignite', x + 0.5, y + 0.5, z + 0.5);
            MC.ui.chat('下界传送门被点燃了（' + width + '×' + height + '）！站进去 2.5 秒传送。', 'sys');
            return true;
          }
        }
      }
    }
    return false;
  }

  /* 末地传送门：12 个框架都嵌入末影之眼后激活中间的 3×3 */
  checkEndPortal(x, y, z) {
    // 在附近寻找 3×3 环
    for (let cx = x - 1; cx <= x + 1; cx++) for (let cz = z - 1; cz <= z + 1; cz++) {
      let ok = true, count = 0;
      for (let dx = -1; dx <= 1 && ok; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== 1) continue;
        const fx = cx + dx, fz = cz + dz;
        if (this.getBlock(fx, y, fz) !== B.end_portal_frame) { ok = false; break; }
        const st = this.getState(fx, y, fz);
        if (!st || !st.eye) { ok = false; break; }
        count++;
      }
      if (ok && count === 8) {
        // 3×3 环实际是 8 个框架（正十字四角也可放），判定通过后激活中心 3×3
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          const px = cx + dx, pz = cz + dz;
          if (this.getBlock(px, y, pz) === 0) {
            this.setBlock(px, y, pz, B.end_portal, { noSupport: true });
          }
        }
        MC.sound.play('portal_ignite', cx + 0.5, y + 0.5, cz + 0.5);
        MC.ui.chat('末地传送门已激活！跳进去前往末地挑战末影龙。', 'sys');
        MC.ui.unlock('end_portal');
        return true;
      }
    }
    return false;
  }

  /* ---------- 每帧逻辑 ---------- */
  tick(dt, player) {
    this.time += dt / MC.settings.dayLength;
    if (this.time >= 1) { this.time -= 1; this.dayCount++; MC.ui.checkDay(); }
    // 随机刻：作物生长
    this.randomTickAcc += dt;
    if (this.randomTickAcc > 0.25) {
      this.randomTickAcc = 0;
      this.randomTicks(player);
      this.tickWeather(dt);
    }
    // TNT 引信
    for (const [k, st] of this.states) {
      if (st.fuse !== undefined && st.fuse !== null) {
        st.fuse -= dt;
        if (st.fuse <= 0) {
          const [x, y, z] = parsePosKey(k);
          if (this.getBlock(x, y, z) === B.tnt) {
            st.fuse = null;
            this.setBlock(x, y, z, 0, { noSupport: true });
            this.setState(x, y, z, null);
            this.explode(x, y, z, 5.2);
            MC.ui.unlock('tnt');
          } else st.fuse = null;
        }
      }
      if (st.inv !== undefined) this.tickFurnace(k, st, dt);
    }
    // 掉落实体
    this.tickItems(dt, player);
    // 流体流动
    this.fluids.tick(dt);
    // 传送门计时 / 末地传送门
    this.tickPortals(dt, player);
    // 末地城的潜影贝：玩家靠近时生成
    if (this.shulkerPoints.size) this.tickShulkerSpawns(player);
  }

  tickShulkerSpawns(player) {
    for (const k of this.shulkerPoints) {
      const [x, y, z] = parsePosKey(k);
      const d = Math.hypot(x + 0.5 - player.pos.x, z + 0.5 - player.pos.z);
      if (d > 44) continue;
      this.shulkerPoints.delete(k);
      if (d < 6) continue;                       // 别贴脸生成
      const mob = new Mob(this, 'shulker', x + 0.5, y, z + 0.5);
      this.mobs.push(mob);
      MC.sound.play('shulker', x, y, z);
      MC.ui.unlock('endcity');
    }
  }

  /* 传送门：站在下界传送门里 2.5 秒 → 传送；末地传送门瞬间生效 */
  tickPortals(dt, player) {
    if (!player || !player.alive) return;
    // 刚传送过来时不要立刻被同一座传送门送回去
    if (player.teleportCooldown > 0) {
      player.portalTimer = 0;
      MC.ui.setPortalProgress(0);
      return;
    }
    const px = Math.floor(player.pos.x), pz = Math.floor(player.pos.z);
    let inPortal = 0, inEndPortal = false;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const id = this.getBlock(px + dx, Math.floor(player.pos.y) + dy, pz + dz);
        if (id === B.nether_portal) inPortal++;
        if (id === B.end_portal) inEndPortal = true;
      }
    }
    if (inEndPortal) {
      if (this.type === 'end') MC.travel('overworld', true);
      else MC.travel('end');
      return;
    }
    if (inPortal > 0) {
      player.portalTimer = (player.portalTimer || 0) + dt;
      MC.ui.setPortalProgress(clamp(player.portalTimer / 2.5, 0, 1));
      if (player.portalTimer >= 2.5) {
        player.portalTimer = 0;
        MC.ui.setPortalProgress(0);
        MC.travel(this.type === 'nether' ? 'overworld' : 'nether');
      }
    } else if (player.portalTimer) {
      player.portalTimer = 0;
      MC.ui.setPortalProgress(0);
    }
  }

  tickWeather(dt) {
    const w = this.weather;
    if (!this.dimConfig.weather) { w.rain = false; w.thunder = 0; return; }
    w.next -= 0.25;
    if (w.next <= 0) {
      w.rain = !w.rain;
      w.next = w.rain ? 120 + Math.random() * 240 : 400 + Math.random() * 800;
      MC.ui.chat(w.rain ? '开始下雨了…' : '雨停了', 'sys');
    }
    if (w.rain) {
      w.time += 0.25;
      if (Math.random() < 0.004) { w.thunder = 1; MC.sound.play('thunder'); }
    }
    w.thunder = Math.max(0, w.thunder - 0.02);
  }

  randomTicks(player) {
    // 玩家附近的作物随机生长
    if (!this.crops.size) return;
    let tries = 0;
    for (const k of this.crops) {
      if (tries++ > 40) break;
      const [x, y, z] = parsePosKey(k);
      if (Math.abs(x - player.pos.x) > 40 || Math.abs(z - player.pos.z) > 40) continue;
      if (this.getBlock(x, y, z) !== B.farmland_seed) { this.crops.delete(k); continue; }
      const st = this.states.get(k) || { stage: 0 };
      if (st.stage < 7 && Math.random() < 0.35) {
        st.stage++;
        this.states.set(k, st);
        this.light.markDirtyAt(x, y, z);
      }
    }
  }

  tickFurnace(k, st, dt) {
    const [x, y, z] = parsePosKey(k);
    const inv = st.inv || (st.inv = new Array(3).fill(null));
    // inv: 0 输入 1 燃料 2 输出
    const smelt = inv[0] ? SMELT[inv[0].id] : null;
    const canSmelt = !!smelt && (!inv[2] || (inv[2].id === smelt.out && inv[2].count < 64));
    if (st.burn > 0) st.burn -= dt;
    if (st.burn <= 0 && canSmelt && inv[1]) {
      const fuel = FUEL[inv[1].id] || 0;
      if (fuel > 0) {
        st.burnMax = fuel * 10; st.burn = fuel * 10;
        inv[1].count--;
        if (inv[1].count <= 0) inv[1] = null;
        MC.sound.play('furnace', x, y, z);
      }
    }
    if (st.burn > 0 && canSmelt) {
      st.cook = (st.cook || 0) + dt;
      if (st.cook >= 8) {
        st.cook = 0;
        inv[0].count--;
        if (inv[0].count <= 0) inv[0] = null;
        if (inv[2]) inv[2].count++; else inv[2] = { id: smelt.out, count: 1 };
        if (smelt.out === 'iron_ingot') { MC.ach.ironIngot = true; MC.ui.unlock('furnace'); }
        MC.ui.refreshOpenScreen();
      }
    } else st.cook = 0;
    if (st.burn < 0) st.burn = 0;
  }

  tickItems(dt, player) {
    for (let i = this.itemEntities.length - 1; i >= 0; i--) {
      const it = this.itemEntities[i];
      if (it.delay > 0) { it.delay -= dt; continue; }
      it.vy -= 26 * dt;
      const nx = it.x + it.vx * dt, ny = it.y + it.vy * dt, nz = it.z + it.vz * dt;
      const moved = this.moveEntity(it, nx, ny, nz, 0.25);
      it.onGround = moved.onGround;
      if (it.onGround) { it.vx *= 0.7; it.vz *= 0.7; it.vy = 0; }
      it.age += dt;
      // 水流推动
      if (this.getBlock(Math.floor(it.x), Math.floor(it.y), Math.floor(it.z)) === B.water) { it.vy = Math.min(1.5, it.vy + 8 * dt); }
      // 熔岩销毁
      if (this.getBlock(Math.floor(it.x), Math.floor(it.y), Math.floor(it.z)) === B.lava) { this.removeItemEntity(i); continue; }
      // 吸附拾取
      const d = Math.hypot(it.x - player.pos.x, it.y - (player.pos.y + 0.9), it.z - player.pos.z);
      if (d < 1.6 && it.age > 0.4) {
        const left = player.inv.addItem(it.id, it.count, it.meta);
        if (left <= 0) {
          this.removeItemEntity(i); MC.sound.play('pop');
          if (it.id === 'blaze_rod') MC.ui.unlock('blaze');
          if (it.id === 'elytra') MC.ui.unlock('elytra');
          if (it.id === 'ender_pearl' || it.id === 'blaze_powder' || it.id === 'quartz') MC.ach.gotNetherItem = true;
          continue;
        }
        it.count = left;
      }
      if (it.age > 300) { this.removeItemEntity(i); continue; }
      if (it.mesh) {
        it.mesh.position.set(it.x, it.y + Math.sin(it.age * 2.4) * 0.06, it.z);
        it.mesh.rotation.y = Math.atan2(MC.player.pos.x - it.x, MC.player.pos.z - it.z);   // 面朝玩家
      }
    }
  }
  removeItemEntity(i) {
    const it = this.itemEntities[i];
    if (it.mesh) {
      this.scene.remove(it.mesh);
      it.mesh.traverse(o => {
        if (o.isMesh) { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }
      });
    }
    this.itemEntities.splice(i, 1);
  }
  spawnItem(x, y, z, id, count, meta) {
    const def = itemDef(id); if (!def) return null;
    // 掉落物 = 单张平面物品图标 + 透明裁剪，每帧转向玩家（不会出现黑方块，也不会两张图交叉）
    const icon = MC.icons.forItem({ id, def, meta }, 32);
    const iconTex = new THREE.CanvasTexture(icon);
    iconTex.magFilter = THREE.NearestFilter;
    iconTex.minFilter = THREE.NearestFilter;
    iconTex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: iconTex, transparent: true, alphaTest: 0.35,
      side: THREE.DoubleSide, depthWrite: true,
    });
    const size = 0.42;
    const geo = new THREE.PlaneGeometry(size, size);
    const mesh = new THREE.Mesh(geo, mat);   // 单张平面，每帧转向镜头（看起来就是一张物品图）
    const it = { x, y, z, vx: (Math.random() - 0.5) * 1.2, vy: 2 + Math.random(), vz: (Math.random() - 0.5) * 1.2, id, count, meta: meta || null, age: 0, delay: randInt(40) / 100, mesh, onGround: false };
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.itemEntities.push(it);
    return it;
  }

  /* 实体移动：逐轴 AABB 扫描 + 台阶自动上抬 */
  collideAt(x, y, z, width, height) {
    const x0 = Math.floor(x - width / 2), x1 = Math.floor(x + width / 2 - 1e-6);
    const y0 = Math.floor(y), y1 = Math.floor(y + height - 1e-6);
    const z0 = Math.floor(z - width / 2), z1 = Math.floor(z + width / 2 - 1e-6);
    for (let bx = x0; bx <= x1; bx++) for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) {
      const by2 = by;
      const d = this.getBlockDef(bx, by2, bz);
      if (d.solid && !d.noCollide) return true;
    }
    return false;
  }
  moveEntity(ent, nx, ny, nz, width, stepUp) {
    const h = ent.height || 0.5;
    const res = { hitX: false, hitY: false, hitZ: false, onGround: false, hitWall: false };
    // X 轴
    if (!this.collideAt(nx, ent.y, ent.z, width, h)) ent.x = nx;
    else {
      let stepped = false;
      if (stepUp) {
        const dy = stepUp;
        if (!this.collideAt(nx, ent.y + dy, ent.z, width, h) && !this.collideAt(ent.x + (nx - ent.x) * 0.5, ent.y + dy, ent.z, width, h)) { ent.y += dy; ent.x = nx; stepped = true; }
      }
      if (!stepped) { res.hitX = true; res.hitWall = true; }
    }
    // Z 轴
    if (!this.collideAt(ent.x, ent.y, nz, width, h)) ent.z = nz;
    else {
      let stepped = false;
      if (stepUp) {
        const dy = stepUp;
        if (!this.collideAt(ent.x, ent.y + dy, nz, width, h)) { ent.y += dy; ent.z = nz; stepped = true; }
      }
      if (!stepped) { res.hitZ = true; res.hitWall = true; }
    }
    // Y 轴
    if (!this.collideAt(ent.x, ny, ent.z, width, h)) { ent.y = ny; res.onGround = false; }
    else {
      res.hitY = true;
      if (ny < ent.y) res.onGround = true;
    }
    ent.onGround = res.onGround;
    return res;
  }

  /* ---------- 存档 ----------
     改动表按「区块」压缩成 base64（每格 3 字节：lx<<4|lz, y, 方块id），
     比原来的 "x,y,z":id 文本小 6~8 倍，避免 localStorage 5MB 配额被撑爆。 */
  encodeEdits() {
    const out = {};
    this.editsByChunk.forEach((bucket, ck) => {
      const arr = new Uint8Array(bucket.size * 3);
      let i = 0;
      bucket.forEach((id, k) => {
        const [x, y, z] = parsePosKey(k);
        const cx = Math.floor(x / CHUNK_W), cz = Math.floor(z / CHUNK_W);
        const lx = x - cx * CHUNK_W, lz = z - cz * CHUNK_W;
        arr[i++] = (lx << 4) | (lz & 15);
        arr[i++] = y & 255;
        arr[i++] = id & 255;
      });
      let bin = '';
      const chunkSize = 8192;
      for (let p2 = 0; p2 < arr.length; p2 += chunkSize) bin += String.fromCharCode.apply(null, arr.subarray(p2, p2 + chunkSize));
      out[ck] = btoa(bin);
    });
    return out;
  }
  static decodeEdits(obj) {
    const list = [];
    for (const ck in obj) {
      const parts = ck.split(',');
      const cx = parseInt(parts[0], 10), cz = parseInt(parts[1], 10);
      let bin = '';
      try { bin = atob(obj[ck]); } catch (e) { continue; }
      for (let i = 0; i + 2 < bin.length; i += 3) {
        const b0 = bin.charCodeAt(i), y = bin.charCodeAt(i + 1), id = bin.charCodeAt(i + 2);
        const lx = (b0 >> 4) & 15, lz = b0 & 15;
        list.push([posKey(cx * CHUNK_W + lx, y, cz * CHUNK_W + lz), id]);
      }
    }
    return list;
  }
  serialize() {
    const edits = this.encodeEdits();
    // 状态只存“非默认”的：空箱子、0 级红石线、没长的作物不必存
    const states = [];
    this.states.forEach((v, k) => {
      if (!v) return;
      if (v.inv && v.inv.every(x => !x) && v.burn === undefined) return;
      // 默认状态不用存：水源(level 0/source)、0 级红石线、没长的作物、空箱子…
      if (v.source === true && (v.level | 0) === 0 && !v.falling) return;
      if (v.power === 0 && !v.on && !v.lit && !v.powered && (v.stage | 0) === 0 && !v.eye && v.inv === undefined) return;
      states.push([k, v]);
    });
    // 流体状态：每格 3 字节（lx<<4|lz, y, level|落下标记），超过上限只保留玩家附近的
    const MAX_LIQ = 40000;
    let liqEntries = [...this.liquids.entries()];
    if (liqEntries.length > MAX_LIQ) {
      const px = MC.player ? MC.player.pos.x : 0, pz = MC.player ? MC.player.pos.z : 0;
      liqEntries.sort((a, b) => {
        const A = parsePosKey(a[0]), B = parsePosKey(b[0]);
        return Math.hypot(A[0] - px, A[2] - pz) - Math.hypot(B[0] - px, B[2] - pz);
      });
      liqEntries = liqEntries.slice(0, MAX_LIQ);
    }
    const liquidBin = {};
    for (const [k, st] of liqEntries) {
      const [x, y, z] = parsePosKey(k);
      const cx = Math.floor(x / CHUNK_W), cz = Math.floor(z / CHUNK_W);
      const lx = x - cx * CHUNK_W, lz = z - cz * CHUNK_W;
      const ck = cx + ',' + cz;
      if (!liquidBin[ck]) liquidBin[ck] = [];
      liquidBin[ck].push((lx << 4) | (lz & 15), y & 255, ((st.level | 0) & 127) | (st.falling ? 128 : 0));
    }
    const liquids = {};
    for (const ck in liquidBin) {
      const arr = Uint8Array.from(liquidBin[ck]);
      let bin = '';
      for (let p2 = 0; p2 < arr.length; p2 += 8192) bin += String.fromCharCode.apply(null, arr.subarray(p2, p2 + 8192));
      liquids[ck] = btoa(bin);
    }
    return {
      seed: this.seed, time: this.time, dayCount: this.dayCount,
      editsCompact: edits, states, liquids, weather: this.weather, version: 3,
    };
  }
  applySave(save) {
    if (save.liquids) {
      for (const ck in save.liquids) {
        const parts = ck.split(',');
        const cx = parseInt(parts[0], 10), cz = parseInt(parts[1], 10);
        let bin = '';
        try { bin = atob(save.liquids[ck]); } catch (e) { continue; }
        for (let i = 0; i + 2 < bin.length; i += 3) {
          const b0 = bin.charCodeAt(i), y = bin.charCodeAt(i + 1), lv = bin.charCodeAt(i + 2);
          this.liquids.set(posKey(cx * CHUNK_W + ((b0 >> 4) & 15), y, cz * CHUNK_W + (b0 & 15)),
            { level: lv & 127, falling: !!(lv & 128), source: false });
        }
      }
    }
    const editList = save.editsCompact ? World.decodeEdits(save.editsCompact) : (save.edits || []);
    editList.forEach(([k, v]) => {
      const [x, y, z] = parsePosKey(k);
      this.edits.set(k, v);
      const ck = chunkKey(Math.floor(x / CHUNK_W), Math.floor(z / CHUNK_W));
      let bucket = this.editsByChunk.get(ck);
      if (!bucket) { bucket = new Map(); this.editsByChunk.set(ck, bucket); }
      bucket.set(k, v);
      const c = this.getChunkAt(x, z);
      if (c) { c.set(x - c.x * CHUNK_W, y, z - c.z * CHUNK_W, v); c.dirty = true; this.light.markDirtyAt(x, y, z); }
    });
    (save.states || []).forEach(([k, v]) => { this.states.set(k, v); const [x, y, z] = parsePosKey(k); if (v && v.burn !== undefined) this.activeFurnaces.add(k); this.light.markDirtyAt(x, y, z); });
    if (save.time !== undefined) this.time = save.time;
    if (save.dayCount) this.dayCount = save.dayCount;
    if (save.weather) this.weather = save.weather;
  }
}
