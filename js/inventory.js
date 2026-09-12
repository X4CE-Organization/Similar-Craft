/* ============================================================
   物品栏 / 合成 / 附魔
   ============================================================ */

function makeStack(id, count = 1, meta = null) {
  const def = itemDef(id);
  if (!def) return null;
  const s = { id, count, meta: meta ? Object.assign({}, meta) : null };
  if (!s.meta && def.durability) s.meta = { dur: def.durability };
  if (!s.meta) s.meta = {};
  return s;
}
function stackDef(stack) { return stack ? itemDef(stack.id) : null; }
function maxStack(id) { const d = itemDef(id); return d ? (d.stack || 64) : 64; }
function sameItem(a, b) {
  if (!a || !b) return false;
  if (a.id !== b.id) return false;
  const ea = a.meta && a.meta.enchant, eb = b.meta && b.meta.enchant;
  if (!!ea !== !!eb) return false;
  if (ea && eb && (ea.type !== eb.type || ea.lv !== eb.lv)) return false;
  return true;
}
function copyStack(s) { return s ? { id: s.id, count: s.count, meta: s.meta ? JSON.parse(JSON.stringify(s.meta)) : null } : null; }

class Container {
  constructor(size, name) {
    this.size = size; this.name = name || '容器';
    this.slots = new Array(size).fill(null);
  }
  get(i) { return this.slots[i] || null; }
  set(i, s) { this.slots[i] = s && s.count > 0 ? s : null; }
  firstEmpty() { for (let i = 0; i < this.size; i++) if (!this.slots[i]) return i; return -1; }
  countOf(id) { let n = 0; for (const s of this.slots) if (s && s.id === id) n += s.count; return n; }
  has(id, n = 1) { return this.countOf(id) >= n; }
  addItem(id, count, meta) {
    let left = count;
    const ms = maxStack(id);
    // 先叠加到已有堆
    for (let i = 0; i < this.size && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < ms && sameItem(s, { id, meta })) {
        const add = Math.min(ms - s.count, left);
        s.count += add; left -= add;
      }
    }
    // 放入空位
    for (let i = 0; i < this.size && left > 0; i++) {
      if (!this.slots[i]) {
        const add = Math.min(ms, left);
        this.slots[i] = makeStack(id, add, meta);
        left -= add;
      }
    }
    return left;
  }
  removeItem(id, count) {
    let left = count;
    for (let i = this.size - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, left);
        s.count -= take; left -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return left === 0;
  }
  clear() { this.slots.fill(null); }
}

class PlayerInv {
  constructor() {
    this.hotbar = new Container(9, '快捷栏');
    this.main = new Container(27, '背包');
    this.armor = new Container(4, '装备');
    this.craft = new Container(9, '合成');
    this.craftOut = null;
    this.cursor = null;
    this.selected = 0;
  }
  get held() { return this.hotbar.get(this.selected); }
  set held(s) { this.hotbar.set(this.selected, s); }
  addItem(id, count, meta) {
    let left = this.hotbar.addItem(id, count, meta);
    if (left > 0) left = this.main.addItem(id, left, meta);
    return left;
  }
  countOf(id) { return this.hotbar.countOf(id) + this.main.countOf(id); }
  has(id, n = 1) { return this.countOf(id) >= n; }
  removeItem(id, n) {
    let left = n;
    const take = (c) => { const got = Math.min(left, c.countOf(id)); c.removeItem(id, got); left -= got; };
    take(this.hotbar); if (left > 0) take(this.main);
    return left === 0;
  }
  damageHeld(amount, player) {
    const s = this.held;
    if (!s) return;
    const def = stackDef(s);
    if (!def || !def.durability) return;
    if (!s.meta) s.meta = {};
    if (s.meta.dur === undefined) s.meta.dur = def.durability;
    s.meta.dur -= amount;
    if (s.meta.dur <= 0) {
      this.held = null;
      MC.sound.play('break_item');
      MC.ui.toast('工具已损坏：' + def.cn, 'bad');
    }
  }
  defense() {
    let d = 0;
    for (const s of this.armor.slots) { if (s) { const def = stackDef(s); if (def && def.defense) d += def.defense; } }
    return d;
  }
  damageArmor(amount) {
    for (let i = 0; i < 4; i++) {
      const s = this.armor.get(i);
      if (!s) continue;
      const def = stackDef(s);
      if (!def || !def.durability) continue;
      if (!s.meta) s.meta = {};
      if (s.meta.dur === undefined) s.meta.dur = def.durability;
      s.meta.dur -= amount;
      if (s.meta.dur <= 0) { this.armor.set(i, null); MC.sound.play('break_item'); }
    }
  }
  serialize() {
    const dump = (c) => c.slots.map(s => s ? [s.id, s.count, s.meta || null] : null);
    return { hotbar: dump(this.hotbar), main: dump(this.main), armor: dump(this.armor), selected: this.selected };
  }
  applySave(d) {
    if (!d) return;
    const load = (c, arr) => { if (!arr) return; arr.forEach((v, i) => { c.slots[i] = v ? { id: v[0], count: v[1], meta: v[2] || {} } : null; }); };
    load(this.hotbar, d.hotbar); load(this.main, d.main); load(this.armor, d.armor);
    this.selected = d.selected || 0;
  }
}

