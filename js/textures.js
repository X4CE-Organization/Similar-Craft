/* ============================================================
   程序化材质：16×16 像素贴图集 + 物品图标（全部代码绘制，无需素材）
   ============================================================ */

const T = {};                 // 贴图名 -> 图集索引
const TILE_FNS = [];          // 图集索引 -> 绘制函数
const ATLAS_COLS = 16, TILE_PX = 16, ATLAS_PX = ATLAS_COLS * TILE_PX;

function tex(name, fn) {
  const i = TILE_FNS.length;
  T[name] = i;                 // 小写别名
  T[name.toUpperCase()] = i;   // 大写常量（方块定义里使用）
  TILE_FNS.push(fn);
}

/* ---------- 绘图辅助 ---------- */
function rgba(hex, a) { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }

class P {
  constructor(ctx, ox, oy, rng) { this.c = ctx; this.ox = ox; this.oy = oy; this.rng = rng; }
  set(x, y, col) { if (x < 0 || y < 0 || x > 15 || y > 15) return; this.c.fillStyle = col; this.c.fillRect(this.ox + x, this.oy + y, 1, 1); }
  rect(x, y, w, h, col) { this.c.fillStyle = col; this.c.fillRect(this.ox + x, this.oy + y, w, h); }
  fill(col) { this.rect(0, 0, 16, 16, col); }
  rnd(a, b) { return a + this.rng() * (b - a); }
  // 颗粒噪点
  grain(colors, density = 0.32, x0 = 0, y0 = 0, w = 16, h = 16) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (this.rng() < density) this.set(x, y, colors[Math.floor(this.rng() * colors.length)]);
    }
  }
  blob(cx, cy, r, col) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r + this.rng() * 0.9) this.set(cx + x, cy + y, col);
    }
  }
  outline(col) { this.rect(0, 0, 16, 1, col); this.rect(0, 15, 16, 1, col); this.rect(0, 0, 1, 16, col); this.rect(15, 0, 1, 16, col); }
  frame(col, top = 0, left = 0, w = 16, h = 16) {
    this.rect(left, top, w, 1, col); this.rect(left, top + h - 1, w, 1, col);
    this.rect(left, top, 1, h, col); this.rect(left + w - 1, top, 1, h, col);
  }
}

/* ---------- 可复用的基础材质（配色参考 CC0 16x16 Block Texture Set） ---------- */
function paintStone(p) {
  p.fill('#565a55');
  p.grain(['#5d615b', '#4f534e', '#62665f', '#585c56'], 0.55);
  // 大块斑驳，避免纯噪点
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(p.rnd(0, 12)), y = Math.floor(p.rnd(0, 12));
    p.rect(x, y, 3 + Math.floor(p.rnd(0, 3)), 2 + Math.floor(p.rnd(0, 3)), p.rng() < 0.5 ? '#4a4e49' : '#61655e');
  }
  for (let i = 0; i < 8; i++) p.set(Math.floor(p.rnd(0, 16)), Math.floor(p.rnd(0, 16)), '#3f433e');
}
function paintDirt(p) {
  p.fill('#78563a');
  p.grain(['#6b4a31', '#86613f', '#5f402a', '#8f6a45'], 0.5);
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(p.rnd(0, 13)), y = Math.floor(p.rnd(0, 13));
    p.rect(x, y, 2 + Math.floor(p.rnd(0, 3)), 1 + Math.floor(p.rnd(0, 2)), '#5a3c26');
  }
}
function paintSand(p) {
  p.fill('#dbd3a0');
  p.grain(['#e6dfae', '#d0c793', '#efe8bd', '#c9bf8c'], 0.4);
  for (let i = 0; i < 10; i++) p.set(Math.floor(p.rnd(0, 16)), Math.floor(p.rnd(0, 16)), '#b9b07e');
}
function paintLogSide(p, bark = '#6b4a2a', barkLo = '#4f3620', barkHi = '#82603a') {
  p.fill(bark);
  // 竖向树皮沟壑
  let x = 0;
  while (x < 16) {
    const w = 1 + Math.floor(p.rnd(0, 3));
    const shadeCol = p.rng() < 0.45 ? barkLo : (p.rng() < 0.4 ? barkHi : bark);
    p.rect(x, 0, w, 16, shadeCol);
    if (p.rng() < 0.6) for (let y = Math.floor(p.rnd(0, 10)); y < 16; y++) p.set(x, y, barkLo);
    x += w;
  }
  p.grain([shade(bark, 0.9), shade(bark, 1.12)], 0.18);
  p.rect(0, 0, 16, 1, shade(bark, 0.82));
  p.rect(0, 15, 16, 1, shade(bark, 0.75));
}
function paintLogTop(p, ring = '#a8834f', inner = '#8a6a3c') {
  p.fill(inner);
  p.grain([shade(inner, 0.9), shade(inner, 1.1)], 0.35);
  for (let r = 7; r >= 1; r--) {
    const col = r % 2 ? ring : shade(ring, 0.82);
    for (let a = 0; a < 96; a++) {
      const t = (a / 96) * TAU;
      p.set(Math.round(7.5 + Math.cos(t) * r), Math.round(7.5 + Math.sin(t) * r), col);
    }
  }
  p.blob(7, 7, 1, shade(ring, 1.15));
}
function paintPlanks(p, base = '#9c7043') {
  p.fill(base);
  p.grain([shade(base, 0.92), shade(base, 1.08), shade(base, 0.97)], 0.28);
  // 横向木板 + 错开的竖缝
  for (let row = 0; row < 4; row++) {
    const y = row * 4;
    p.rect(0, y + 3, 16, 1, shade(base, 0.6));                 // 板缝
    const seam = (row % 2 === 0) ? 5 : 11;
    p.rect(seam, y, 1, 3, shade(base, 0.72));                  // 竖缝
    for (let i = 0; i < 7; i++) {                              // 木纹
      const gx = Math.floor(p.rnd(0, 14)), gy = y + Math.floor(p.rnd(0, 3));
      p.rect(gx, gy, 1 + Math.floor(p.rnd(0, 3)), 1, shade(base, p.rng() < 0.5 ? 0.86 : 1.1));
    }
    if (row === 1) { p.set(12, y + 1, shade(base, 0.7)); p.set(13, y + 1, shade(base, 0.75)); }   // 木节
  }
  p.outline(shade(base, 0.7));
}
function paintLeaves(p, base = '#c0c0c0', holes = true) {
  p.fill(base);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const r = p.rng();
    if (r < 0.26) p.set(x, y, shade(base, 0.8));
    else if (r < 0.46) p.set(x, y, shade(base, 1.14));
    else if (r < 0.54) p.set(x, y, shade(base, 1.3));
  }
  if (holes) {
    for (let i = 0; i < 14; i++) {
      p.set(Math.floor(p.rnd(0, 16)), Math.floor(p.rnd(0, 16)), 'rgba(0,0,0,0)');
    }
  }
}
function paintCobble(p, base = '#868a85', mortar = '#4a4d4a') {
  p.fill(mortar);
  const stones = [[0, 0, 6, 4], [7, 0, 9, 5], [0, 5, 4, 4], [5, 6, 5, 4], [11, 6, 5, 4], [0, 10, 7, 6], [8, 11, 8, 5], [5, 0, 1, 5], [10, 10, 1, 1]];
  for (const [x, y, w, h] of stones) {
    p.rect(x, y, w, h, shade(base, p.rnd(0.9, 1.06)));
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      if (p.rng() < 0.45) p.set(x + xx, y + yy, shade(base, p.rnd(0.82, 1.12)));
    }
    if (w > 2) p.rect(x + 1, y + 1, Math.max(1, w - 2), 1, shade(base, 1.18));   // 顶部高光
    if (h > 2) p.rect(x, y + h - 1, w, 1, shade(base, 0.72));                    // 底部阴影
  }
}
function paintWool(p, base) {
  p.fill(base);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (p.rng() < 0.45) p.set(x, y, shade(base, p.rnd(0.88, 1.1)));
  for (let i = 0; i < 8; i++) { const x = Math.floor(p.rnd(1, 14)), y = Math.floor(p.rnd(1, 14)); p.rect(x, y, 2, 1, shade(base, 0.85)); }
}
function paintBrick(p, base = '#9a5140', mortar = '#b8aFa0') {
  p.fill(mortar);
  for (let row = 0; row < 4; row++) {
    const y = row * 4, off = row % 2 ? -4 : 0;
    for (let bx = off; bx < 16; bx += 8) p.rect(bx + 1, y + 1, 6, 3, shade(base, p.rnd(0.9, 1.08)));
  }
  p.grain([shade(base, 0.85), shade(base, 1.1)], 0.12);
}
function paintOre(p, oreColor, oreDark, count = 5) {
  const spots = [[3, 3], [10, 4], [5, 10], [11, 11], [8, 7], [2, 8], [13, 2]];
  for (let i = 0; i < count; i++) {
    const [x, y] = spots[i % spots.length];
    p.blob(x, y, i % 3 === 0 ? 2 : 1, oreColor);
    p.set(x + 1, y + 1, oreDark);
    p.set(x - 1, y - 1, shade(oreColor, 1.25));
  }
}

