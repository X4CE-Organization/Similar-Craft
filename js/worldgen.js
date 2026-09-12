/* ============================================================
   世界生成：大陆/丘陵/山脉、生物群系、洞穴、矿脉、树木与植被
   ============================================================ */

const BIOME = { PLAINS: 0, FOREST: 1, DESERT: 2, SNOW: 3, MOUNTAIN: 4, OCEAN: 5, BEACH: 6, SAVANNA: 7, NETHER_WASTES: 8, SOUL_SAND_VALLEY: 9, THE_END: 10 };

/* 维度配置 */
const DIMENSIONS = {
  overworld: {
    name: '主世界', cn: '主世界', skyMode: 'column', skyLight: 15, hasSun: true, ambient: 0.055,
    fog: [0.5, 0.7, 1.0], fogScale: 1, weather: true, worldHeight: WORLD_H,
    passive: ['pig', 'cow', 'sheep', 'chicken'],
    hostile: ['zombie', 'skeleton', 'creeper', 'spider', 'enderman'],
    rainHostile: ['zombie', 'skeleton'],
  },
  nether: {
    name: '下界', cn: '下界', skyMode: 'uniform', skyLight: 8, hasSun: false, ambient: 0.11,
    fog: [0.34, 0.07, 0.05], fogScale: 0.8, weather: false, worldHeight: WORLD_H,
    passive: [], hostile: ['zombie_pigman', 'blaze', 'ghast', 'magma_cube'], rainHostile: [],
    lavaLevel: 32, bedrockTop: 92, noWater: true,
  },
  end: {
    name: '末地', cn: '末地', skyMode: 'uniform', skyLight: 4, hasSun: false, ambient: 0.14,
    fog: [0.10, 0.07, 0.16], fogScale: 0.75, weather: false, worldHeight: WORLD_H,
    passive: [], hostile: ['enderman'], rainHostile: [], noWater: true, voidBelow: 8,
  },
};

class WorldGen {
  constructor(seed, type) {
    this.seed = seed >>> 0;
    this.type = type || 'overworld';
    this.cfg = DIMENSIONS[this.type] || DIMENSIONS.overworld;
    this.nCont = new Noise(this.seed + 1);
    this.nHill = new Noise(this.seed + 2);
    this.nTemp = new Noise(this.seed + 3);
    this.nHumid = new Noise(this.seed + 4);
    this.nCave = new Noise(this.seed + 5);
    this.nCave2 = new Noise(this.seed + 6);
    this.nOre = new Noise(this.seed + 7);
    this.nDetail = new Noise(this.seed + 8);
    this.nTree = new Noise(this.seed + 9);
    this.nNether = new Noise(this.seed + 31);
    this.nNether2 = new Noise(this.seed + 32);
    this.nEnd = new Noise(this.seed + 41);
    this.nEnd2 = new Noise(this.seed + 42);
    this.nStructure = new Noise(this.seed + 51);
    this.frameEyePositions = [];    // 要塞里已经嵌好末影之眼的框架（生成后写入方块状态）
    this.lootChests = [];           // 末地城宝箱（生成后写入战利品）
    this.shulkerSpawns = [];        // 末地城里的潜影贝生成点
  }

  heightAt(x, z, biome) {
    const cont = this.nCont.fbm2(x / 900, z / 900, 4);
    const hills = this.nHill.fbm2(x / 230, z / 230, 4);
    const ridgeN = this.nHill.fbm2(x / 620 + 40, z / 620 - 30, 3);
    let ridge = clamp((ridgeN - 0.18) * 3.2, 0, 1);
    const detail = this.nDetail.fbm2(x / 55, z / 55, 3);
    let h = SEA_LEVEL + 1.5 + cont * 15 + hills * (3 + ridge * 30) + detail * 2.2;
    if (biome === BIOME.MOUNTAIN) h += 8 + ridge * 14;
    if (biome === BIOME.OCEAN) h = SEA_LEVEL - 6 - Math.abs(cont) * 8 - Math.abs(hills) * 3;
    if (biome === BIOME.DESERT) h = SEA_LEVEL + 3 + hills * 5 + detail * 1.5;
    if (biome === BIOME.PLAINS || biome === BIOME.FOREST) h = SEA_LEVEL + 3.5 + hills * 4.5 + detail * 1.5;
    if (biome === BIOME.BEACH) h = SEA_LEVEL + 1 + detail * 1.2;
    if (biome === BIOME.SNOW) h = SEA_LEVEL + 4 + hills * 6 + detail * 2;
    if (biome === BIOME.SAVANNA) h = SEA_LEVEL + 4 + hills * 4 + detail * 1.4;
    return clamp(Math.round(h), 3, WORLD_H - 14);
  }