/* ============================================================
   合成匹配
   ============================================================ */
function normalizeShape(list, size) {
  // list: size*size 的 stack 数组 → 裁剪出最小包围盒的 id 矩阵
  let minR = size, maxR = -1, minC = size, maxC = -1;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const s = list[r * size + c];
    if (s) { minR = Math.min(minR, r); maxR = Math.max(maxR, r); minC = Math.min(minC, c); maxC = Math.max(maxC, c); }
  }
  if (maxR < 0) return { w: 0, h: 0, grid: [] };
  const w = maxC - minC + 1, h = maxR - minR + 1;
  const grid = [];
  for (let r = 0; r < h; r++) { const row = []; for (let c = 0; c < w; c++) row.push(list[(minR + r) * size + (minC + c)]); grid.push(row); }
  return { w, h, grid };
}
function ingredientMatch(stack, allowed) {
  if (!stack || !allowed) return false;
  return allowed.includes(stack.id);
}
function isPatternEmpty(ch) { return ch === ' ' || ch === '.' || ch === undefined || ch === null; }
function matchRecipe(list, size) {
  const norm = normalizeShape(list, size);
  if (!norm.w) return null;
  for (const r of RECIPES) {
    if (r.type === 'shapeless') {
      const items = [];
      for (const s of list) if (s) { for (let i = 0; i < s.count; i++) items.push(s.id); }
      const need = r.ing.slice().sort();
      const have = items.slice().sort();
      if (need.length === have.length && need.every((v, i) => v === have[i])) return r;
    } else {
      const pat = r.pattern;
      const ph = pat.length, pw = Math.max(...pat.map(p => p.length));
      if (pw !== norm.w || ph !== norm.h) continue;
      let ok = true;
      for (let rr = 0; rr < ph && ok; rr++) {
        for (let cc = 0; cc < pw; cc++) {
          const ch = pat[rr][cc];
          const stack = norm.grid[rr][cc];
          if (isPatternEmpty(ch)) { if (stack) { ok = false; break; } continue; }
          const allowed = r.key[ch];
          if (!ingredientMatch(stack, allowed)) { ok = false; break; }
          if (stack.count < 1) { ok = false; break; }
        }
      }
      if (ok) return r;
    }
  }
  return null;
}
function consumeGrid(grid, size) {
  for (let i = 0; i < size * size; i++) {
    const s = grid.get(i);
    if (s) { s.count--; if (s.count <= 0) grid.set(i, null); }
  }
}
/* 2×2 也能合成 3×3 配方（左上角对齐） */
function recipeGridFor(inv, size) {
  const grid = new Container(size * size, '合成');
  if (size === 2) {
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) grid.set(r * 2 + c, inv.craft.get(r * 3 + c));
  } else {
    for (let i = 0; i < 9; i++) grid.set(i, inv.craft.get(i));
  }
  return grid;
}
/* 计算配方所需材料（考虑多候选材料），返回 null 表示材料不足 */
function planCraft(inv, recipe) {
  const avail = new Map();
  const count = (id) => (avail.has(id) ? avail.get(id) : inv.countOf(id));
  const take = (id) => { avail.set(id, count(id) - 1); };
  if (recipe.type === 'shapeless') {
    for (const id of recipe.ing) {
      if (count(id) <= 0) return null;
      take(id);
    }
  } else {
    for (const row of recipe.pattern) {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (isPatternEmpty(ch)) continue;
        const allowed = recipe.key[ch];
        if (!allowed) return null;
        const pick = allowed.find(id => count(id) > 0);
        if (!pick) return null;
        take(pick);
      }
    }
  }
  const need = {};
  avail.forEach((left, id) => {
    const used = inv.countOf(id) - left;
    if (used > 0) need[id] = used;
  });
  return need;
}
function recipeListFor(inv, size, craftableOnly) {
  const out = [];
  for (const r of RECIPES) {
    if (craftableOnly && !planCraft(inv, r)) continue;
    out.push(r);
  }
  return out;
}
/* 一键合成：从背包取材料，直接产出 */
function craftFromInventory(inv, recipe, times = 1) {
  let made = 0;
  for (let t = 0; t < times; t++) {
    const need = planCraft(inv, recipe);
    if (!need) return made;
    for (const id in need) inv.removeItem(id, need[id]);
    const left = inv.addItem(recipe.out, recipe.count);
    if (left > 0) MC.world.spawnItem(MC.player.pos.x, MC.player.pos.y + 1, MC.player.pos.z, recipe.out, left);
    made++;
    MC.ach.crafted[recipe.out] = true;
    MC.ui.onCraft(recipe.out);
  }
  return made;
}