/* ---------- 定义全部方块贴图 ---------- */
tex('grass_top', (p) => {
  p.fill('#cfcfcf');
  p.grain(['#c4c4c4', '#dadada', '#bbbbbb'], 0.45);
  for (let i = 0; i < 9; i++) {                        // 成块的草簇
    const x = Math.floor(p.rnd(0, 12)), y = Math.floor(p.rnd(0, 12));
    const col = p.rng() < 0.5 ? '#e2e2e2' : '#b4b4b4';
    p.rect(x, y, 2 + Math.floor(p.rnd(0, 3)), 1 + Math.floor(p.rnd(0, 3)), col);
  }
  for (let i = 0; i < 10; i++) p.set(Math.floor(p.rnd(0, 16)), Math.floor(p.rnd(0, 16)), '#a4a4a4');
});
tex('grass_side', (p) => {
  paintDirt(p);
  for (let x = 0; x < 16; x++) {
    const h = 3 + Math.floor(p.rnd(0, 3));                 // 3~5 像素高的草边
    for (let y = 0; y < h; y++) p.set(x, y, mixHex('#d8d8d8', '#bdbdbd', p.rng()));
    p.set(x, h, '#9e9e9e');                                // 交界深色
    if (p.rng() < 0.28) p.set(x, h + 1, '#b0b0b0');        // 垂下的草须
    p.set(x, 0, mixHex('#e2e2e2', '#c8c8c8', p.rng()));
  }
});
tex('dirt', paintDirt);
tex('stone', paintStone);
tex('cobble', (p) => paintCobble(p));
tex('mossy_cobble', (p) => { paintCobble(p, '#7e8a76', '#54604f'); p.grain(['#4d7a3a', '#5f9048', '#446b34'], 0.18); });
tex('sand', paintSand);
tex('sandstone_top', (p) => { paintSand(p); p.grain(['#cdc492'], 0.2); });
tex('sandstone_side', (p) => {
  paintSand(p);
  p.rect(0, 0, 16, 2, '#e7e0b6'); p.rect(0, 3, 16, 1, '#c3ba86');
  p.grain(['#c9c08d', '#e2dab0'], 0.25, 0, 4, 16, 12);
  for (let y = 5; y < 16; y += 5) p.rect(0, y, 16, 1, '#c8bf8c');
});
tex('gravel', (p) => {
  p.fill('#8b8b8b');
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(p.rnd(0, 16)), y = Math.floor(p.rnd(0, 16)), r = Math.floor(p.rnd(1, 3));
    p.blob(x, y, r, ['#9c9c9c', '#757575', '#a8a49b', '#666'][Math.floor(p.rng() * 4)]);
  }
});
tex('log_side', (p) => paintLogSide(p));
tex('log_top', (p) => paintLogTop(p));
tex('birch_log_side', (p) => {
  paintLogSide(p, '#dcd5c6', '#c3b9a5', '#efe9dd');
  for (let i = 0; i < 10; i++) { const x = Math.floor(p.rnd(0, 15)), y = Math.floor(p.rnd(0, 14)); p.rect(x, y, 2, 1, '#5b5340'); p.set(x + 2, y + 1, '#4b4436'); }
});
tex('birch_log_top', (p) => paintLogTop(p, '#d9d0bb', '#c2b696'));
tex('spruce_log_side', (p) => paintLogSide(p, '#4d3a22', '#3a2b18', '#5e482b'));
tex('spruce_log_top', (p) => paintLogTop(p, '#8d6a3f', '#6a4e2c'));
tex('planks', (p) => paintPlanks(p));
tex('birch_planks', (p) => paintPlanks(p, '#d7c99f'));
tex('spruce_planks', (p) => paintPlanks(p, '#7d5c34'));
tex('leaves', (p) => paintLeaves(p, '#c6c6c6'));
tex('birch_leaves', (p) => paintLeaves(p, '#dcdcdc'));
tex('spruce_leaves', (p) => paintLeaves(p, '#9e9e9e'));
tex('water', (p) => {
  p.fill(rgba('#3f76e4', 1));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = 0.5 + 0.5 * Math.sin(x * 0.7 + y * 0.5);
    p.set(x, y, rgba(mixHex('#3f76e4', '#5b93ff', n * 0.8), 0.86));
  }
});
tex('lava', (p) => {
  p.fill('#e2600f');
  p.grain(['#ff9d1f', '#ff7514', '#d24b09', '#ffc33c'], 0.75);
  for (let i = 0; i < 12; i++) p.blob(Math.floor(p.rnd(0, 16)), Math.floor(p.rnd(0, 16)), 1, '#ffe066');
});
tex('glass', (p) => {
  p.fill(rgba('#bfe6ff', 0.14));
  p.frame(rgba('#e8f7ff', 0.78));
  p.rect(3, 3, 4, 1, rgba('#ffffff', 0.5)); p.rect(3, 3, 1, 4, rgba('#ffffff', 0.35));
  p.set(11, 9, rgba('#ffffff', 0.4)); p.set(12, 10, rgba('#ffffff', 0.28));
});
tex('ice', (p) => {
  p.fill(rgba('#a8d8ff', 0.72));
  p.grain([rgba('#c8e8ff', 0.8), rgba('#8fc4f0', 0.75), rgba('#e0f4ff', 0.7)], 0.4);
  for (let i = 0; i < 5; i++) { const x = Math.floor(p.rnd(0, 13)), y = Math.floor(p.rnd(0, 13)); p.rect(x, y, Math.floor(p.rnd(2, 5)), 1, rgba('#ffffff', 0.45)); }
});
tex('coal_ore', (p) => { paintStone(p); paintOre(p, '#2b2b2b', '#141414', 5); });
tex('iron_ore', (p) => { paintStone(p); paintOre(p, '#d8a37c', '#a9714b', 5); });
tex('gold_ore', (p) => { paintStone(p); paintOre(p, '#f8d05a', '#c99a2a', 5); });
tex('diamond_ore', (p) => { paintStone(p); paintOre(p, '#5ff0e0', '#25b6ae', 5); });
tex('redstone_ore', (p) => { paintStone(p); paintOre(p, '#e02a2a', '#8f1414', 6); });
tex('emerald_ore', (p) => { paintStone(p); paintOre(p, '#3ee07a', '#159c4b', 4); });
tex('bedrock', (p) => {
  p.fill('#4a4a4a');
  for (let i = 0; i < 60; i++) p.blob(Math.floor(p.rnd(0, 16)), Math.floor(p.rnd(0, 16)), p.rng() < 0.3 ? 2 : 1, ['#2f2f2f', '#3a3a3a', '#5c5c5c', '#1f1f1f'][Math.floor(p.rng() * 4)]);
});
tex('snow', (p) => { p.fill('#f4fbff'); p.grain(['#e8f2fa', '#ffffff', '#dce9f5'], 0.4); });
tex('snow_side', (p) => {
  paintDirt(p);
  for (let x = 0; x < 16; x++) { const h = 4 + Math.floor(p.rnd(0, 2)); p.rect(x, 0, 1, h, '#f4fbff'); p.set(x, h, '#e2ecf5'); }
});
tex('torch', (p) => {
  p.rect(7, 6, 2, 9, '#7a5a2e'); p.rect(7, 6, 1, 9, '#9a7742');
  p.rect(7, 8, 2, 1, '#3f2d15');
  p.rect(6, 3, 4, 4, '#ffb52e'); p.rect(7, 2, 2, 5, '#ffd766'); p.rect(7, 4, 2, 2, '#fff3b0');
});
tex('craft_top', (p) => {
  paintPlanks(p, '#9c7043');
  p.frame('#5b3f22');
  for (let i = 1; i < 3; i++) {                            // 3×3 网格凹槽
    p.rect(i * 5 + 1, 1, 1, 14, '#5b3f22');
    p.rect(i * 5 + 2, 1, 1, 14, '#7a5730');
    p.rect(1, i * 5 + 1, 14, 1, '#5b3f22');
    p.rect(1, i * 5 + 2, 14, 1, '#7a5730');
  }
  // 刻在上面的小工具图案
  p.rect(2, 2, 3, 1, '#d8d8d8'); p.rect(3, 3, 1, 2, '#8a8a8a');
  p.rect(10, 2, 1, 3, '#8a8a8a'); p.rect(11, 3, 2, 1, '#d8d8d8');
  p.set(3, 11, '#8a8a8a'); p.set(4, 12, '#8a8a8a'); p.set(5, 11, '#d8d8d8');
  p.set(10, 12, '#a86a3a'); p.set(11, 11, '#a86a3a'); p.set(12, 12, '#c9903a');
});
tex('craft_side', (p) => {
  paintPlanks(p, '#9c7043');
  p.rect(0, 0, 16, 3, '#7a5730');
  p.rect(1, 4, 14, 11, '#6b4a26');
  // 侧面挂着的工具：锯与锤
  p.rect(3, 5, 1, 6, '#c9a870'); p.rect(2, 5, 3, 2, '#b8b8b8');
  p.rect(9, 6, 1, 5, '#a87d45'); p.rect(8, 5, 3, 2, '#8a8a8a');
  p.rect(12, 7, 2, 1, '#8a8a8a'); p.rect(12, 9, 2, 1, '#8a8a8a');
  p.frame('#5b3f22');
});
tex('craft_front', (p) => { paintPlanks(p, '#a87d45'); p.rect(1, 2, 14, 5, '#6b4f2a'); p.rect(2, 3, 6, 1, '#c9a870'); p.rect(2, 9, 12, 5, '#5b421f'); p.rect(4, 10, 2, 3, '#8a6537'); p.rect(10, 10, 2, 3, '#8a6537'); });
tex('furnace_side', (p) => { paintStone(p); p.frame('#6a6a6a'); });
tex('furnace_top', (p) => { paintStone(p); p.rect(3, 3, 10, 10, '#6d6d6d'); p.rect(4, 4, 8, 8, '#606060'); });
tex('furnace_front', (p) => {
  paintStone(p);
  p.rect(3, 2, 10, 2, '#6a6e69');                       // 上沿
  p.rect(3, 4, 10, 9, '#2b2b2b');                       // 炉口
  p.rect(4, 5, 8, 7, '#171717');
  p.rect(4, 4, 8, 1, '#4a4a4a');
  for (let i = 0; i < 4; i++) p.rect(4 + i * 2, 6, 1, 6, '#3a3a3a');
  p.rect(2, 2, 1, 12, '#61655e'); p.rect(13, 2, 1, 12, '#4a4e49');
});
tex('furnace_front_lit', (p) => {
  paintStone(p);
  p.rect(3, 2, 10, 2, '#6a6e69');
  p.rect(3, 4, 10, 9, '#2b2b2b');
  p.rect(4, 5, 8, 7, '#3a1d08');
  p.rect(4, 4, 8, 1, '#4a4a4a');
  for (let x = 4; x < 12; x++) { const h = 2 + Math.floor(p.rnd(0, 5)); p.rect(x, 12 - h, 1, h, ['#ff9d1f', '#ffc33c', '#ff6a00'][Math.floor(p.rng() * 3)]); }
  for (let x = 5; x < 11; x += 2) p.set(x, 12, '#fff0b0');
  p.rect(2, 2, 1, 12, '#61655e'); p.rect(13, 2, 1, 12, '#4a4e49');
});
tex('chest_top', (p) => { paintPlanks(p, '#8f6a35'); p.frame('#5b421f'); p.rect(6, 0, 4, 16, '#6b4f2a'); });
tex('chest_side', (p) => { paintPlanks(p, '#8f6a35'); p.frame('#5b421f'); p.rect(0, 4, 16, 1, '#5b421f'); p.rect(0, 11, 16, 1, '#5b421f'); });
tex('chest_front', (p) => {
  paintPlanks(p, '#9a7339');
  p.frame('#5b421f'); p.rect(0, 5, 16, 1, '#5b421f');
  p.rect(6, 4, 4, 4, '#e0c060'); p.rect(7, 6, 2, 2, '#5b421f');
});
tex('brick', (p) => paintBrick(p));
tex('stone_brick', (p) => {
  p.fill('#6f6f6f');
  for (let row = 0; row < 4; row++) {
    const y = row * 4, off = row % 2 ? -4 : 0;
    for (let bx = off; bx < 16; bx += 8) { p.rect(bx + 1, y + 1, 6, 3, shade('#8d8d8d', p.rnd(0.9, 1.08))); p.rect(bx + 1, y + 1, 6, 1, '#a0a0a0'); }
  }
});
tex('obsidian', (p) => {
  p.fill('#15101f');
  p.grain(['#221a33', '#0d0a14', '#2c2140'], 0.5);
  for (let i = 0; i < 12; i++) p.set(Math.floor(p.rnd(0, 16)), Math.floor(p.rnd(0, 16)), '#4b3470');
});
tex('glowstone', (p) => {
  p.fill('#b98a3c');
  p.grain(['#a17633', '#c99a4a'], 0.5);
  for (let i = 0; i < 14; i++) p.blob(Math.floor(p.rnd(1, 15)), Math.floor(p.rnd(1, 15)), 1, '#fff2a8');
  for (let i = 0; i < 6; i++) p.set(Math.floor(p.rnd(0, 16)), Math.floor(p.rnd(0, 16)), '#ffffff');
});
tex('tnt_side', (p) => {
  p.fill('#c8372d'); p.grain(['#b52f26', '#d94133'], 0.4);
  p.rect(0, 5, 16, 6, '#f2f2f2'); p.rect(0, 5, 16, 1, '#d8d8d8'); p.rect(0, 10, 16, 1, '#d8d8d8');
  p.rect(1, 7, 1, 2, '#2b2b2b'); p.rect(3, 7, 1, 2, '#2b2b2b'); p.rect(5, 7, 1, 2, '#2b2b2b');
  p.rect(8, 7, 2, 2, '#2b2b2b'); p.rect(11, 7, 1, 2, '#2b2b2b');
  p.rect(0, 0, 16, 1, '#8f231c'); p.rect(0, 15, 16, 1, '#8f231c');
});
tex('tnt_top', (p) => { p.fill('#c8372d'); p.grain(['#b52f26', '#d94133'], 0.4); p.rect(5, 5, 6, 6, '#f2f2f2'); p.rect(6, 6, 4, 4, '#5b421f'); p.rect(7, 7, 2, 2, '#2b2b2b'); });
tex('dust_off', (p) => {
  const draw = (x, y) => p.rect(x, y, 1, 1, '#8f1414');
  for (let i = 0; i < 16; i++) { draw(i, 7); draw(i, 8); }
  for (let i = 0; i < 16; i++) { draw(7, i); draw(8, i); }
  for (let i = 0; i < 16; i++) { p.set(i, 6, '#6b0f0f'); p.set(i, 9, '#5a0c0c'); p.set(6, i, '#6b0f0f'); p.set(9, i, '#5a0c0c'); }
});
tex('dust_on', (p) => {
  const draw = (x, y, c) => p.rect(x, y, 1, 1, c);
  for (let i = 0; i < 16; i++) { draw(i, 7, '#ff3b30'); draw(i, 8, '#ff5a3c'); }
  for (let i = 0; i < 16; i++) { draw(7, i, '#ff3b30'); draw(8, i, '#ff5a3c'); }
  for (let i = 0; i < 16; i++) { p.set(i, 6, '#a81c14'); p.set(i, 9, '#901610'); p.set(6, i, '#a81c14'); p.set(9, i, '#901610'); }
});
tex('lever', (p) => {
  paintCobble(p, '#7f7f7f', '#555');
  p.rect(6, 7, 4, 4, '#6b6b6b');
  p.rect(7, 2, 2, 6, '#8a6a3a'); p.rect(7, 2, 2, 2, '#c9a870');
});
tex('button', (p) => {
  paintStone(p);
  p.rect(5, 5, 6, 6, '#9a9a9a'); p.rect(6, 6, 4, 4, '#b0b0b0'); p.rect(6, 6, 4, 1, '#c8c8c8');
});
tex('plate', (p) => { paintStone(p); p.rect(2, 2, 12, 12, '#a8a8a8'); p.rect(3, 3, 10, 10, '#c0c0c0'); p.rect(3, 3, 10, 1, '#d8d8d8'); });
tex('repeater_off', (p) => {
  paintStone(p);
  p.rect(1, 3, 14, 10, '#8f8f8f'); p.rect(2, 4, 12, 8, '#9c9c9c');
  p.rect(2, 7, 12, 2, '#8f1414');
  p.rect(3, 5, 2, 4, '#c9a870'); p.rect(11, 5, 2, 4, '#c9a870');
});
tex('repeater_on', (p) => {
  paintStone(p);
  p.rect(1, 3, 14, 10, '#8f8f8f'); p.rect(2, 4, 12, 8, '#9c9c9c');
  p.rect(2, 7, 12, 2, '#ff3b30');
  p.rect(3, 5, 2, 4, '#ffd766'); p.rect(11, 5, 2, 4, '#ffd766');
});
tex('lamp_off', (p) => {
  p.fill('#6d4a2a'); p.grain(['#5d3f24', '#7d5731'], 0.5);
  for (let i = 0; i < 6; i++) p.blob(Math.floor(p.rnd(2, 14)), Math.floor(p.rnd(2, 14)), 1, '#4a3218');
  p.frame('#54371d');
});
tex('lamp_on', (p) => {
  p.fill('#f0c060'); p.grain(['#ffdd8a', '#e0a940'], 0.5);
  for (let i = 0; i < 8; i++) p.blob(Math.floor(p.rnd(2, 14)), Math.floor(p.rnd(2, 14)), 1, '#fff6c8');
  p.frame('#c99a3a');
});
tex('piston_side', (p) => { paintPlanks(p, '#a87d45'); p.rect(0, 0, 16, 4, '#c0c0c0'); p.rect(0, 4, 16, 1, '#8f8f8f'); p.rect(0, 12, 16, 4, '#8a6537'); });
tex('piston_top', (p) => { paintPlanks(p, '#b0854b'); p.rect(3, 3, 10, 10, '#c0c0c0'); p.rect(4, 4, 8, 8, '#a8a8a8'); });
tex('piston_face', (p) => { p.fill('#a8a8a8'); p.grain(['#9a9a9a', '#b8b8b8'], 0.5); p.rect(5, 5, 6, 6, '#7d6a52'); p.frame('#8a8a8a'); });
tex('wool_white', (p) => paintWool(p, '#eaeaea'));
tex('wool_red', (p) => paintWool(p, '#b02e26'));
tex('wool_blue', (p) => paintWool(p, '#3c44aa'));
tex('wool_yellow', (p) => paintWool(p, '#fed83d'));
tex('wool_green', (p) => paintWool(p, '#5e7c16'));
tex('wool_black', (p) => paintWool(p, '#1d1d21'));
tex('farmland', (p) => {
  p.fill('#5b4027'); p.grain(['#4d3620', '#6b4c2e', '#422e1b'], 0.55);
  for (let x = 1; x < 15; x += 2) p.rect(x, 1, 1, 14, '#3f2d1a');
});
const wheatArt = (stage) => (p) => {
  const h = 3 + stage * 3;
  for (let s = 0; s < 3; s++) {
    const x = 3 + s * 5;
    p.rect(x, 16 - h, 1, h, stage < 2 ? '#4f8f30' : '#7ba13a');
    if (stage >= 1) { for (let y = 16 - h; y < 16 - h + 3; y += 2) p.set(x - 1, y, '#6ba643'); }
    if (stage >= 3) { p.rect(x, 16 - h, 1, 3, '#e0c060'); p.set(x + 1, 13, '#e0c060'); }
  }
  if (stage >= 2) for (let x = 0; x < 16; x += 4) p.set(x, 15, '#3f2d1a');
};
tex('wheat0', wheatArt(0)); tex('wheat1', wheatArt(1)); tex('wheat2', wheatArt(2)); tex('wheat3', wheatArt(3));
tex('flower_red', (p) => {
  p.rect(7, 8, 2, 7, '#4f8f30'); p.set(6, 11, '#4f8f30'); p.set(9, 10, '#4f8f30');
  p.rect(6, 4, 4, 4, '#d43b3b'); p.set(7, 5, '#ffe066'); p.set(8, 6, '#ffe066');
  p.set(6, 3, '#e85a5a'); p.set(9, 3, '#e85a5a');
});
tex('flower_yellow', (p) => {
  p.rect(7, 8, 2, 7, '#4f8f30'); p.set(6, 12, '#4f8f30'); p.set(9, 11, '#4f8f30');
  p.blob(7, 6, 2, '#f2d24a'); p.set(7, 6, '#8f6a1f');
});
tex('tall_grass', (p) => {
  for (let i = 0; i < 7; i++) {
    const x = 1 + i * 2, h = 5 + Math.floor(p.rnd(0, 6));
    for (let y = 0; y < h; y++) p.set(x + (y > h - 3 ? 1 : 0), 15 - y, y > h - 3 ? '#e8e8e8' : '#bcbcbc');
  }
});
tex('dead_bush', (p) => {
  for (let i = 0; i < 8; i++) { const x = 3 + i, h = 4 + Math.floor(p.rnd(0, 5)); for (let y = 0; y < h; y++) p.set(x + (i % 2), 15 - y, '#8a6a3a'); }
});
tex('cactus_side', (p) => {
  p.fill('#3f7a34'); p.rect(0, 0, 2, 16, '#2f5c28'); p.rect(14, 0, 2, 16, '#2f5c28');
  p.rect(0, 0, 16, 1, '#5f9a43');
  for (let i = 1; i < 16; i += 3) { p.set(3, i, '#d8e8b0'); p.set(12, i + 1, '#d8e8b0'); }
  p.rect(7, 0, 2, 16, '#4f8f3c');
});
tex('cactus_top', (p) => { p.fill('#4f8f3c'); p.grain(['#3f7a34', '#5f9a43'], 0.5); p.rect(6, 6, 4, 4, '#6ba643'); });
tex('bookshelf', (p) => {
  paintPlanks(p, '#a87d45');
  const cols = ['#b02e26', '#3c44aa', '#5e7c16', '#fed83d', '#8a5a2b', '#7a3aa8'];
  for (let row = 0; row < 2; row++) {
    const y = 2 + row * 8;
    p.rect(0, y - 1, 16, 7, '#5b421f');
    let x = 1;
    while (x < 15) { const w = 1 + Math.floor(p.rnd(0, 2)); p.rect(x, y, w, 5, cols[Math.floor(p.rng() * cols.length)]); x += w + 1; }
  }
});
tex('enchant_top', (p) => {
  p.fill('#221a33'); p.grain(['#2c2140', '#170f25'], 0.5);
  p.frame('#4b3470');
  p.rect(4, 4, 8, 8, '#3a2a5c'); p.rect(6, 6, 4, 4, '#6b4fd0'); p.rect(7, 7, 2, 2, '#c9b6ff');
});
tex('enchant_side', (p) => {
  p.fill('#221a33'); p.grain(['#2c2140', '#170f25'], 0.5);
  p.frame('#4b3470');
  p.rect(3, 4, 10, 7, '#6b4a2a'); p.rect(4, 5, 8, 5, '#e0dcc8'); p.rect(8, 5, 1, 5, '#8a7f6a');
  p.set(6, 12, '#c9b6ff'); p.set(11, 3, '#c9b6ff'); p.set(3, 13, '#8f6ad8');
});
tex('bed_top', (p) => {
  p.fill('#b02e26'); p.grain(['#a02a22', '#c0392f'], 0.4);
  p.rect(1, 1, 6, 14, '#eaeaea'); p.rect(2, 2, 4, 12, '#f6f6f6');
  p.frame('#7d1f19');
});
tex('bed_side', (p) => {
  p.fill('#b02e26'); p.grain(['#a02a22', '#c0392f'], 0.4);
  p.rect(0, 0, 6, 16, '#eaeaea'); p.rect(0, 0, 16, 2, '#f2f2f2');
  p.frame('#7d1f19');
});
tex('clay', (p) => { p.fill('#a4a8b0'); p.grain(['#b3b7bf', '#949aa4', '#c0c4cc'], 0.5); });
tex('diamond_block', (p) => {
  p.fill('#4fe0d4'); p.grain(['#67f0e4', '#38c8bc'], 0.45);
  p.rect(2, 2, 5, 5, '#a8fff8'); p.rect(9, 9, 4, 4, '#28b0a8');
  p.frame('#28a89f');
});
tex('iron_block', (p) => { p.fill('#d8d8d8'); p.grain(['#c8c8c8', '#e8e8e8', '#bfbfbf'], 0.5); p.frame('#b0b0b0'); });
tex('gold_block', (p) => { p.fill('#f8d05a'); p.grain(['#ffdf7a', '#e0b13a', '#ffeaa0'], 0.5); p.frame('#c99a2a'); });
tex('coal_block', (p) => { p.fill('#1f1f1f'); p.grain(['#2b2b2b', '#151515', '#333'], 0.5); p.frame('#0d0d0d'); });
tex('lantern_glass', (p) => { p.fill(rgba('#cfe8ff', 0.35)); p.frame(rgba('#ffffff', 0.6)); });
tex('missing', (p) => {                                  // 缺贴图时的“洋红黑格”提示贴图
  p.fill('#ff00ff');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (((x >> 3) + (y >> 3)) % 2 === 0) p.set(x, y, '#101010');
  }
});

