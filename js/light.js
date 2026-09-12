/* ============================================================
   光照引擎：天光（Skylight）+ 方块光（火把/荧石/岩浆）洪泛填充
   ============================================================ */

class LightEngine {
  constructor(world) {
    this.world = world;
    this.skyQ = [];    // 扁平数组 [x,y,z, x,y,z, ...]
    this.blockQ = [];
    this.si = 0; this.bi = 0;
    this.dirty = new Set();       // 需要重建网格的区块 key
    this.relightQueue = [];       // 待重算的局部区域 {x,y,z,r}
    this.relightIndex = new Map(); // 同上，用于去重
    this.stats = { sky: 0, block: 0 };
  }

  markDirty(cx, cz) {
    this.dirty.add(chunkKey(cx, cz));
    // 光照会影响相邻区块的边界亮度，故相邻也重建
  }
  markDirtyAt(x, y, z) {
    const cx = Math.floor(x / CHUNK_W), cz = Math.floor(z / CHUNK_W);
    this.markDirty(cx, cz);
    const lx = x - cx * CHUNK_W, lz = z - cz * CHUNK_W;
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_W - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_W - 1) this.markDirty(cx, cz + 1);
  }

  /* ---------- 区块初始化：按列计算天光 ---------- */
  initChunk(chunk) {
    const sky = chunk.sky;
    const mode = this.world.dimConfig.skyMode;
    sky.fill(mode === 'uniform' ? this.world.skyLightLevel : 0);
    if (mode !== 'column') {
      // 下界 / 末地：没有阳光柱，只保留均匀环境光或全黑
      this.markDirty(chunk.x, chunk.z);
      const w0 = this.world;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w0.getChunk(chunk.x + dx, chunk.z + dz)) this.markDirty(chunk.x + dx, chunk.z + dz);
      return;
    }
    for (let lz = 0; lz < CHUNK_W; lz++) {
      for (let lx = 0; lx < CHUNK_W; lx++) {
        let l = MAX_LIGHT;
        let lowestFull = -1;
        for (let y = WORLD_H - 1; y >= 0; y--) {
          const b = chunk.get(lx, y, lz);
          const def = BLOCKS[b];
          if (def.opaque && def.solid) l = 0;
          else { const att = def.lightAtten || 0; if (att) l = Math.max(0, l - att); }
          const i = (y * CHUNK_W + lz) * CHUNK_W + lx;
          sky[i] = l;
          if (l === MAX_LIGHT) lowestFull = y;
        }
        if (lowestFull >= 0) this.pushSky(chunk.x * CHUNK_W + lx, lowestFull, chunk.z * CHUNK_W + lz);
      }
    }
    // 邻接区块的光可能流入本区
    this.markDirty(chunk.x, chunk.z);
    const w = this.world;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.getChunk(chunk.x + dx, chunk.z + dz)) this.markDirty(chunk.x + dx, chunk.z + dz);
  }

  pushSky(x, y, z) { if (y < 0 || y >= WORLD_H) return; this.skyQ.push(x, y, z); this.stats.pushes = (this.stats.pushes || 0) + 1; }
  pushBlock(x, y, z) { if (y < 0 || y >= WORLD_H) return; this.blockQ.push(x, y, z); this.stats.pushes = (this.stats.pushes || 0) + 1; }

  /* ---------- 设置方块光源 ---------- */
  addSource(x, y, z, level) {
    const w = this.world;
    w.setBlockLight(x, y, z, level);
    this.pushBlock(x, y, z);
    this.markDirtyAt(x, y, z);
  }

  /* ---------- 区域重算（方块变化时调用） ---------- */
  relightArea(x, y, z, r = 15) {
    const w = this.world;
    const x0 = Math.max(-30000000, x - r), x1 = x + r;
    const z0 = z - r, z1 = z + r;
    const y0 = Math.max(0, y - r), y1 = Math.min(WORLD_H - 1, y + r);
    const cx0 = Math.floor(x0 / CHUNK_W), cx1 = Math.floor(x1 / CHUNK_W);
    const cz0 = Math.floor(z0 / CHUNK_W), cz1 = Math.floor(z1 / CHUNK_W);
    // 1. 清空区域内的光照
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const ch = w.getChunk(cx, cz);
      if (!ch) continue;
      for (let ly = y0; ly <= y1; ly++) {
        for (let lz = Math.max(0, z0 - cz * CHUNK_W); lz <= Math.min(CHUNK_W - 1, z1 - cz * CHUNK_W); lz++) {
          for (let lx = Math.max(0, x0 - cx * CHUNK_W); lx <= Math.min(CHUNK_W - 1, x1 - cx * CHUNK_W); lx++) {
            const i = (ly * CHUNK_W + lz) * CHUNK_W + lx;
            ch.sky[i] = 0; ch.blockLight[i] = 0;
          }
        }
      }
      this.markDirty(cx, cz);
    }
    const skyMode = w.dimConfig.skyMode;
    // 2. 天光按列重建 + 收集发射源
    for (let wx = x0; wx <= x1; wx++) {
      for (let wz = z0; wz <= z1; wz++) {
        const ch = w.getChunkAt(wx, wz);
        if (!ch) continue;
        const lx = wx - ch.x * CHUNK_W, lz = wz - ch.z * CHUNK_W;
        if (skyMode === 'column') {
          let l = MAX_LIGHT, lowestFull = -1;
          for (let wy = WORLD_H - 1; wy >= 0; wy--) {
            const def = BLOCKS[ch.get(lx, wy, lz)];
            if (def.opaque && def.solid) l = 0;
            else { const att = def.lightAtten || 0; if (att) l = Math.max(0, l - att); }
            if (wy <= y1 && wy >= y0) {
              ch.sky[(wy * CHUNK_W + lz) * CHUNK_W + lx] = l;
              if (l === MAX_LIGHT) lowestFull = wy;
            }
          }
          if (lowestFull >= 0) this.pushSky(wx, lowestFull, wz);
        } else {
          const v = skyMode === 'uniform' ? w.skyLightLevel : 0;
          for (let wy = y0; wy <= y1; wy++) ch.sky[(wy * CHUNK_W + lz) * CHUNK_W + lx] = v;
        }
        // 发射源（含点亮的红石灯/燃烧的熔炉）
        for (let wy = y0; wy <= y1; wy++) {
          const def = BLOCKS[ch.get(lx, wy, lz)];
          const em = w.getLightEmission(wx, wy, wz, def);
          if (em > 0) { ch.blockLight[(wy * CHUNK_W + lz) * CHUNK_W + lx] = em; this.pushBlock(wx, wy, wz); }
        }
      }
    }
    // 3. 边界种子：让区域外光照流入
    for (let wx = x0 - 1; wx <= x1 + 1; wx++) {
      for (let wz = z0 - 1; wz <= z1 + 1; wz++) {
        const onEdge = (wx === x0 - 1 || wx === x1 + 1 || wz === z0 - 1 || wz === z1 + 1);
        if (!onEdge) continue;
        for (let wy = Math.max(0, y0 - 1); wy <= Math.min(WORLD_H - 1, y1 + 1); wy++) {
          const s = w.getSkyLight(wx, wy, wz), b = w.getBlockLight(wx, wy, wz);
          if (s > 0) this.pushSky(wx, wy, wz);
          if (b > 0) this.pushBlock(wx, wy, wz);
        }
      }
    }
  }

  requestRelight(x, y, z, r) {
    r = r || 11;
    const k = (((x + 1048576) & 0x1fffff) * 2097152 + ((z + 1048576) & 0x1fffff)) * 128 + (y & 127);
    // 同一个位置只保留一个任务；半径取最大的那个
    const prev = this.relightIndex.get(k);
    if (prev) { if (r > prev.r) prev.r = r; return; }
    if (this.relightQueue.length >= 4096) {              // 极端情况下丢最老的，保证新方块立刻可见
      const dropped = this.relightQueue.shift();
      const dk = (((dropped.x + 1048576) & 0x1fffff) * 2097152 + ((dropped.z + 1048576) & 0x1fffff)) * 128 + (dropped.y & 127);
      this.relightIndex.delete(dk);
    }
    const job = { x, y, z, r, k };
    this.relightQueue.push(job);
    this.relightIndex.set(k, job);
  }

  /* ---------- 洪泛推进 ---------- */
  process(budget = 12000) {
    const w = this.world;
    let work = 0;
    // 队列积压时加大处理量，避免长跑后越积越多
    const backlog = (this.skyQ.length - this.si) + (this.blockQ.length - this.bi);
    if (backlog > 40000) budget = Math.max(budget, Math.min(240000, Math.round(backlog / 3)));
    // 处理重算请求：每帧最多 4 个（连续建造时也能及时跟上，不至于积压成百上千）
    let jobs = 0;
    while (this.relightQueue.length && jobs < 6) {
      const job = this.relightQueue.shift();
      this.relightIndex.delete(job.k);
      this.relightArea(job.x, job.y, job.z, job.r);
      jobs++;
    }
    const skyEnabled = w.dimConfig.skyMode === 'column';
    while (skyEnabled && this.si < this.skyQ.length && work < budget) {
      const x = this.skyQ[this.si], y = this.skyQ[this.si + 1], z = this.skyQ[this.si + 2];
      this.si += 3; work++;
      const lvl = w.getSkyLight(x, y, z);
      if (lvl <= 0) continue;
      for (let d = 0; d < 6; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
        if (ny < 0 || ny >= WORLD_H) continue;
        if (!w.isLoaded(nx, nz)) continue;      // 未加载的区块不传播光照
        const def = w.getBlockDef(nx, ny, nz);
        if (def.opaque && def.solid) continue;
        const att = def.lightAtten || 0;
        let nl;
        if (d === 1 && lvl === MAX_LIGHT && att === 0) nl = MAX_LIGHT;   // 向下不衰减
        else nl = lvl - 1 - att;
        if (nl <= 0) continue;
        if (nl > w.getSkyLight(nx, ny, nz)) {
          w.setSkyLight(nx, ny, nz, nl);
          this.markDirtyAt(nx, ny, nz);
          this.skyQ.push(nx, ny, nz);
        }
      }
    }
    while (this.bi < this.blockQ.length && work < budget) {
      const x = this.blockQ[this.bi], y = this.blockQ[this.bi + 1], z = this.blockQ[this.bi + 2];
      this.bi += 3; work++;
      const lvl = w.getBlockLight(x, y, z);
      if (lvl <= 0) continue;
      for (let d = 0; d < 6; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
        if (ny < 0 || ny >= WORLD_H) continue;
        if (!w.isLoaded(nx, nz)) continue;
        const def = w.getBlockDef(nx, ny, nz);
        if (def.opaque && def.solid) continue;
        const nl = lvl - 1 - (def.lightAtten || 0);
        if (nl <= 0) continue;
        if (nl > w.getBlockLight(nx, ny, nz)) {
          w.setBlockLight(nx, ny, nz, nl);
          this.markDirtyAt(nx, ny, nz);
          this.blockQ.push(nx, ny, nz);
        }
      }
    }
    // 队列清理
    if (this.si > 300000 && this.si >= this.skyQ.length) { this.skyQ.length = 0; this.si = 0; }
    else if (this.si > 60000) { this.skyQ = this.skyQ.slice(this.si); this.si = 0; }
    if (this.bi > 300000 && this.bi >= this.blockQ.length) { this.blockQ.length = 0; this.bi = 0; }
    else if (this.bi > 60000) { this.blockQ = this.blockQ.slice(this.bi); this.bi = 0; }
    this.stats.sky = this.skyQ.length - this.si;
    this.stats.block = this.blockQ.length - this.bi;
    // 极端积压时丢弃过老的队列，光照本就是近似值
    if (this.skyQ.length - this.si > 250000) { this.skyQ = this.skyQ.slice(Math.floor(this.skyQ.length * 0.6)); this.si = 0; }
    if (this.blockQ.length - this.bi > 600000) { this.blockQ = this.blockQ.slice(Math.floor(this.blockQ.length * 0.6)); this.bi = 0; }
    return work;
  }

  /* 方块被放置/破坏时调用 */
  onBlockChange(x, y, z, oldDef, newDef) {
    // 小范围重算即可：只有光源变化才需要更大的半径
    const emissive = (oldDef && oldDef.light) || (newDef && newDef.light);
    const r = emissive ? 14 : 11;
    this.requestRelight(x, y, z, r);
  }
}

// 6 邻域： 0:+x 1:-y(下) 2:+y(上) 3:-x 4:+z 5:-z
const DIRS = [[1, 0, 0], [0, -1, 0], [0, 1, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