  biomeAt(x, z) {
    const temp = this.nTemp.fbm2(x / 1400, z / 1400, 3);
    const humid = this.nHumid.fbm2(x / 950 + 500, z / 950, 3);
    const cont = this.nCont.fbm2(x / 900, z / 900, 3);
    const ridgeN = this.nHill.fbm2(x / 620 + 40, z / 620 - 30, 3);
    if (cont < -0.32) return BIOME.OCEAN;
    if (cont < -0.22) return BIOME.BEACH;
    if (ridgeN > 0.42 && temp < 0.2) return BIOME.MOUNTAIN;
    if (temp < -0.34) return BIOME.SNOW;
    if (temp > 0.34 && humid < 0.02) return BIOME.DESERT;
    if (temp > 0.22 && humid < 0.14) return BIOME.SAVANNA;
    if (humid > 0.2) return BIOME.FOREST;
    return BIOME.PLAINS;
  }

  topBlocks(biome) {
    switch (biome) {
      case BIOME.DESERT: return { top: B.sand, sub: B.sand, deep: B.sandstone };
      case BIOME.BEACH: return { top: B.sand, sub: B.sand, deep: B.sandstone };
      case BIOME.SNOW: return { top: B.snow_grass, sub: B.dirt, deep: B.stone };
      case BIOME.MOUNTAIN: return { top: B.grass_block, sub: B.dirt, deep: B.stone };
      case BIOME.OCEAN: return { top: B.sand, sub: B.sand, deep: B.stone };
      default: return { top: B.grass_block, sub: B.dirt, deep: B.stone };
    }
  }

  /* ---------- 生成一个区块 ---------- */
  generate(chunk) {
    if (this.type === 'nether') return this.generateNether(chunk);
    if (this.type === 'end') return this.generateEnd(chunk);
    return this.generateOverworld(chunk);
  }
  generateOverworld(chunk) {
    const blocks = chunk.blocks;
    blocks.fill(0);
    const bx = chunk.x * CHUNK_W, bz = chunk.z * CHUNK_W;
    let maxY = 0, minY = WORLD_H;

    for (let lz = 0; lz < CHUNK_W; lz++) {
      for (let lx = 0; lx < CHUNK_W; lx++) {
        const wx = bx + lx, wz = bz + lz;
        const biome = this.biomeAt(wx, wz);
        const h = this.heightAt(wx, wz, biome);
        const ci = lz * CHUNK_W + lx;
        chunk.biome[ci] = biome;
        chunk.heightmap[ci] = h;
        const tb = this.topBlocks(biome);
        for (let y = 0; y < WORLD_H; y++) {
          let id = 0;
          if (y <= 1 + (hash3(wx, y, wz, this.seed + 11) < 0.55 ? 1 : 0)) id = B.bedrock;
          else if (y > h) id = (y <= SEA_LEVEL ? B.water : 0);
          else if (y === h) id = tb.top;
          else if (y > h - 4) id = tb.sub;
          else id = tb.deep;
          if (id) {
            blocks[(y * CHUNK_W + lz) * CHUNK_W + lx] = id;
            if (y > maxY) maxY = y;
            if (y < minY) minY = y;
          }
        }
      }
    }

    this.carveCaves(chunk, minY, maxY);
    this.genOres(chunk, bx, bz);
    this.decorate(chunk, bx, bz);
    this.stronghold(chunk, bx, bz);
    // 重新计算 min/max
    maxY = 0; minY = WORLD_H;
    for (let y = 0; y < WORLD_H; y++) {
      const o = y * CHUNK_W * CHUNK_W;
      for (let i = 0; i < CHUNK_W * CHUNK_W; i++) if (blocks[o + i]) { if (y > maxY) maxY = y; if (y < minY) minY = y; }
    }
    chunk.minY = Math.max(0, minY - 1);
    chunk.maxY = Math.min(WORLD_H - 1, maxY + 1);
  }

  carveCaves(chunk, minY, maxY) {
    const blocks = chunk.blocks;
    const bx = chunk.x * CHUNK_W, bz = chunk.z * CHUNK_W;
    const yTop = Math.min(maxY, 62);
    for (let lz = 0; lz < CHUNK_W; lz++) {
      for (let lx = 0; lx < CHUNK_W; lx++) {
        const wx = bx + lx, wz = bz + lz;
        for (let y = 3; y <= yTop; y++) {
          const i = (y * CHUNK_W + lz) * CHUNK_W + lx;
          const cur = blocks[i];
          if (cur !== B.stone && cur !== B.dirt && cur !== B.sand && cur !== B.sandstone && cur !== B.gravel && cur !== B.grass_block) continue;
          const c1 = this.nCave.perlin3(wx * 0.038, y * 0.075, wz * 0.038);
          const c2 = this.nCave2.perlin3(wx * 0.02 + 100, y * 0.05, wz * 0.02 - 100);
          const worm = Math.abs(c1) < 0.075 || (Math.abs(c2) < 0.05 && y < 34);
          const open = this.nCave.fbm3(wx * 0.012, y * 0.02, wz * 0.012, 2) > 0.34 && y < 30;
          if (worm || open) {
            blocks[i] = (y <= 8 && hash3(wx, y, wz, this.seed + 21) < 0.6) ? B.lava : 0;
          }
        }
      }
    }
  }