/* ---------- 下界 / 末地 方块 ---------- */
tex('netherrack', (p) => {
  p.fill('#6f3436'); p.grain(['#7d3b3c', '#5f2b2e', '#8a4444', '#552528'], 0.6);
  for (let i = 0; i < 14; i++) { const x = Math.floor(p.rnd(0, 15)), y = Math.floor(p.rnd(0, 15)); p.rect(x, y, 2, 1, '#4a2023'); }
  for (let i = 0; i < 10; i++) p.set(Math.floor(p.rnd(0, 16)), Math.floor(p.rnd(0, 16)), '#93494a');
});
tex('soul_sand', (p) => {
  p.fill('#544033'); p.grain(['#5f4a3a', '#483629', '#6a5341'], 0.55);
  for (const [x, y] of [[3, 4], [10, 3], [6, 10], [12, 11]]) { p.blob(x, y, 2, '#3d2e24'); p.set(x - 1, y - 1, '#3d2e24'); }
  p.grain(['#2f2419'], 0.08);
});
tex('magma_block', (p) => {
  p.fill('#3a1d12'); p.grain(['#4a2416', '#2c1409'], 0.5);
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(p.rnd(1, 14)), y = Math.floor(p.rnd(1, 14));
    p.rect(x, y, Math.floor(p.rnd(2, 5)), 1, '#ff8a1f');
    p.set(x + 1, y + 1, '#ffc24a');
  }
});
tex('nether_bricks', (p) => paintBrick(p, '#3b1f22', '#2a1618'));
tex('nether_quartz_ore', (p) => { paintNetherrackBase(p); paintOre(p, '#e8e2d8', '#b0a89c', 5); });
tex('nether_portal', (p) => {
  p.fill(rgba('#7a2fbf', 0.72));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = Math.sin(x * 1.1 + y * 0.7) * 0.5 + Math.sin(y * 1.4 - x * 0.5) * 0.5;
    const c = n > 0.35 ? '#c980ff' : n < -0.3 ? '#4a1580' : '#8a3ad0';
    p.set(x, y, rgba(c, 0.72 + (n > 0 ? 0.2 : 0)));
  }
});
tex('fire', (p) => {
  for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
    const d = Math.abs(x - 7.5) / 7.5;
    const h = 1 - d * 1.15;
    if (y / 16 > 1 - h) {
      const t = y / 16;
      p.set(x, y, t > 0.72 ? '#ffd24a' : t > 0.5 ? '#ff9a1f' : '#e2600f');
    }
  }
  for (let i = 0; i < 16; i++) p.set(7 + Math.floor(p.rnd(-2, 3)), 15 - i, i % 3 ? '#ffb02e' : '#ffe28a');
});
tex('end_stone', (p) => {
  p.fill('#dbda9f'); p.grain(['#e6e5ad', '#cdcb92', '#f2f1bb', '#c2c08a'], 0.55);
  for (let i = 0; i < 10; i++) p.blob(Math.floor(p.rnd(1, 15)), Math.floor(p.rnd(1, 15)), 1, '#b8b681');
});
tex('end_portal_frame_top', (p) => {
  p.fill('#3f5a52'); p.grain(['#4a6a60', '#33504a', '#54756a'], 0.5);
  p.rect(1, 1, 14, 14, '#4f7066'); p.rect(2, 2, 12, 12, '#2f4a44');
  p.rect(5, 5, 6, 6, '#1f3630'); p.rect(6, 6, 4, 4, '#162824');
  p.frame('#5f8076');
});
tex('end_portal_frame_eye', (p) => {
  p.fill('#3f5a52'); p.grain(['#4a6a60', '#33504a'], 0.4);
  p.rect(2, 2, 12, 12, '#2f4a44');
  p.blob(7, 7, 3, '#8fe070'); p.blob(7, 7, 2, '#c8ffa8'); p.set(7, 7, '#0f2a18');
  p.frame('#5f8076');
});
tex('end_portal_frame_side', (p) => {
  p.fill('#2f4a44'); p.grain(['#3a5a52', '#243a35', '#456a60'], 0.5);
  p.rect(0, 0, 16, 2, '#5f8076'); p.rect(0, 14, 16, 2, '#1f3630');
});
tex('end_portal', (p) => {
  p.fill('#080510');
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(p.rnd(0, 16)), y = Math.floor(p.rnd(0, 16));
    p.set(x, y, ['#c9a8ff', '#8f6ad8', '#ffffff', '#5a3a9a'][Math.floor(p.rng() * 4)]);
  }
});
tex('dragon_egg', (p) => {
  p.fill('#12081e'); p.grain(['#1d0f2e', '#0b0514', '#2a1544'], 0.6);
  for (let i = 0; i < 18; i++) p.set(Math.floor(p.rnd(0, 16)), Math.floor(p.rnd(0, 16)), '#5b3a8a');
  p.blob(8, 6, 3, '#1a0d2a');
});
tex('crying_obsidian', (p) => {
  p.fill('#15101f'); p.grain(['#221a33', '#0d0a14'], 0.5);
  for (let x = 2; x < 16; x += 4) for (let y = Math.floor(p.rnd(3, 8)); y < 16; y++) p.set(x, y, '#5a3ad0');
});