/* ============================================================
   附魔
   ============================================================ */
const ENCHANTS = {
  efficiency: { cn: '效率', desc: '挖掘速度提升', max: 5, applies: ['pickaxe', 'axe', 'shovel', 'hoe'] },
  fortune: { cn: '时运', desc: '矿物掉落增加', max: 3, applies: ['pickaxe'] },
  sharpness: { cn: '锋利', desc: '近战伤害提升', max: 5, applies: ['sword', 'axe'] },
  unbreaking: { cn: '耐久', desc: '更耐用', max: 3, applies: ['pickaxe', 'axe', 'shovel', 'hoe', 'sword', 'bow', 'armor'] },
  protection: { cn: '保护', desc: '减少伤害', max: 4, applies: ['armor'] },
  power: { cn: '力量', desc: '箭矢伤害提升', max: 5, applies: ['bow'] },
  knockback: { cn: '击退', desc: '攻击击退更强', max: 2, applies: ['sword'] },
};
function enchantOptions(stack, playerLevel) {
  const def = stackDef(stack);
  if (!def || !stack) return [];
  const kind = def.armor ? 'armor' : def.toolType;
  const pool = Object.keys(ENCHANTS).filter(k => ENCHANTS[k].applies.includes(kind));
  if (!pool.length) return [];
  const opts = [];
  const rng = makeRng((stack.id.length * 7919 + playerLevel * 104729 + Math.floor(Math.random() * 99991)) >>> 0);
  for (let i = 0; i < 3; i++) {
    const type = pool[Math.floor(rng() * pool.length)];
    const e = ENCHANTS[type];
    const lv = clamp(1 + Math.floor(rng() * (1 + i)), 1, e.max);
    opts.push({ type, lv, cost: 1 + i });
  }
  return opts;
}
function applyEnchant(stack, opt) {
  if (!stack) return;
  if (!stack.meta) stack.meta = {};
  stack.meta.enchant = { type: opt.type, lv: opt.lv };
}
function enchantName(stack) {
  if (!stack || !stack.meta || !stack.meta.enchant) return null;
  const e = stack.meta.enchant;
  const info = ENCHANTS[e.type];
  return info ? `${info.cn} ${'I'.repeat(e.lv)}` : null;
}