  genOres(chunk, bx, bz) {
    const blocks = chunk.blocks;
    const oreAt = (x, y, z, salt) => this.nOre.perlin3((x + salt) * 0.11, (y + salt * 0.3) * 0.13, (z + salt) * 0.11);
    for (let lz = 0; lz < CHUNK_W; lz++) {
      for (let lx = 0; lx < CHUNK_W; lx++) {
        const wx = bx + lx, wz = bz + lz;
        for (let y = 2; y <= Math.min(chunk.heightmap[lz * CHUNK_W + lx] - 1, 64); y++) {
          const i = (y * CHUNK_W + lz) * CHUNK_W + lx;
          if (blocks[i] !== B.stone) continue;
          let ore = 0;
          if (y >= 5 && y <= 62 && oreAt(wx, y, wz, 0) > 0.62) ore = B.coal_ore;
          else if (y >= 3 && y <= 46 && oreAt(wx, y, wz, 400) > 0.68) ore = B.iron_ore;
          else if (y >= 3 && y <= 28 && oreAt(wx, y, wz, 900) > 0.74) ore = B.gold_ore;
          else if (y >= 3 && y <= 22 && oreAt(wx, y, wz, 1400) > 0.75) ore = B.redstone_ore;
          else if (y >= 2 && y <= 14 && oreAt(wx, y, wz, 1900) > 0.78) ore = B.diamond_ore;
          else if (y >= 6 && y <= 30 && chunk.biome[lz * CHUNK_W + lx] === BIOME.MOUNTAIN && oreAt(wx, y, wz, 2400) > 0.76) ore = B.emerald_ore;
          if (ore) blocks[i] = ore;
        }
      }
    }
    // 砂砾/泥土/粘土小矿脉
    for (let lz = 0; lz < CHUNK_W; lz++) for (let lx = 0; lx < CHUNK_W; lx++) {
      const wx = bx + lx, wz = bz + lz;
      for (let y = 4; y < 50; y++) {
        const i = (y * CHUNK_W + lz) * CHUNK_W + lx;
        if (blocks[i] !== B.stone) continue;
        const v = hash3(wx, y * 3, wz, this.seed + 33);
        if (v > 0.9955) blocks[i] = B.gravel;
        else if (v > 0.9935) blocks[i] = B.dirt;
        else if (v > 0.9925 && y < SEA_LEVEL) blocks[i] = B.clay;
      }
    }
  }

  /* 仅在区块范围内写入（保证树跨区块时两侧生成一致） */
  setLocal(chunk, wx, wy, wz, id, onlyAir) {
    if (wy < 0 || wy >= WORLD_H) return;
    const lx = wx - chunk.x * CHUNK_W, lz = wz - chunk.z * CHUNK_W;
    if (lx < 0 || lz < 0 || lx >= CHUNK_W || lz >= CHUNK_W) return;
    const i = (wy * CHUNK_W + lz) * CHUNK_W + lx;
    if (onlyAir && chunk.blocks[i] !== 0) return;
    chunk.blocks[i] = id;
  }

  decorate(chunk, bx, bz) {
    // ---- 树木：扫描扩展区域，只写本区块内的部分 ----
    for (let dz = -3; dz <= CHUNK_W + 3; dz++) {
      for (let dx = -3; dx <= CHUNK_W + 3; dx++) {
        const wx = bx + dx, wz = bz + dz;
        const biome = this.biomeAt(wx, wz);
        const h = this.groundHeightAt(wx, wz, biome);
        if (h <= SEA_LEVEL) continue;
        const surface = this.surfaceBlockAt(biome);
        if (surface !== B.grass_block && surface !== B.snow_grass && surface !== B.sand) continue;
        const r = hash3(wx, 0, wz, this.seed + 101);
        let density = 0;
        if (biome === BIOME.FOREST) density = 0.045;
        else if (biome === BIOME.PLAINS) density = 0.006;
        else if (biome === BIOME.SNOW) density = 0.02;
        else if (biome === BIOME.SAVANNA) density = 0.004;
        else if (biome === BIOME.MOUNTAIN) density = 0.008;
        else if (biome === BIOME.DESERT) density = 0.004;
        if (r < density) {
          const kind = this.treeKind(biome, wx, wz);
          this.buildTree(chunk, wx, h + 1, wz, kind, biome);
        } else if (biome === BIOME.DESERT && r < density + 0.01) {
          const ch2 = 2 + Math.floor(hash3(wx, 5, wz, this.seed + 55) * 2);
          for (let i = 0; i < ch2; i++) this.setLocal(chunk, wx, h + 1 + i, wz, B.cactus, true);
        }
      }
    }
    // ---- 花草 & 雪 ----
    for (let lz = 0; lz < CHUNK_W; lz++) {
      for (let lx = 0; lx < CHUNK_W; lx++) {
        const wx = bx + lx, wz = bz + lz;
        const biome = chunk.biome[lz * CHUNK_W + lx];
        const h = chunk.heightmap[lz * CHUNK_W + lx];
        const ground = chunk.blocks[(h * CHUNK_W + lz) * CHUNK_W + lx];
        if (h + 1 >= WORLD_H) continue;
        if (ground === B.grass_block || ground === B.snow_grass) {
          const r = hash3(wx, 7, wz, this.seed + 202);
          if (biome === BIOME.DESERT) {
            if (r < 0.012) this.setLocal(chunk, wx, h + 1, wz, B.dead_bush, true);
          } else if (r < 0.16) {
            this.setLocal(chunk, wx, h + 1, wz, B.tall_grass, true);
          } else if (r < 0.175) {
            this.setLocal(chunk, wx, h + 1, wz, r < 0.168 ? B.flower_yellow : B.flower_red, true);
          }
        } else if (ground === B.sand && biome === BIOME.DESERT) {
          const r = hash3(wx, 8, wz, this.seed + 303);
          if (r < 0.01) this.setLocal(chunk, wx, h + 1, wz, B.dead_bush, true);
        }
        // 寒冷地区水面结冰
        if (biome === BIOME.SNOW) {
          const waterY = SEA_LEVEL;
          const wi = (waterY * CHUNK_W + lz) * CHUNK_W + lx;
          if (chunk.blocks[wi] === B.water && chunk.heightmap[lz * CHUNK_W + lx] < SEA_LEVEL) chunk.blocks[wi] = B.ice;
        }
      }
    }
  }