function paintNetherrackBase(p) {
  p.fill('#6f3436'); p.grain(['#7d3b3c', '#5f2b2e', '#8a4444'], 0.6);
}

/* ---------- 末地城 / 潜影贝 ---------- */
tex('purpur_block', (p) => {
  p.fill('#a26fa8'); p.grain(['#b07cb6', '#956297', '#c08cc6'], 0.5);
  for (let i = 0; i < 12; i++) p.blob(Math.floor(p.rnd(1, 15)), Math.floor(p.rnd(1, 15)), 1, '#8a5a90');
  p.frame('#8a5a90');
});
tex('purpur_pillar_side', (p) => {
  p.fill('#a97cae'); p.grain(['#b88cbd', '#9a6b9f'], 0.45);
  p.rect(0, 0, 4, 16, '#c49ac8'); p.rect(12, 0, 4, 16, '#8f5f94');
  p.rect(0, 4, 16, 1, '#8a5a90'); p.rect(0, 12, 16, 1, '#8a5a90');
  p.rect(6, 0, 4, 16, '#b889bd');
});
tex('purpur_pillar_top', (p) => {
  p.fill('#b889bd'); p.grain(['#a97cae', '#c49ac8'], 0.5);
  p.rect(3, 3, 10, 10, '#8f5f94'); p.rect(5, 5, 6, 6, '#c49ac8'); p.rect(7, 7, 2, 2, '#7a4f80');
});
tex('end_stone_bricks', (p) => {
  paintBrick(p, '#d6d59b', '#b6b47f');
  p.grain(['#e2e0aa', '#c8c68f'], 0.25);
});
tex('end_rod', (p) => {
  p.rect(7, 5, 2, 10, '#e8e4d8'); p.rect(7, 5, 1, 10, '#ffffff');
  p.rect(6, 2, 4, 4, '#f6f0d0'); p.rect(7, 1, 2, 3, '#ffffff');
  p.set(6, 3, '#fff8d8'); p.set(9, 3, '#fff8d8');
});
tex('shulker_box', (p) => {
  p.fill('#8a4fa8'); p.grain(['#9a5cb8', '#7a3f98', '#a86cc6'], 0.5);
  p.rect(0, 0, 16, 5, '#a86cc6'); p.rect(0, 5, 16, 1, '#6a3588');
  p.rect(6, 6, 4, 4, '#e0c0f0'); p.rect(7, 7, 2, 2, '#c090d8');
  p.frame('#6a3588');
});
tex('shulker_shell_top', (p) => {
  p.fill('#9a5cb8'); p.grain(['#a86cc6', '#8a4fa8'], 0.5);
  p.rect(3, 3, 10, 10, '#b87cd0'); p.rect(5, 5, 6, 6, '#e0c0f0'); p.rect(7, 7, 2, 2, '#f0e0ff');
});

