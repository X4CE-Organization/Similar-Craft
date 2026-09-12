/* ============================================================
   流体模拟：水与岩浆的流动 / 液面高度 / 水流推力 / 水火交融
   —— 规则参考 Minecraft：水 7 格·4 格/秒；岩浆 3 格(下界 7 格)；
      水源旁两格水或上方有水→形成新水源；水碰岩浆源→黑曜石，
      两股流动液相遇→圆石，岩浆从上方浇在水上→石头
   ============================================================ */

const FLUID = {
  water: { block: B.water, maxSpread: 7, interval: 0.25, dmg: 0 },
  lava: { block: B.lava, maxSpread: 3, interval: 1.5, dmg: 4 },
};

class FluidEngine {
  constructor(world) {
    this.world = world;
    // 待处理队列（FIFO + 去重）：数组存顺序，Set 防止同一格重复入队
    this.qWater = []; this.qLava = [];
    this.hWater = 0; this.hLava = 0;
    this.queuedWater = new Set(); this.queuedLava = new Set();
    this.acc = { water: 0, lava: 0 };
    this.budget = 500;             // 每 tick 至少处理的格子数（队列长时自动加大）
    this.stats = { cells: 0, spread: 0 };
  }
  liquidInfo(id) {
    if (id === B.water) return FLUID.water;
    if (id === B.lava) return FLUID.lava;
    return null;
  }
  maxSpread(id) {
    const info = this.liquidInfo(id);
    if (!info) return 0;
    if (id === B.lava && this.world.type === 'nether') return 7;
    return info.maxSpread;
  }
  interval(id) {
    const info = this.liquidInfo(id);
    if (id === B.lava && this.world.type === 'nether') return 0.5;
    return info ? info.interval : 1;
  }
  /* 液面高度 0.23~1 */
  heightAt(x, y, z) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    if (!this.liquidInfo(id)) return 1;
    const st = w.getState(x, y, z);
    if (!st) return 1;
    if (st.falling) return 1;
    const lv = st.level | 0;
    return Math.max(0.23, 1 - lv * 0.11);
  }
  /* 用于扩散的“强度”：越小越靠近源头，源头=0，下落=0（满强度） */
  strength(x, y, z) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    if (!this.liquidInfo(id)) return 99;
    const st = w.getState(x, y, z);
    if (!st) return 0;
    if (st.falling) return 0;
    return st.level | 0;
  }
  isSource(x, y, z) {
    const st = this.world.getState(x, y, z);
    if (!st) return this.world.getBlock(x, y, z) === B.water || this.world.getBlock(x, y, z) === B.lava;   // 没有状态＝默认水源
    return !!st.source;
  }

  /* ---------- 触发更新 ---------- */
  request(x, y, z) {
    if (y < 0 || y >= WORLD_H) return;
    // 只登记流体格子：空气格会被相邻流体在扩散时直接检查
    const id = this.world.getBlock(x, y, z);
    if (id !== B.water && id !== B.lava) return;
    const key = posKey(x, y, z);
    if (id === B.water) {
      if (this.queuedWater.has(key)) return;
      this.queuedWater.add(key); this.qWater.push(key);
    } else {
      if (this.queuedLava.has(key)) return;
      this.queuedLava.add(key); this.qLava.push(key);
    }
  }
  pendingWater() { return this.qWater.length - this.hWater; }
  pendingLava() { return this.qLava.length - this.hLava; }
  get activeSize() { return this.pendingWater() + this.pendingLava(); }
  requestAround(x, y, z, r = 1) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) this.request(x + dx, y + dy, z + dz);
  }
  /* 方块被放置/破坏时由 World 调用 */
  onBlockChanged(x, y, z) {
    this.requestAround(x, y, z, 1);
  }
  onLiquidPlaced(x, y, z, id, isSource) {
    const w = this.world;
    if (!isSource) w.setState(x, y, z, { level: 0, falling: false, source: false });   // 水源＝默认状态，不用存
    else w.setState(x, y, z, null);
    this.requestAround(x, y, z, 2);
  }

  /* ---------- 主循环 ---------- */
  tick(dt) {
    const w = this.world;
    if (this.pendingWater() <= 0 && this.pendingLava() <= 0) return;
    for (const id of [B.water, B.lava]) {
      this.acc[id === B.water ? 'water' : 'lava'] += dt;
    }
    let didWork = false;
    for (const fluid of ['water', 'lava']) {
      const id = fluid === 'water' ? B.water : B.lava;
      const info = FLUID[fluid];
      const step = this.interval(id);
      if (this.acc[fluid] < step) continue;
      this.acc[fluid] -= step;
      let n = 0;
      const q = fluid === 'water' ? this.qWater : this.qLava;
      const qs = fluid === 'water' ? this.queuedWater : this.queuedLava;
      const head = () => (fluid === 'water' ? this.hWater : this.hLava);
      // 队列越长处理越快，保证大范围放水也能及时流动
      const pending = q.length - head();
      const limit = clamp(Math.round(pending / 2), this.budget, 20000);
      const end = Math.min(q.length, head() + limit);
      for (let i = head(); i < end; i++) {
        const k = q[i];
        qs.delete(k);
        const [x, y, z] = parsePosKey(k);
        if (this.updateCell(x, y, z, id)) didWork = true;
        n++;
      }
      if (fluid === 'water') { this.hWater = end; if (this.hWater > 4096) { this.qWater.splice(0, this.hWater); this.hWater = 0; } }
      else { this.hLava = end; if (this.hLava > 4096) { this.qLava.splice(0, this.hLava); this.hLava = 0; } }
      this.stats.cells = n;
      if (this.acc[fluid] > step * 4) this.acc[fluid] = step;   // 防止积压
    }
    return didWork;
  }

  /* 判断某格能否被液体替代（空气/可替换/植物/同种液体） */
  canFlowInto(x, y, z, id) {
    const w = this.world;
    const def = w.getBlockDef(x, y, z);
    if (def.id === 0) return true;
    if (def.replaceable) return true;
    if (def.id === id) return true;
    if (def.liquid) return false;
    if (def.washable) return true;                                                  // 会被冲走
    if (def.shape === 'cross' || def.shape === 'crop' || def.shape === 'torch' || def.shape === 'flat') return true;
    return false;
  }
  washAway(x, y, z) {
    // 水冲走植物/火把/红石线/火等（掉落成物品，火直接被浇灭）
    const w = this.world;
    const def = w.getBlockDef(x, y, z);
    if (def.id === 0 || def.liquid || (def.solid && def.shape === 'cube')) return false;
    const washable = def.washable || def.shape === 'cross' || def.shape === 'crop' || def.shape === 'torch' || def.shape === 'flat';
    if (washable) {
      if (def.id === B.fire) {
        w.setBlock(x, y, z, 0, { noSupport: true, noFluid: true });
        MC.sound.play('fizz', x + 0.5, y + 0.5, z + 0.5);
        MC.particles.smoke(x + 0.5, y + 0.7, z + 0.5);
        return true;
      }
      if (def.id === B.farmland_seed) w.crops && w.crops.delete(posKey(x, y, z));
      const drops = def.drops === null ? [{ id: def.name, count: 1 }] : (def.drops || []).map((id2, i) => ({
        id: id2, count: def.dropCount || 1, chance: def.dropChance ? (def.dropChance[i] ?? 1) : 1,
      })).filter(d => Math.random() < (d.chance ?? 1));
      w.setBlock(x, y, z, 0, { noSupport: true, noFluid: true });
      for (const d of drops) if (d.id && !String(d.id).endsWith('_dummy')) w.spawnItem(x + 0.5, y + 0.4, z + 0.5, d.id, d.count);
      return true;
    }
    return false;
  }

  /* 水与岩浆交互 */
  mixCheck(x, y, z, id) {
    const w = this.world;
    if (id !== B.water && id !== B.lava) return;
    const isLava = id === B.lava;
    const isWater = id === B.water;
    const above = w.getBlock(x, y + 1, z);
    // 岩浆从上方浇在水上 → 石头
    if (isWater && above === B.lava) {
      w.setBlock(x, y, z, B.stone, { noFluid: false });
      MC.particles.smoke(x + 0.5, y + 1, z + 0.5);
      MC.sound.play('fizz', x + 0.5, y + 0.5, z + 0.5);
      return true;
    }
    if (!isLava) return false;
    const source = this.isSource(x, y, z);
    // 岩浆下方是水 → 水变石头（岩浆保留）
    if (w.getBlock(x, y - 1, z) === B.water) {
      w.setBlock(x, y - 1, z, B.stone, { noFluid: true });
      MC.sound.play('fizz', x + 0.5, y + 0.5, z + 0.5);
      MC.particles.smoke(x + 0.5, y - 0.4, z + 0.5);
      this.requestAround(x, y, z, 1);
      return true;
    }
    // 检查六个方向的水
    for (const d of DIRS) {
      if (d[1] === -1) continue;
      const nx = x + d[0], ny = y + d[1], nz = z + d[2];
      if (w.getBlock(nx, ny, nz) !== B.water) continue;
      const waterSource = this.isSource(nx, ny, nz);
      if (source) {
        // 水碰岩浆源 → 黑曜石
        w.setBlock(x, y, z, B.obsidian, { noFluid: true });
        MC.sound.play('fizz', x + 0.5, y + 0.5, z + 0.5);
        return true;
      }
      // 两股流动液体相遇 → 圆石（水被消耗）
      w.setBlock(x, y, z, B.cobblestone, { noFluid: true });
      if (!waterSource) w.setBlock(nx, ny, nz, 0, { noFluid: true });
      MC.sound.play('fizz', x + 0.5, y + 0.5, z + 0.5);
      MC.particles.smoke(x + 0.5, y + 1, z + 0.5);
      return true;
    }
    return false;
  }

  /* 更新单个流体格；返回是否发生了变化 */
  updateCell(x, y, z, expectId) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    const info = this.liquidInfo(id);
    if (!info) return false;
    if (expectId !== undefined && id !== expectId) return false;
    // 下界的水会瞬间蒸发
    if (id === B.water && w.dimConfig.noWater) {
      w.setBlock(x, y, z, 0, { noFluid: true });
      MC.particles.smoke(x + 0.5, y + 0.8, z + 0.5);
      MC.sound.play('fizz', x + 0.5, y + 0.5, z + 0.5);
      return true;
    }
    let st = w.getState(x, y, z);
    let stPersisted = !!st;
    if (!st || st.level === undefined) st = { level: 0, falling: false, source: true };   // 默认＝水源，先不落盘
    const isSource = !!st.source;
    let changed = false;

    /* ---- 1. 重新计算自己的液面高度 ---- */
    if (!isSource) {
      const aboveSame = w.getBlock(x, y + 1, z) === id;
      let newLevel = 99;
      let newFalling = false;
      if (aboveSame) { newFalling = true; newLevel = 0; }
      else {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (w.getBlock(x + dx, y, z + dz) !== id) continue;
          const s = this.strength(x + dx, y, z + dz);
          const cand = s + 1;
          if (cand < newLevel) newLevel = cand;
        }
      }
      const maxSpread = this.maxSpread(id);
      const sourceNearby = this.hasSourceSupply(x, y, z, id);
      if (newLevel > maxSpread || (!sourceNearby && !newFalling && newLevel > maxSpread)) {
        // 失去供给 → 干掉
        w.setBlock(x, y, z, 0, { noFluid: true });
        this.requestAround(x, y, z, 1);
        return true;
      }
      if ((st.level | 0) !== newLevel || !!st.falling !== newFalling || !stPersisted) {
        w.setState(x, y, z, { level: newLevel, falling: newFalling, source: false });
        st = w.getState(x, y, z);
        stPersisted = true;
        w.light.markDirtyAt(x, y, z);
        changed = true;
      }
    }

    /* ---- 2. 水火交融 ---- */
    if (this.mixCheck(x, y, z, id)) { this.requestAround(x, y, z, 1); return true; }

    /* ---- 2.5 无限水源：流动水旁边有两个水源（或一个水源+上方水源）→ 变成水源 ---- */
    if (!isSource && id === B.water) {
      let sources = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (w.getBlock(x + dx, y, z + dz) === B.water && this.isSource(x + dx, y, z + dz)) sources++;
      }
      if (w.getBlock(x, y + 1, z) === B.water && this.isSource(x, y + 1, z)) sources++;
      if (sources >= 2) {
        w.setState(x, y, z, { level: 0, falling: false, source: true });
        this.requestAround(x, y, z, 1);
        return true;
      }
    }

    /* ---- 3. 向下流动（不受扩散距离限制） ---- */
    const belowId = w.getBlock(x, y - 1, z);
    const belowDef = w.getBlockDef(x, y - 1, z);
    // 岩浆从上方浇在水上 → 水变成石头
    if (id === B.lava && belowId === B.water) {
      w.setBlock(x, y - 1, z, B.stone, { noFluid: true });
      MC.sound.play('fizz', x + 0.5, y + 0.5, z + 0.5);
      MC.particles.smoke(x + 0.5, y + 0.6, z + 0.5);
      this.requestAround(x, y, z, 1);
      return true;
    }
    if (y > 0 && belowId !== id && this.canFlowInto(x, y - 1, z, id)) {
      // 先冲掉下方的小方块（火把/花草/红石线…），再让液体灌下去
      this.washAway(x, y - 1, z);
      w.setBlock(x, y - 1, z, id, { noFluid: true, noSupport: true, noLight: true });
      w.setState(x, y - 1, z, { level: 0, falling: true, source: false });
      w.light.markDirtyAt(x, y - 1, z);
      if (id === B.lava) w.light.requestRelight(x, y - 1, z, 12);
      this.requestAround(x, y - 1, z, 1);
      return true;
    }
    if (y > 0 && belowId === id) {
      const bst = w.getState(x, y - 1, z);
      if (!bst || !bst.falling) { w.setState(x, y - 1, z, { level: 0, falling: true, source: false }); this.request(x, y - 1, z); return true; }
    }

    /* ---- 4. 水平扩散 ---- */
    const myStrength = this.strength(x, y, z);
    const maxSpread = this.maxSpread(id);
    if (myStrength + 1 > maxSpread) return changed;
    // 找可以流下去的方向（流动权重：优先往落差方向）
    const cands = [];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      const nDef = w.getBlockDef(nx, y, nz);
      const nId = nDef.id;
      if (nId === id) continue;
      if (!this.canFlowInto(nx, y, nz, id)) continue;
      const targetStr = myStrength + 1;
      if (targetStr > maxSpread) continue;
      let drops = false;
      for (let d = 1; d <= 4; d++) {
        const below = w.getBlockDef(nx, y - d, nz);
        if (!this.canFlowInto(nx, y - d + 1, nz, id)) break;
        if (below.solid && !below.noCollide) { drops = true; break; }
      }
      cands.push({ nx, nz, weight: drops ? 1 : 1000, targetStr });
    }
    if (!cands.length) return changed;
    // 只向权重最小的方向扩散（像 MC 一样优先流向落差）
    const minW = Math.min(...cands.map(c => c.weight));
    const limited = cands.filter(c => c.weight === minW);
    for (const c of limited) {
      const cur = w.getBlock(c.nx, y, c.nz);
      const curStr = cur === id ? this.strength(c.nx, y, c.nz) : 99;
      if (curStr <= c.targetStr) continue;
      this.washAway(c.nx, y, c.nz);
      w.setBlock(c.nx, y, c.nz, id, { noFluid: true, noSupport: true, noLight: true });
      w.setState(c.nx, y, c.nz, { level: c.targetStr, falling: false, source: false });
      w.light.markDirtyAt(c.nx, y, c.nz);
      if (id === B.lava) w.light.requestRelight(c.nx, y, c.nz, 12);   // 岩浆发光，需要重算光照
      this.requestAround(c.nx, y, c.nz, 1);
      this.stats.spread++;
      changed = true;
    }
    return changed;
  }
  /* 是否有水源供给（自身相邻水源或上方/旁边有更强的水） */
  hasSourceSupply(x, y, z, id) {
    const w = this.world;
    if (w.getBlock(x, y + 1, z) === id) return true;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (w.getBlock(x + dx, y, z + dz) === id) return true;
    }
    return false;
  }

  /* 水流方向（用于推实体/掉落物） */
  directionAt(x, y, z) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    if (!this.liquidInfo(id)) return null;
    const my = this.strength(x, y, z);
    let vx = 0, vz = 0;
    if (w.getBlock(x, y + 1, z) === id && !this.isSource(x, y, z)) return { x: 0, y: -1, z: 0 };
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = w.getBlock(x + dx, y, z + dz);
      const s = n === id ? this.strength(x + dx, y, z + dz) : (this.canFlowInto(x + dx, y, z + dz, id) ? my + 1 : -1);
      if (s < 0) continue;
      const push = s - my;           // 水流向液面更“远”的方向（也就是流出去的方向）
      if (push > 0) { vx += dx * push; vz += dz * push; }
    }
    const len = Math.hypot(vx, vz);
    if (len < 0.001) return null;
    return { x: vx / len, y: 0, z: vz / len };
  }
  /* 某坐标是否被水/岩浆占据 */
  liquidAt(x, y, z) {
    const id = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    return this.liquidInfo(id) ? id : 0;
  }
}