  surfaceBlockAt(biome) { return this.topBlocks(biome).top; }

  // 地形表面（不含水/植被）
  groundHeightAt(x, z, biome) {
    const h = this.heightAt(x, z, biome);
    return h;
  }

  treeKind(biome, x, z) {
    const r = hash3(x, 3, z, this.seed + 77);
    if (biome === BIOME.SNOW) return 'spruce';
    if (biome === BIOME.FOREST) return r < 0.28 ? 'birch' : 'oak';
    if (biome === BIOME.MOUNTAIN) return r < 0.7 ? 'spruce' : 'oak';
    if (biome === BIOME.SAVANNA) return 'acacia';
    return r < 0.12 ? 'birch' : 'oak';
  }

  buildTree(chunk, x, y, z, kind, biome) {
    const rnd = makeRng(hashStr(kind + x + ':' + z + ':' + this.seed));
    const logId = kind === 'birch' ? B.birch_log : kind === 'spruce' ? B.spruce_log : B.oak_log;
    const leafId = kind === 'birch' ? B.birch_leaves : kind === 'spruce' ? B.spruce_leaves : B.oak_leaves;
    if (kind === 'spruce') {
      const th = 6 + Math.floor(rnd() * 5);
      for (let i = 0; i < th; i++) this.setLocal(chunk, x, y + i, z, logId, false);
      let radius = 2, layer = 0;
      for (let i = th - 1; i >= 2; i--) {
        const r = (i % 2 === 0) ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
          if (dx === 0 && dz === 0) continue;
          this.setLocal(chunk, x + dx, y + i, z + dz, leafId, true);
        }
        layer++;
      }
      this.setLocal(chunk, x, y + th, z, leafId, true);
      this.setLocal(chunk, x, y + th + 1, z, leafId, true);
      return;
    }
    if (kind === 'acacia') {
      const th = 4 + Math.floor(rnd() * 2);
      for (let i = 0; i < th; i++) this.setLocal(chunk, x, y + i, z, logId, false);
      for (let i = 0; i < 3; i++) this.setLocal(chunk, x + 1 + i, y + th - 1 + (i > 0 ? 1 : 0), z, logId, false);
      for (let dx = -2; dx <= 5; dx++) for (let dz = -3; dz <= 2; dz++) {
        if (Math.abs(dx - 1) + Math.abs(dz) > 4) continue;
        if (dx === 0 && dz === 0) continue;
        this.setLocal(chunk, x + dx, y + th + 2, z + dz, leafId, true);
        if (Math.abs(dx - 1) + Math.abs(dz) < 3) this.setLocal(chunk, x + dx, y + th + 3, z + dz, leafId, true);
      }
      return;
    }
    const tall = kind === 'birch';
    const th = (tall ? 6 : 4) + Math.floor(rnd() * (tall ? 3 : 3));
    for (let i = 0; i < th; i++) this.setLocal(chunk, x, y + i, z, logId, false);
    const top = y + th;
    for (let dy = -2; dy <= 1; dy++) {
      const r = dy <= -1 ? 2 : (dy === 0 ? 2 : 1);
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        const d = Math.abs(dx) + Math.abs(dz) + Math.abs(dy);
        if (d > r + r - (dy > 0 ? 1 : 0)) continue;
        if (dx === 0 && dz === 0 && dy <= 0) continue;
        this.setLocal(chunk, x + dx, top + dy, z + dz, leafId, true);
      }
    }
    this.setLocal(chunk, x, top + 1, z, leafId, true);
    this.setLocal(chunk, x + 1, top, z, leafId, true);
    this.setLocal(chunk, x - 1, top, z, leafId, true);
    this.setLocal(chunk, x, top, z + 1, leafId, true);
    this.setLocal(chunk, x, top, z - 1, leafId, true);
  }

  /* 找出生点：海平面以上、非水、非沙漠也行 */
  findSpawn() {
    if (this.type === 'nether') return { x: 0.5, y: 46, z: 0.5, biome: BIOME.NETHER_WASTES };
    if (this.type === 'end') return { x: 100.5, y: 50, z: 0.5, biome: BIOME.THE_END };
    for (let r = 0; r < 200; r += 4) {
      for (let a = 0; a < 12; a++) {
        const ang = a / 12 * TAU;
        const x = Math.round(Math.cos(ang) * r), z = Math.round(Math.sin(ang) * r);
        const biome = this.biomeAt(x, z);
        if (biome === BIOME.OCEAN || biome === BIOME.BEACH) continue;
        const h = this.heightAt(x, z, biome);
        if (h > SEA_LEVEL + 1) return { x: x + 0.5, y: h + 1.2, z: z + 0.5, biome };
      }
    }
    return { x: 0.5, y: SEA_LEVEL + 6, z: 0.5, biome: BIOME.PLAINS };
  }

  /* ============================================================
     下界：洞穴地形 + 岩浆海(y32) + 荧石簇 + 灵魂沙 + 石英 + 要塞
     ============================================================ */
  generateNether(chunk) {
    const blocks = chunk.blocks;
    const bx = chunk.x * CHUNK_W, bz = chunk.z * CHUNK_W;
    const lavaLevel = this.cfg.lavaLevel || 32;
    for (let lz = 0; lz < CHUNK_W; lz++) {
      for (let lx = 0; lx < CHUNK_W; lx++) {
        const wx = bx + lx, wz = bz + lz;
        const biome = this.nNether2.fbm2(wx / 700, wz / 700, 2) > 0.22 ? BIOME.SOUL_SAND_VALLEY : BIOME.NETHER_WASTES;
        chunk.biome[lz * CHUNK_W + lx] = biome;
        let surface = 4;
        for (let y = 0; y < WORLD_H; y++) {
          let id = 0;
          if (y <= 3) id = B.bedrock;
          else if (y >= this.cfg.bedrockTop) id = (y >= this.cfg.bedrockTop + 2 || hash3(wx, y, wz, this.seed + 71) < 0.6) ? B.bedrock : 0;
          else {
            const cave = this.nNether.fbm3(wx * 0.017, y * 0.028, wz * 0.017, 3);
            const bias = (y - 34) / 70;
            // 下界是巨大的洞穴世界：低处开阔（岩浆海），高处逐渐收窄，顶部再挖空一层
            const open = cave > -0.10 + bias * 0.55 || y > 74 - this.nNether.perlin2(wx * 0.02, wz * 0.02) * 26;
            if (open) id = (y <= lavaLevel) ? B.lava : 0;
            else id = B.netherrack;
          }
          if (id) {
            blocks[(y * CHUNK_W + lz) * CHUNK_W + lx] = id;
            if (id !== B.lava && id !== B.bedrock) surface = Math.max(surface, y);
          }
        }
        chunk.heightmap[lz * CHUNK_W + lx] = surface;
      }
    }
    // 岩浆湖岸的砂砾 / 灵魂沙
    for (let lz = 0; lz < CHUNK_W; lz++) for (let lx = 0; lx < CHUNK_W; lx++) {
      const wx = bx + lx, wz = bz + lz, biome = chunk.biome[lz * CHUNK_W + lx];
      for (let y = 4; y < lavaLevel + 6; y++) {
        const i = (y * CHUNK_W + lz) * CHUNK_W + lx;
        if (blocks[i] !== B.netherrack) continue;
        const below = y > 0 ? blocks[((y - 1) * CHUNK_W + lz) * CHUNK_W + lx] : 0;
        if (below === B.lava && hash3(wx, y, wz, this.seed + 77) < 0.45) {
          blocks[i] = biome === BIOME.SOUL_SAND_VALLEY ? B.soul_sand : (hash3(wx, y + 1, wz, this.seed + 78) < 0.5 ? B.gravel : B.soul_sand);
        }
      }
    }
    this.netherOres(chunk, bx, bz);
    this.netherGlowstone(chunk, bx, bz);
    this.netherFortress(chunk, bx, bz);
    this.recomputeBounds(chunk);
  }

  netherOres(chunk, bx, bz) {
    const blocks = chunk.blocks;
    for (let lz = 0; lz < CHUNK_W; lz++) for (let lx = 0; lx < CHUNK_W; lx++) {
      const wx = bx + lx, wz = bz + lz;
      for (let y = 4; y < this.cfg.bedrockTop; y++) {
        const i = (y * CHUNK_W + lz) * CHUNK_W + lx;
        if (blocks[i] !== B.netherrack) continue;
        const q = this.nNether2.perlin3(wx * 0.12, y * 0.12, wz * 0.12);
        if (q > 0.72) blocks[i] = B.nether_quartz_ore;
        else if (q < -0.8) blocks[i] = B.magma_block;
        else if (hash3(wx, y, wz, this.seed + 93) > 0.9975) blocks[i] = B.glowstone;
      }
    }
  }
  netherGlowstone(chunk, bx, bz) {
    const blocks = chunk.blocks;
    for (let lz = 0; lz < CHUNK_W; lz++) for (let lx = 0; lx < CHUNK_W; lx++) {
      const wx = bx + lx, wz = bz + lz;
      if (hash3(wx, 3, wz, this.seed + 17) < 0.982) continue;
      const baseY = this.cfg.bedrockTop - 2 - Math.floor(hash3(wx, 5, wz, this.seed + 19) * 10);
      for (let y = baseY; y > baseY - 2 - Math.floor(hash3(wx, 6, wz, this.seed + 21) * 3); y--) {
        if (y < 5) break;
        const i = (y * CHUNK_W + lz) * CHUNK_W + lx;
        if (blocks[i] === 0) blocks[i] = B.glowstone; else break;
      }
    }
  }
  /* 下界要塞：横跨岩浆海的下界砖长桥 + 塔楼（烈焰人出没） */
  netherFortress(chunk, bx, bz) {
    const zone = Math.floor(bz / 512);
    const fz = zone * 512 + 128 + Math.floor(hash3(0, 0, zone, this.seed + 61) * 256);
    if (Math.abs(fz - bz) > 640) return;
    for (let wx = bx - 2; wx < bx + CHUNK_W + 2; wx++) {
      for (let wz = bz - 2; wz < bz + CHUNK_W + 2; wz++) {
        const dz = Math.abs(wz - fz);
        if (dz > 4) continue;
        const yBase = 40 + Math.round(this.nNether.perlin2(wx * 0.01, zone) * 4);
        for (let y = yBase; y <= yBase + 1; y++) this.setLocal(chunk, wx, y, wz, B.nether_bricks, false);
        if (dz === 4) for (let y = yBase + 2; y <= yBase + 3; y++) this.setLocal(chunk, wx, y, wz, B.nether_bricks, false);
        if (wx % 13 === 0 && (dz === 3 || dz === 2)) for (let y = yBase; y > 20; y--) this.setLocal(chunk, wx, y, wz, B.nether_bricks, false);
        // 塔楼
        const tx = Math.floor(wx / 32) * 32 + 16;
        if (Math.abs(wx - tx) <= 3 && dz <= 3) {
          for (let y = yBase; y <= yBase + 8; y++) {
            const edge = Math.max(Math.abs(wx - tx), dz);
            if (edge === 3) this.setLocal(chunk, wx, y, wz, B.nether_bricks, false);
            else if (y === yBase || y === yBase + 8) this.setLocal(chunk, wx, y, wz, B.nether_bricks, false);
            else this.setLocal(chunk, wx, y, wz, 0, false);
          }
          if (wx === tx && dz === 0) {
            this.setLocal(chunk, wx, yBase + 4, wz, B.glowstone, true);
            this.setLocal(chunk, wx, yBase + 9, wz, B.nether_bricks, true);
          }
        }
      }
    }
  }

  /* ============================================================
     末地：主岛 + 黑曜石柱 + 末地传送门 + 外围空岛
     ============================================================ */
  generateEnd(chunk) {
    const blocks = chunk.blocks;
    const bx = chunk.x * CHUNK_W, bz = chunk.z * CHUNK_W;
    for (let lz = 0; lz < CHUNK_W; lz++) {
      for (let lx = 0; lx < CHUNK_W; lx++) {
        const wx = bx + lx, wz = bz + lz;
        chunk.biome[lz * CHUNK_W + lx] = BIOME.THE_END;
        const island = this.endIslandAt(wx, wz);
        let surface = -1;
        if (island.exists) {
          surface = island.surface;
          const bottom = island.bottom;
          for (let y = bottom; y <= surface; y++) blocks[(y * CHUNK_W + lz) * CHUNK_W + lx] = B.end_stone;
          chunk.heightmap[lz * CHUNK_W + lx] = surface;
        } else {
          chunk.heightmap[lz * CHUNK_W + lx] = 0;
        }
      }
    }
    this.endPillars(chunk);
    this.endPortalRoom(chunk);
    this.endPlatform(chunk);
    this.endCities(chunk, bx, bz);
    this.recomputeBounds(chunk);
  }
  /* 末地主岛 / 外围空岛的地形函数（生成与末地城共用） */
  endIslandAt(wx, wz) {
    const r = Math.hypot(wx, wz);
    const edge = 92 + this.nEnd.fbm2(wx / 55, wz / 55, 3) * 22;
    const inner = 74 + this.nEnd.fbm2(wx / 40 + 10, wz / 40, 3) * 14;
    if (r < edge) {
      const k = r / edge;
      const surface = Math.round(48 - k * k * 12 + this.nEnd.fbm2(wx / 30, wz / 30, 3) * 3.5);
      const bottom = r < inner ? 2 : Math.max(4, surface - Math.round(26 * (1 - k)));
      return { exists: true, surface, bottom, main: true };
    }
    if (r > 300) {
      const isl = this.nEnd2.fbm2(wx / 220, wz / 220, 3);
      if (isl > 0.34) {
        const top = Math.round(46 + this.nEnd2.fbm2(wx / 45, wz / 45, 2) * 4);
        return { exists: true, surface: top, bottom: top - 12, main: false };
      }
    }
    return { exists: false, surface: 0, bottom: 0, main: false };
  }

  /* ============================================================
     末地城：外围空岛上的紫珀塔（含战利品箱与潜影贝）
     ============================================================ */
  endCities(chunk, bx, bz) {
    const REGION = 320;
    const rx0 = Math.floor((bx - 20) / REGION), rx1 = Math.floor((bx + CHUNK_W + 20) / REGION);
    const rz0 = Math.floor((bz - 20) / REGION), rz1 = Math.floor((bz + CHUNK_W + 20) / REGION);
    for (let rx = rx0; rx <= rx1; rx++) {
      for (let rz = rz0; rz <= rz1; rz++) {
        const h1 = hash3(rx, 11, rz, this.seed + 201);
        const h2 = hash3(rx, 12, rz, this.seed + 202);
        const h3 = hash3(rx, 13, rz, this.seed + 203);
        if (h3 > 0.55) continue;                       // 约一半区域有城，保持稀疏
        const ax = Math.round(rx * REGION + h1 * REGION);
        const az = Math.round(rz * REGION + h2 * REGION);
        if (Math.hypot(ax, az) < 300) continue;        // 主岛附近不生成
        const isl = this.endIslandAt(ax, az);
        if (!isl.exists || isl.main) continue;         // 只盖在外围空岛上
        if (bx + CHUNK_W < ax - 6 || bx > ax + 6 || bz + CHUNK_W < az - 6 || bz > az + 6) continue;
        this.buildEndCity(chunk, ax, az, isl.surface, rx, rz);
      }
    }
  }
  buildEndCity(chunk, ax, az, surface, rx, rz) {
    const set = (x, y, z, id) => this.setLocal(chunk, x, y, z, id, false);
    const clearTo = (x, y0, y1, z) => { for (let y = y0; y <= y1; y++) this.setLocal(chunk, x, y, z, 0, false); };
    const baseY = surface + 1;
    // 底座平台
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
      const e = Math.max(Math.abs(dx), Math.abs(dz));
      if (e <= 6) set(ax + dx, baseY - 1, az + dz, e === 6 ? B.end_stone_bricks : B.purpur_block);
      if (e === 6) for (let y = 0; y <= 3; y++) set(ax + dx, baseY + y, az + dz, e === 6 && (Math.abs(dx) === 6 && Math.abs(dz) === 6) ? B.purpur_pillar : B.purpur_block);
    }
    // 一层：9×9 房间（南面留门）
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      const e = Math.max(Math.abs(dx), Math.abs(dz));
      for (let y = 0; y <= 3; y++) {
        if (e === 4) {
          const door = dz === 4 && Math.abs(dx) <= 1 && y <= 2;
          if (!door) set(ax + dx, baseY + y, az + dz, e === 4 && Math.abs(dx) === 4 && Math.abs(dz) === 4 ? B.purpur_pillar : B.purpur_block);
        } else if (e <= 3 && y > 0) {
          this.setLocal(chunk, ax + dx, baseY + y, az + dz, 0, false);
        }
      }
    }
    // 二层：7×7
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const e = Math.max(Math.abs(dx), Math.abs(dz));
      for (let y = 4; y <= 7; y++) {
        if (e === 3) set(ax + dx, baseY + y, az + dz, Math.abs(dx) === 3 && Math.abs(dz) === 3 ? B.purpur_pillar : B.purpur_block);
        else if (e <= 2 && y > 4) this.setLocal(chunk, ax + dx, baseY + y, az + dz, 0, false);
      }
    }
    // 三层：5×5 宝藏室
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const e = Math.max(Math.abs(dx), Math.abs(dz));
      for (let y = 8; y <= 11; y++) {
        if (e === 2 || y === 11) set(ax + dx, baseY + y, az + dz, y === 11 ? B.end_stone_bricks : B.purpur_block);
        else this.setLocal(chunk, ax + dx, baseY + y, az + dz, 0, false);
      }
    }
    // 尖顶
    for (let y = 12; y <= 15; y++) {
      const r = 15 - y;
      for (let dx = -r + 1; dx <= r - 1; dx++) for (let dz = -r + 1; dz <= r - 1; dz++) set(ax + dx, baseY + y, az + dz, B.purpur_pillar);
    }
    // 末地烛 + 宝箱 + 潜影贝
    const rods = [[-4, 4], [4, 4], [-4, -4], [4, -4]];
    for (const [dx, dz] of rods) set(ax + dx, baseY + 4, az + dz, B.end_rod);
    set(ax - 1, baseY + 9, az - 1, B.chest);
    set(ax + 1, baseY + 9, az + 1, B.chest);
    this.lootChests.push({ x: ax - 1, y: baseY + 9, z: az - 1, tier: 2 });
    this.lootChests.push({ x: ax + 1, y: baseY + 9, z: az + 1, tier: 1 });
    this.shulkerSpawns.push({ x: ax + 0.5, y: baseY + 1.5, z: az + 0.5 });
    this.shulkerSpawns.push({ x: ax - 2.5, y: baseY + 5.5, z: az + 2.5 });
    this.shulkerSpawns.push({ x: ax + 2.5, y: baseY + 9.5, z: az - 2.5 });
  }
  endPillars(chunk) {
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU;
      const px = Math.round(Math.cos(a) * 42), pz = Math.round(Math.sin(a) * 42);
      const top = 66 + Math.floor(hash3(i, 1, 0, this.seed + 3) * 12);
      for (let dwx = -3; dwx <= 3; dwx++) for (let dwz = -3; dwz <= 3; dwz++) {
        if (Math.hypot(dwx, dwz) > 2.7) continue;
        const wx = px + dwx, wz = pz + dwz;
        for (let y = 6; y <= top; y++) this.setLocal(chunk, wx, y, wz, B.obsidian, false);
        this.setLocal(chunk, wx, top + 1, wz, B.bedrock, false);
      }
    }
  }
  endPortalRoom(chunk) {
    const y = 64;
    // 末地返回传送门结构：基岩环 + 3×3 空腔（击败末影龙后才会出现传送门方块）
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const edge = Math.max(Math.abs(dx), Math.abs(dz));
      if (edge === 2) this.setLocal(chunk, dx, y - 1, dz, B.bedrock, false);
    }
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) <= 1) for (let dy = 0; dy <= 2; dy++) this.setLocal(chunk, dx, y + dy, dz, 0, false);
    }
  }
  endPlatform(chunk) {
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      this.setLocal(chunk, 100 + dx, 48, dz, B.obsidian, false);
      for (let dy = 0; dy <= 3; dy++) this.setLocal(chunk, 100 + dx, 49 + dy, dz, 0, false);
    }
  }
  recomputeBounds(chunk) {
    const blocks = chunk.blocks;
    let maxY = 0, minY = WORLD_H;
    for (let y = 0; y < WORLD_H; y++) {
      const o = y * CHUNK_W * CHUNK_W;
      for (let i = 0; i < CHUNK_W * CHUNK_W; i++) if (blocks[o + i]) { if (y > maxY) maxY = y; if (y < minY) minY = y; }
    }
    chunk.minY = Math.max(0, minY - 1);
    chunk.maxY = Math.min(WORLD_H - 1, maxY + 1);
  }

  /* ============================================================
     主世界要塞：地下末地传送门房间（12 个框架，部分已嵌末影之眼）
     固定在 (-176, 24, 144) 附近，可用末影之眼找到
     ============================================================ */
  stronghold(chunk, bx, bz) {
    const CX = -176, CZ = 144, Y = 24;
    const R = 13;      // 房间半径
    if (bx + CHUNK_W < CX - R || bx > CX + R || bz + CHUNK_W < CZ - R || bz > CZ + R) return;
    const surface = this.heightAt(CX, CZ, this.biomeAt(CX, CZ));
    // 房间：石头砖地板/天花板/墙
    for (let wx = CX - 11; wx <= CX + 11; wx++) {
      for (let wz = CZ - 11; wz <= CZ + 11; wz++) {
        if (Math.max(Math.abs(wx - CX), Math.abs(wz - CZ)) > 11) continue;
        const edge = Math.max(Math.abs(wx - CX), Math.abs(wz - CZ)) >= 10;
        for (let wy = Y; wy <= Y + 7; wy++) {
          if (wy === Y || wy === Y + 7) this.setLocal(chunk, wx, wy, wz, B.stone_brick, false);
          else if (edge) this.setLocal(chunk, wx, wy, wz, B.stone_brick, false);
          else this.setLocal(chunk, wx, wy, wz, 0, false);
        }
        // 房间下方的实心层，避免掉进洞穴
        for (let wy = Y - 4; wy < Y; wy++) this.setLocal(chunk, wx, wy, wz, B.stone, false);
      }
    }
    // 末地传送门框架：3×3 环，随机嵌入若干末影之眼
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const edge = Math.max(Math.abs(dx), Math.abs(dz));
      const wx = CX + dx, wz = CZ + dz;
      if (edge === 1) {
        this.setLocal(chunk, wx, Y + 1, wz, B.end_portal_frame, false);
        if (hash3(wx, 1, wz, this.seed + 131) < 0.42) this.frameEyePositions.push(posKey(wx, Y + 1, wz));
      } else {
        for (let dy = 0; dy <= 1; dy++) this.setLocal(chunk, wx, Y + 1 + dy, wz, 0, false);
      }
    }
    // 通往地表的一格竖井 + 地表标记
    if (surface > Y + 8) {
      for (let wy = Y + 8; wy <= surface; wy++) {
        this.setLocal(chunk, CX, wy, CZ, 0, false);
        this.setLocal(chunk, CX + 1, wy, CZ, wy % 12 === 0 ? B.torch : 0, false);
      }
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        const e = Math.max(Math.abs(dx), Math.abs(dz));
        if (e === 2) this.setLocal(chunk, CX + dx, surface, CZ + dz, B.stone_brick, false);
        else this.setLocal(chunk, CX + dx, surface, CZ + dz, 0, false);
      }
    }
  }
}