/* ---------- 图集构建 ---------- */
class TextureAtlas {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_PX; this.canvas.height = ATLAS_PX;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.tiles = [];   // 每个贴图单独画布（用于物品图标）
    this.ctx.clearRect(0, 0, ATLAS_PX, ATLAS_PX);
    TILE_FNS.forEach((fn, i) => {
      const tx = (i % ATLAS_COLS) * TILE_PX, ty = Math.floor(i / ATLAS_COLS) * TILE_PX;
      const rng = makeRng(9871 + i * 7919);
      const p = new P(this.ctx, tx, ty, rng);
      fn(p, rng);
      // 单贴图画布
      const c = document.createElement('canvas'); c.width = TILE_PX; c.height = TILE_PX;
      const cc = c.getContext('2d'); cc.imageSmoothingEnabled = false;
      cc.drawImage(this.canvas, tx, ty, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
      this.tiles.push(c);
    });
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestMipmapLinearFilter;
    this.texture.generateMipmaps = true;
    this.texture.anisotropy = 4;
    this.texture.colorSpace = THREE.LinearSRGBColorSpace;   // 自定义着色器里直接使用原始颜色
    this.texture.needsUpdate = true;
    this.inset = 0.35 / ATLAS_PX;
  }
  uv(index) {
    if (!(index >= 0) || index >= TILE_FNS.length) index = T.MISSING;
    const tx = index % ATLAS_COLS, ty = Math.floor(index / ATLAS_COLS);
    const u0 = tx / ATLAS_COLS + this.inset, v0 = 1 - (ty + 1) / ATLAS_COLS + this.inset;
    const u1 = (tx + 1) / ATLAS_COLS - this.inset, v1 = 1 - ty / ATLAS_COLS - this.inset;
    return [u0, v0, u1, v1];
  }
  tileCanvas(index) {
    if (!(index >= 0) || index >= this.tiles.length) index = T.MISSING;
    return this.tiles[index];
  }
}

/* ============================================================
   物品图标（16×16 像素艺术）
   ============================================================ */
const ITEM_ART = {
  pickaxe: [
    '................',
    '....MMMMHHMM....',
    '...MMMMMHHMMM...',
    '..MMMM..MM.MMM..',
    '..MMH....W...MM.',
    '..M......W....M.',
    '.........W......',
    '........W.......',
    '........W.......',
    '.......W........',
    '.......W........',
    '......W.........',
    '......W.........',
    '.....W..........',
    '.....W..........',
    '................'],
  axe: [
    '................',
    '.....MMMM.......',
    '....MMMMMM......',
    '...MMMHHMMM.....',
    '...MMH...MMM....',
    '...MM.....MM....',
    '...MM..W..MM....',
    '....M..W........',
    '.......W........',
    '.......W........',
    '......W.........',
    '......W.........',
    '.....W..........',
    '.....W..........',
    '....W...........',
    '................'],
  shovel: [
    '................',
    '......MMM.......',
    '.....MMMMM......',
    '.....MMHMM......',
    '.....MMMMM......',
    '......MMM.......',
    '.......W........',
    '.......W........',
    '......W.........',
    '......W.........',
    '.....W..........',
    '.....W..........',
    '....W...........',
    '....W...........',
    '...W............',
    '................'],
  sword: [
    '................',
    '...........MM...',
    '..........MMM...',
    '.........MMM....',
    '........MMM.....',
    '.......MMM......',
    '......MMM.......',
    '.....MMM........',
    '....MMM.........',
    '...MMMM.........',
    '..HHMM..........',
    '..HHH..........',
    '..W.HH..........',
    '..W.............',
    '.WW.............',
    '................'],
  hoe: [
    '................',
    '.....MMMMM......',
    '....MMMMMMM.....',
    '....MMH..MM.....',
    '.........W......',
    '.........W......',
    '........W.......',
    '........W.......',
    '.......W........',
    '.......W........',
    '......W.........',
    '......W.........',
    '.....W..........',
    '.....W..........',
    '....W...........',
    '................'],
  bow: [
    '................',
    '....WWWW........',
    '...W....W.......',
    '..W......W......',
    '..W.......S.....',
    '..W.......S.....',
    '..W.......S.....',
    '..W......S......',
    '...W.....S......',
    '...W....S.......',
    '....W...S.......',
    '....WW..S.......',
    '.....WWWS.......',
    '................',
    '................',
    '................'],
  helmet: [
    '................',
    '....MMMMMM......',
    '...MMMMMMMM.....',
    '..MMMMMMMMMM....',
    '..MMMMMMMMMM....',
    '..MMH....HMM....',
    '..MMM....MMM....',
    '..MMMM..MMMM....',
    '..MMMMMMMMMM....',
    '..M..MMMM..M....',
    '.....MMMM.......',
    '................',
    '................',
    '................',
    '................',
    '................'],
  chestplate: [
    '................',
    '..MMM....MMM....',
    '..MMMM..MMMM....',
    '..MMMMMMMMMM....',
    '..MMMMMMMMMM....',
    '..MMMMMMMMMM....',
    '..MMMMMMMMMM....',
    '..MMMMMMMMMM....',
    '...MMMMMMMM.....',
    '...MMMMMMMM.....',
    '...MM....MM.....',
    '................',
    '................',
    '................',
    '................',
    '................'],
  leggings: [
    '................',
    '................',
    '..MMMMMMMMMM....',
    '..MMMMMMMMMM....',
    '..MMMMMMMMMM....',
    '..MMMM..MMMM....',
    '..MMM....MMM....',
    '..MMM....MMM....',
    '..MMM....MMM....',
    '..MMM....MMM....',
    '..MMM....MMM....',
    '................',
    '................',
    '................',
    '................',
    '................'],
  boots: [
    '................',
    '................',
    '................',
    '..MMM....MMM....',
    '..MMM....MMM....',
    '..MMM....MMM....',
    '..MMMM...MMMM...',
    '..MMMMM..MMMMM..',
    '..MMMMM..MMMMM..',
    '..MMMMM..MMMMM..',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'],
};

class Icons {
  constructor(atlas) {
    this.atlas = atlas;
    this.cache = new Map();
    this.mats = {};
  }
  materialColors(mat) {
    const table = {
      wood: ['#a87d45', '#6b4f2a', '#c9a870'],
      stone: ['#8a8a8a', '#5f5f5f', '#b0b0b0'],
      iron: ['#d8d8d8', '#a0a0a0', '#f4f4f4'],
      gold: ['#f8d05a', '#c99a2a', '#ffeaa0'],
      diamond: ['#5ff0e0', '#25b6ae', '#c9fffa'],
    };
    return table[mat] || table.wood;
  }
  // 解析像素图，M=材质主色, H=高光, W=木柄
  drawArt(ctx, art, mat) {
    const [M, Md, H] = this.materialColors(mat);
    const wood = ['#a87d45'];
    for (let y = 0; y < 16; y++) {
      const row = art[y] || '';
      for (let x = 0; x < 16; x++) {
        const ch = row[x];
        if (!ch || ch === '.') continue;
        let col = null;
        if (ch === 'M') col = M; else if (ch === 'H') col = H;
        else if (ch === 'W' || ch === 'S') col = ch === 'S' ? '#e8e8e8' : (wood[0] || '#a87d45');
        if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
      }
    }
  }
  drawFlat(ctx, fn) { fn(ctx); }
  // 方块立体图标（等轴测）
  /* 灰度草/叶贴图需要染色：给图标用的贴图做一份染色副本（带缓存） */
  tintedTile(idx, tint, strength) {
    if (!tint) return this.atlas.tileCanvas(idx);
    const key = 'tint' + idx + '_' + tint.join(',') + '_' + strength;
    if (this.cache.has(key)) return this.cache.get(key);
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.atlas.tileCanvas(idx), 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(${Math.round(tint[0] * 255)},${Math.round(tint[1] * 255)},${Math.round(tint[2] * 255)},${strength})`;
    ctx.fillRect(0, 0, 16, 16);
    ctx.globalCompositeOperation = 'source-over';
    this.cache.set(key, c);
    return c;
  }
  cubeIcon(topIdx, sideIdx, size = 32, topTint, sideTint) {
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const top = topTint ? this.tintedTile(topIdx, topTint, 0.78) : this.atlas.tileCanvas(topIdx);
    const side = sideTint ? this.tintedTile(sideIdx, sideTint, 0.45) : this.atlas.tileCanvas(sideIdx);
    const S = size, m = S * 0.06;
    const ex = [(S - 2 * m) / 2, (S - 2 * m) / 4 * 1.05];
    const ez = [-(S - 2 * m) / 2, (S - 2 * m) / 4 * 1.05];
    const hgt = S * 0.4;
    const O = [S / 2, m + 1];
    const face = (p0, u, v, img, dark) => {
      ctx.save();
      ctx.setTransform(u[0] / 16, u[1] / 16, v[0] / 16, v[1] / 16, p0[0], p0[1]);
      ctx.drawImage(img, 0, 0);
      if (dark < 1) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = `rgba(0,0,0,${1 - dark})`; ctx.fillRect(0, 0, 16, 16); }
      ctx.restore();
    };
    face(O, ex, ez, top, 1);                                             // 顶面
    face([O[0] + ez[0], O[1] + ez[1]], ex, [0, hgt], side, 0.72);        // 左面
    face([O[0] + ex[0], O[1] + ex[1]], ez, [0, hgt], side, 0.52);        // 右面
    return c;
  }
  flatIcon(drawFn, size = 32) {
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.save(); ctx.scale(size / 16, size / 16); drawFn(ctx); ctx.restore();
    return c;
  }
  // 通用像素画工具
  static art(ctx, rows, map) {
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x]; const col = map[ch];
      if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
    }
  }
  forItem(item, size = 32) {
    const key = item.id + '|' + size + '|' + (item.meta && item.meta.enchant ? item.meta.enchant.type + item.meta.enchant.lv : '');
    if (this.cache.has(key)) return this.cache.get(key);
    let canvas;
    if (item.def && item.def.block !== undefined) {
      // 方块物品：直接取方块自己的贴图（之前这里丢了 tex，导致所有方块图标都变成一块灰石）
      const bd = BLOCKS[item.def.block] || {};
      const tex = bd.tex || {};
      const shape = bd.shape || 'cube';
      if (shape === 'cross' || shape === 'flat' || shape === 'torch' || shape === 'crop' || shape === 'portal') {
        const idx = tex.all ?? tex.side ?? tex.top ?? T.STONE;
        canvas = this.flatIcon((ctx) => { ctx.drawImage(this.atlas.tileCanvas(idx), 0, 0); }, size);
      } else {
        const t0 = tex.top ?? tex.side ?? tex.all ?? T.STONE;
        const t1 = tex.side ?? tex.all ?? tex.top ?? T.STONE;
        // 草方块/树叶这类灰度贴图，图标也要按平原配色染一下
        let tint = null;
        if (bd.tint === 'grass' || bd.tint === 'foliage_grass') tint = [0.52, 0.76, 0.34];
        else if (bd.tint === 'foliage') tint = [0.42, 0.70, 0.28];
        else if (bd.tint === 'spruce') tint = [0.42, 0.62, 0.45];
        canvas = this.cubeIcon(t0, t1, size, tint, tint);
      }
    } else if (item.def && (item.def.toolArt || item.def.armorArt)) {
      const mat = item.def.mat || 'wood';
      const art = ITEM_ART[item.def.toolArt || item.def.armorArt];
      canvas = this.flatIcon((ctx) => { if (art) this.drawArt(ctx, art, mat); }, size);
    } else {
      const fn = ITEM_DRAW[item.id] || (() => { });
      canvas = this.flatIcon(fn, size);
    }
    if (item.meta && item.meta.enchant) {
      const ctx = canvas.getContext('2d');
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(180,140,255,0.30)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    }
    this.cache.set(key, canvas);
    return canvas;
  }
  dataURL(item, size = 32) {
    const c = this.forItem(item, size);
    const out = document.createElement('canvas'); out.width = size; out.height = size;
    const ctx = out.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(c, 0, 0);
    return out.toDataURL();
  }
  // 生成 DOM 图标元素
  el(item, size = 44, cls = 'icon') {
    const img = document.createElement('img');
    img.className = cls; img.width = size; img.height = size;
    img.src = this.dataURL(item, 32);
    img.draggable = false;
    return img;
  }
}

/* ---------- 非方块物品的像素画 ---------- */
const ITEM_DRAW = {
  stick: (c) => { c.fillStyle = '#a87d45'; for (let i = 0; i < 9; i++) c.fillRect(4 + i, 11 - i, 2, 2); c.fillStyle = '#8a6537'; c.fillRect(4, 11, 2, 1); },
  coal: (c) => { c.fillStyle = '#232323'; c.beginPath(); c.arc(8, 8, 5, 0, TAU); c.fill(); c.fillStyle = '#3a3a3a'; c.fillRect(6, 5, 3, 3); },
  charcoal: (c) => { c.fillStyle = '#2e2620'; c.beginPath(); c.arc(8, 8, 5, 0, TAU); c.fill(); c.fillStyle = '#4a3d33'; c.fillRect(7, 6, 3, 3); },
  iron_ingot: (c) => { c.fillStyle = '#d8d8d8'; c.beginPath(); c.moveTo(3, 11); c.lineTo(5, 5); c.lineTo(13, 5); c.lineTo(13, 11); c.closePath(); c.fill(); c.fillStyle = '#f4f4f4'; c.fillRect(5, 6, 8, 2); c.fillStyle = '#a8a8a8'; c.fillRect(3, 10, 10, 1); },
  gold_ingot: (c) => { c.fillStyle = '#f8d05a'; c.beginPath(); c.moveTo(3, 11); c.lineTo(5, 5); c.lineTo(13, 5); c.lineTo(13, 11); c.closePath(); c.fill(); c.fillStyle = '#fff0a8'; c.fillRect(5, 6, 8, 2); c.fillStyle = '#c99a2a'; c.fillRect(3, 10, 10, 1); },
  diamond: (c) => { c.fillStyle = '#4fe0d4'; c.beginPath(); c.moveTo(8, 2); c.lineTo(14, 8); c.lineTo(8, 14); c.lineTo(2, 8); c.closePath(); c.fill(); c.fillStyle = '#b8fff8'; c.beginPath(); c.moveTo(8, 3); c.lineTo(11, 6); c.lineTo(8, 7); c.closePath(); c.fill(); c.fillStyle = '#28a89f'; c.fillRect(7, 10, 3, 2); },
  emerald: (c) => { c.fillStyle = '#3ee07a'; c.beginPath(); c.moveTo(8, 2); c.lineTo(14, 8); c.lineTo(8, 14); c.lineTo(2, 8); c.closePath(); c.fill(); c.fillStyle = '#a8ffcc'; c.fillRect(6, 5, 3, 3); },
  redstone: (c) => { c.fillStyle = '#e02a2a'; for (let i = 0; i < 12; i++) c.fillRect(3 + (i * 5) % 10, 3 + (i * 7) % 10, 2, 2); },
  apple: (c) => { c.fillStyle = '#d43b3b'; c.beginPath(); c.arc(8, 9, 5, 0, TAU); c.fill(); c.fillStyle = '#ff7a6a'; c.fillRect(5, 6, 2, 2); c.fillStyle = '#6b4f2a'; c.fillRect(8, 2, 1, 3); c.fillStyle = '#5f9a3c'; c.fillRect(9, 2, 3, 2); },
  bread: (c) => { c.fillStyle = '#c98a45'; c.beginPath(); c.ellipse(8, 8, 6, 4.5, 0, 0, TAU); c.fill(); c.fillStyle = '#e0a960'; c.fillRect(3, 6, 3, 2); c.fillRect(8, 5, 3, 2); c.fillStyle = '#a86a2e'; c.fillRect(4, 9, 3, 1); c.fillRect(9, 10, 3, 1); },
  wheat_item: (c) => { c.fillStyle = '#e0c060'; for (let i = 0; i < 4; i++) c.fillRect(4 + i * 3, 4, 1, 9); c.fillStyle = '#c9a240'; for (let i = 0; i < 4; i++) { c.fillRect(3 + i * 3, 4, 3, 2); c.fillRect(3 + i * 3, 7, 3, 2); } c.fillStyle = '#8fa13a'; c.fillRect(7, 12, 2, 2); },
  seeds: (c) => { c.fillStyle = '#7ba13a'; c.fillRect(4, 6, 2, 2); c.fillRect(8, 4, 2, 2); c.fillRect(6, 9, 2, 2); c.fillRect(10, 8, 2, 2); c.fillStyle = '#a8c95a'; c.fillRect(5, 5, 1, 1); c.fillRect(9, 3, 1, 1); },
  raw_pork: (c) => { c.fillStyle = '#e88a8a'; c.beginPath(); c.ellipse(8, 8, 6, 4, 0, 0, TAU); c.fill(); c.fillStyle = '#f6b0b0'; c.fillRect(5, 6, 3, 2); c.fillStyle = '#c96a6a'; c.fillRect(9, 9, 3, 2); },
  cooked_pork: (c) => { c.fillStyle = '#b06a3a'; c.beginPath(); c.ellipse(8, 8, 6, 4, 0, 0, TAU); c.fill(); c.fillStyle = '#d18a52'; c.fillRect(5, 6, 3, 2); c.fillStyle = '#8a4f28'; c.fillRect(9, 9, 3, 2); },
  raw_beef: (c) => { c.fillStyle = '#c94a4a'; c.beginPath(); c.ellipse(8, 8, 6, 4.5, 0, 0, TAU); c.fill(); c.fillStyle = '#e88a8a'; c.fillRect(6, 6, 3, 2); c.fillStyle = '#f0e0d0'; c.fillRect(7, 9, 4, 1); },
  cooked_beef: (c) => { c.fillStyle = '#8a4f28'; c.beginPath(); c.ellipse(8, 8, 6, 4.5, 0, 0, TAU); c.fill(); c.fillStyle = '#b06a3a'; c.fillRect(6, 6, 3, 2); c.fillStyle = '#e0c0a0'; c.fillRect(7, 9, 4, 1); },
  chicken_raw: (c) => { c.fillStyle = '#f0d0a0'; c.beginPath(); c.ellipse(8, 9, 5, 3.5, 0, 0, TAU); c.fill(); c.fillStyle = '#f8e4c0'; c.fillRect(5, 7, 3, 2); },
  chicken_cooked: (c) => { c.fillStyle = '#c98a45'; c.beginPath(); c.ellipse(8, 9, 5, 3.5, 0, 0, TAU); c.fill(); c.fillStyle = '#e0a960'; c.fillRect(5, 7, 3, 2); },
  leather: (c) => { c.fillStyle = '#a87d45'; c.beginPath(); c.moveTo(3, 5); c.lineTo(13, 4); c.lineTo(14, 11); c.lineTo(4, 12); c.closePath(); c.fill(); c.fillStyle = '#c9a870'; c.fillRect(5, 6, 5, 2); },
  feather: (c) => { c.fillStyle = '#e0e0e8'; c.beginPath(); c.moveTo(11, 3); c.lineTo(14, 6); c.lineTo(6, 13); c.lineTo(4, 12); c.closePath(); c.fill(); c.fillStyle = '#b0b0c0'; c.fillRect(6, 8, 2, 3); c.fillStyle = '#8a8a9a'; c.fillRect(4, 12, 2, 3); },
  string: (c) => { c.strokeStyle = '#e8e8e8'; c.lineWidth = 1; c.beginPath(); c.moveTo(4, 3); c.bezierCurveTo(13, 5, 3, 9, 12, 13); c.stroke(); },
  gunpowder: (c) => { c.fillStyle = '#6a6a6a'; for (let i = 0; i < 14; i++) c.fillRect(3 + (i * 5) % 10, 3 + (i * 7) % 10, 2, 2); c.fillStyle = '#9a9a9a'; c.fillRect(6, 6, 2, 2); },
  bone: (c) => { c.fillStyle = '#f0f0e0'; c.fillRect(5, 4, 3, 3); c.fillRect(9, 4, 3, 3); c.fillRect(6, 7, 5, 5); c.fillRect(5, 11, 3, 3); c.fillRect(9, 11, 3, 3); },
  egg: (c) => { c.fillStyle = '#f0e8d8'; c.beginPath(); c.ellipse(8, 9, 4.5, 6, 0, 0, TAU); c.fill(); c.fillStyle = '#ffffff'; c.fillRect(6, 5, 2, 3); },
  arrow: (c) => { c.fillStyle = '#a87d45'; c.fillRect(4, 11, 8, 1); c.fillStyle = '#d8d8d8'; c.beginPath(); c.moveTo(12, 11); c.lineTo(15, 12); c.lineTo(12, 13); c.closePath(); c.fill(); c.fillStyle = '#e8e8e8'; c.fillRect(3, 9, 2, 2); c.fillRect(3, 12, 2, 2); c.fillRect(5, 10, 1, 3); },
  flint_steel: (c) => { c.fillStyle = '#8a8a8a'; c.beginPath(); c.moveTo(3, 12); c.lineTo(8, 4); c.lineTo(11, 6); c.lineTo(6, 14); c.closePath(); c.fill(); c.fillStyle = '#c9a270'; c.fillRect(10, 4, 4, 3); c.fillStyle = '#a87d45'; c.fillRect(9, 7, 4, 2); },
  paper: (c) => { c.fillStyle = '#f0f0f0'; c.fillRect(4, 3, 8, 10); c.fillStyle = '#c0c0c0'; for (let i = 0; i < 4; i++) c.fillRect(5, 5 + i * 2, 6, 1); },
  book: (c) => { c.fillStyle = '#8a5a2b'; c.fillRect(3, 3, 10, 11); c.fillStyle = '#e8e0c8'; c.fillRect(4, 4, 8, 9); c.fillStyle = '#b02e26'; c.fillRect(3, 3, 2, 11); },
  bowl: (c) => { c.fillStyle = '#a87d45'; c.beginPath(); c.moveTo(3, 7); c.lineTo(13, 7); c.lineTo(11, 13); c.lineTo(5, 13); c.closePath(); c.fill(); c.fillStyle = '#c9a870'; c.fillRect(3, 7, 10, 1); },
  wheat_stew: (c) => { c.fillStyle = '#a87d45'; c.beginPath(); c.moveTo(3, 7); c.lineTo(13, 7); c.lineTo(11, 13); c.lineTo(5, 13); c.closePath(); c.fill(); c.fillStyle = '#d8a04a'; c.fillRect(4, 6, 8, 2); },
  bucket: (c) => { c.fillStyle = '#c8c8c8'; c.beginPath(); c.moveTo(4, 5); c.lineTo(12, 5); c.lineTo(11, 13); c.lineTo(5, 13); c.closePath(); c.fill(); c.fillStyle = '#e8e8e8'; c.fillRect(4, 5, 8, 1); c.fillStyle = '#a0a0a0'; c.fillRect(4, 8, 8, 1); },
  bed_item: (c) => { c.fillStyle = '#b02e26'; c.fillRect(2, 7, 12, 7); c.fillStyle = '#eaeaea'; c.fillRect(2, 7, 4, 7); c.fillStyle = '#7d1f19'; c.fillRect(2, 13, 12, 1); },
  torch_item: (c) => { c.fillStyle = '#7a5a2e'; c.fillRect(7, 6, 2, 9); c.fillStyle = '#ffd766'; c.fillRect(6, 3, 4, 4); c.fillStyle = '#fff3b0'; c.fillRect(7, 4, 2, 2); },
};

// 别名与补充
ITEM_DRAW.wheat = ITEM_DRAW.wheat_item;
ITEM_DRAW.raw_porkchop = ITEM_DRAW.raw_pork;
ITEM_DRAW.cooked_porkchop = ITEM_DRAW.cooked_pork;
ITEM_DRAW.steak = ITEM_DRAW.cooked_beef;
ITEM_DRAW.flint = (c) => { c.fillStyle = '#3a3a42'; c.beginPath(); c.moveTo(4, 11); c.lineTo(7, 4); c.lineTo(12, 7); c.lineTo(9, 12); c.closePath(); c.fill(); c.fillStyle = '#5a5a66'; c.fillRect(7, 6, 3, 2); };
ITEM_DRAW.clay_ball = (c) => { c.fillStyle = '#a4a8b0'; c.beginPath(); c.arc(8, 8, 4.5, 0, TAU); c.fill(); c.fillStyle = '#c0c4cc'; c.fillRect(6, 6, 2, 2); };
ITEM_DRAW.brick = (c) => { c.fillStyle = '#9a5140'; c.fillRect(3, 6, 10, 5); c.fillStyle = '#b8afa0'; c.fillRect(7, 6, 1, 5); c.fillRect(3, 8, 10, 1); };
ITEM_DRAW.rotten_flesh = (c) => { c.fillStyle = '#6b7a3a'; c.beginPath(); c.ellipse(8, 8, 6, 4, 0, 0, TAU); c.fill(); c.fillStyle = '#8a9a4a'; c.fillRect(5, 6, 3, 2); c.fillStyle = '#4a5a2a'; c.fillRect(9, 9, 3, 2); };
ITEM_DRAW.water_bucket = (c) => { ITEM_DRAW.bucket(c); c.fillStyle = '#2f6be4'; c.fillRect(5, 6, 6, 3); c.fillStyle = '#5b93ff'; c.fillRect(6, 7, 2, 1); };
ITEM_DRAW.lava_bucket = (c) => { ITEM_DRAW.bucket(c); c.fillStyle = '#ff7514'; c.fillRect(5, 6, 6, 3); c.fillStyle = '#ffd766'; c.fillRect(7, 7, 2, 1); };
ITEM_DRAW.wool = (c) => { c.fillStyle = '#eaeaea'; c.fillRect(3, 4, 10, 8); c.fillStyle = '#ffffff'; c.fillRect(4, 5, 4, 3); };
ITEM_DRAW.quartz = (c) => { c.fillStyle = '#e8e2d8'; c.beginPath(); c.moveTo(4, 12); c.lineTo(7, 3); c.lineTo(12, 5); c.lineTo(10, 12); c.closePath(); c.fill(); c.fillStyle = '#ffffff'; c.fillRect(7, 5, 3, 2); };
ITEM_DRAW.ender_pearl = (c) => {
  c.fillStyle = '#1f6c5a'; c.beginPath(); c.arc(8, 8, 5.2, 0, TAU); c.fill();
  c.fillStyle = '#2fb89a'; c.beginPath(); c.arc(7, 7, 3.4, 0, TAU); c.fill();
  c.fillStyle = '#a8ffe8'; c.beginPath(); c.arc(6, 6, 1.6, 0, TAU); c.fill();
};
ITEM_DRAW.blaze_rod = (c) => {
  c.fillStyle = '#e8b03a'; c.fillRect(6, 3, 4, 10); c.fillStyle = '#ffd75e'; c.fillRect(7, 3, 1, 10);
  c.fillStyle = '#ffec9a'; c.fillRect(5, 2, 6, 2); c.fillStyle = '#c98a1f'; c.fillRect(5, 11, 6, 3);
};
ITEM_DRAW.blaze_powder = (c) => {
  c.fillStyle = '#ffb02e'; for (let i = 0; i < 18; i++) c.fillRect(3 + (i * 5) % 10, 3 + (i * 7) % 10, 2, 2);
  c.fillStyle = '#ffe066'; c.fillRect(6, 6, 3, 3);
};
ITEM_DRAW.eye_of_ender = (c) => {
  c.fillStyle = '#0f5f52'; c.beginPath(); c.arc(8, 8, 5.4, 0, TAU); c.fill();
  c.fillStyle = '#2fb89a'; c.beginPath(); c.arc(8, 8, 4.2, 0, TAU); c.fill();
  c.fillStyle = '#d8ff6a'; c.beginPath(); c.ellipse(8, 8, 3.2, 2.2, 0, 0, TAU); c.fill();
  c.fillStyle = '#1a1a10'; c.beginPath(); c.arc(8, 8, 1.5, 0, TAU); c.fill();
  c.fillStyle = '#ffffff'; c.fillRect(6, 6, 1, 1);
};
ITEM_DRAW.dragon_egg_item = ITEM_DRAW.ender_pearl;
ITEM_DRAW.shulker_shell = (c) => {
  c.fillStyle = '#8a4fa8'; c.beginPath(); c.ellipse(8, 9, 6, 4.5, 0, 0, TAU); c.fill();
  c.fillStyle = '#a86cc6'; c.beginPath(); c.ellipse(8, 7, 5, 3, 0, 0, TAU); c.fill();
  c.fillStyle = '#e0c0f0'; c.fillRect(6, 6, 4, 2);
};
ITEM_DRAW.elytra = (c) => {
  c.fillStyle = '#6a6a78';
  c.beginPath(); c.moveTo(8, 3); c.lineTo(3, 8); c.lineTo(4, 14); c.lineTo(8, 11); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(8, 3); c.lineTo(13, 8); c.lineTo(12, 14); c.lineTo(8, 11); c.closePath(); c.fill();
  c.fillStyle = '#8f8fa0'; c.fillRect(7, 4, 1, 6); c.fillRect(8, 4, 1, 6);
  c.fillStyle = '#4a4a58'; c.fillRect(5, 9, 2, 2); c.fillRect(9, 9, 2, 2);
};
ITEM_DRAW.shulker_box_item = (c) => {
  c.fillStyle = '#8a4fa8'; c.fillRect(2, 5, 12, 8);
  c.fillStyle = '#a86cc6'; c.fillRect(2, 3, 12, 3);
  c.fillStyle = '#e0c0f0'; c.fillRect(6, 6, 4, 3);
  c.fillStyle = '#6a3588'; c.fillRect(2, 10, 12, 1);
};
