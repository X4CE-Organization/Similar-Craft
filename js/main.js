/* ============================================================
   主程序：初始化、渲染循环、天空/昼夜/天气、菜单与存档
   ============================================================ */

const MC = {
  atlas: null, icons: null, sound: null, world: null, player: null, ui: null, entities: null, redstone: null,
  renderer: null, scene: null, camera: null, particles: null, game: null,
  settings: { renderDistance: 6, fov: 75, sensitivity: 140, volume: 0.7, dayLength: 480, music: true, particles: true },
  difficulty: 1, mode: 'survival', running: false,
  ach: { got: new Set(), placed: 0, mined: {}, crafted: {}, killedZombie: 0, killedAnimal: 0, wood: false, table: false, pick: false, stone: false, ironIngot: false, ironPick: false, farm: false, deepMined: false },
};

/* ============================================================
   维度：主世界 / 下界 / 末地
   ============================================================ */
MC.dimensions = {};

MC.getDimension = function (type) {
  if (MC.dimensions[type]) return MC.dimensions[type];
  const w = new World(MC.scene, MC.worldSeed, type);
  w.renderDistance = MC.settings.renderDistance;
  w.root.visible = false;                 // 新维度默认隐藏，避免几个维度同时渲染
  MC.dimensions[type] = w;
  if (MC.pendingSaves && MC.pendingSaves[type] && type !== 'overworld') {
    w.applySave(MC.pendingSaves[type]);
    delete MC.pendingSaves[type];
  }
  return w;
};

MC.setDimension = function (type, opts = {}) {
  if (MC.world && MC.world.type === type) return MC.world;
  const w = MC.getDimension(type);
  if (MC.world) {
    // 保存当前玩家状态并切换
    MC.world.playerSnapshot = {
      pos: { ...MC.player.pos }, yaw: MC.player.yaw, pitch: MC.player.pitch,
      vel: { ...MC.player.vel },
    };
    MC.world.root.visible = false;
  }
  MC.world = w;
  MC.player.world = w;
  MC.entities.world = w;
  MC.particles.clear && MC.particles.clear();
  w.root.visible = true;
  MC.world.mesher.setDay(1);
  if (MC.ui) {
    MC.ui.setDimensionLabel(w.dimConfig.name);
    MC.ui.setBossBar('', 0, false);
  }
  return w;
};

/* 传送：定位/建造对应传送门并移动玩家 */
MC.travel = function (targetType, silent) {
  MC.ui.showPortalOverlay(targetType);
  setTimeout(() => MC.travelNow(targetType, silent), 500);
};

/* 同步执行传送（构建/寻找传送门并移动玩家），供指令与自检使用 */
MC.travelNow = function (targetType, silent) {
  const from = MC.world, player = MC.player;
  if (player.teleportCooldown > 0) return;
  player.teleportCooldown = 3;
  let tx = player.pos.x, tz = player.pos.z, ty = player.pos.y;
  if (targetType === 'nether') { tx = Math.round(player.pos.x / 8); tz = Math.round(player.pos.z / 8); }
  else if (from.type === 'nether' && targetType === 'overworld') { tx = Math.round(player.pos.x * 8); tz = Math.round(player.pos.z * 8); }
  else if (targetType === 'end') {
    MC.setDimension('end');
    player.pos = { x: 100.5, y: 50.2, z: 0.5 };
    player.vel = { x: 0, y: 0, z: 0 };
    MC.ui.hidePortalOverlay(); MC.ui.setPortalProgress(0);
    MC.spawnEndBoss();
    MC.ui.chat('你被传送到了末地！击败末影龙才能回去。', 'sys');
    MC.ui.unlock('end');
    return;
  }
  else if (targetType === 'overworld') { tx = player.spawnPoint.x; tz = player.spawnPoint.z; }
  const w = MC.setDimension(targetType);
  // 目标世界还没有该区域时先建区块
  const cx = Math.floor(tx / CHUNK_W), cz = Math.floor(tz / CHUNK_W);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!w.getChunk(cx + dx, cz + dz)) w.createChunk(cx + dx, cz + dz);
  w.update(tx, tz, 100);
  // 找已有传送门
  let portal = MC.findPortal(w, tx, ty, tz, targetType === 'nether' ? 20 : 96);
  if (!portal) portal = MC.buildPortal(w, tx, tz, targetType);
  player.pos = { x: portal.x + 0.5, y: portal.y + 0.1, z: portal.z + 0.5 };
  player.vel = { x: 0, y: 0, z: 0 };
  player.portalTimer = 0;
  MC.ui.setPortalProgress(0);
  MC.ui.hidePortalOverlay();
  MC.world.update(player.pos.x, player.pos.z, 100);
  if (!silent) MC.ui.chat('已传送至' + MC.DIM_NAMES[targetType], 'sys');
  MC.ui.unlock(targetType === 'nether' ? 'nether' : 'end');
};
MC.DIM_NAMES = { overworld: '主世界', nether: '下界', end: '末地' };

MC.findPortal = function (w, x, y, z, radius) {
  const baseX = Math.round(x), baseZ = Math.round(z);
  // 先看目标点附近，找不到再一圈圈扩大范围
  for (let r = 0; r <= radius; r += 2) {
    for (let dx = -r; dx <= r; dx++) {
      for (const [ox, oz] of [[dx, -r], [dx, r], [-r, dx], [r, dx]]) {
        const px = baseX + ox, pz = baseZ + oz;
        const c = w.getChunkAt(px, pz);
        if (!c) continue;
        const h = c.heightmap[(pz - c.z * CHUNK_W) * CHUNK_W + (px - c.x * CHUNK_W)];
        for (let yy = Math.max(1, h - 8); yy <= Math.min(WORLD_H - 2, h + 12); yy++) {
          if (w.getBlock(px, yy, pz) === B.nether_portal) return { x: px, y: yy, z: pz };
        }
      }
    }
  }
  return null;
};

/* 在目标维度建一座 4×5 黑曜石传送门（带平台） */
MC.buildPortal = function (w, x, z, type) {
  const px = Math.round(x), pz = Math.round(z);
  const c = w.getChunkAt(px, pz);
  let groundY = 40;
  if (c) {
    const h = c.heightmap[(pz - c.z * CHUNK_W) * CHUNK_W + (px - c.x * CHUNK_W)];
    groundY = clamp(h + 1, 6, WORLD_H - 10);
  }
  // 平台
  for (let dx = -2; dx <= 3; dx++) for (let dz = -2; dz <= 2; dz++) w.setBlock(px + dx, groundY - 1, pz + dz, B.obsidian, {});
  // 清出一个安全的房间，避免玩家一进来就被埋在下界岩里
  for (let dx = -1; dx <= 4; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy <= 4; dy++) {
    const isFrame = (dx === 0 || dx === 3) || (dy === 0 || dy === 4);
    if (isFrame) continue;
    w.setBlock(px + dx, groundY + dy, pz + dz, 0, { noFluid: true });
  }
  // 门框（沿 x 轴方向）
  for (let dx = 0; dx <= 3; dx++) {
    w.setBlock(px + dx, groundY, pz, B.obsidian, {});
    w.setBlock(px + dx, groundY + 4, pz, B.obsidian, {});
  }
  for (let dy = 0; dy <= 4; dy++) {
    w.setBlock(px, groundY + dy, pz, B.obsidian, {});
    w.setBlock(px + 3, groundY + dy, pz, B.obsidian, {});
  }
  for (let dy = 1; dy <= 3; dy++) for (let dx = 1; dx <= 2; dx++) {
    w.setBlock(px + dx, groundY + dy, pz, B.nether_portal, { noSupport: true });
  }
  // 传送门两侧各留一格空间
  for (let dx = 1; dx <= 2; dx++) for (let dy = 1; dy <= 3; dy++) {
    w.setBlock(px + dx, groundY + dy, pz - 1, 0, { noFluid: true });
    w.setBlock(px + dx, groundY + dy, pz + 1, 0, { noFluid: true });
  }
  return { x: px + 1, y: groundY + 1, z: pz };
};

/* 末地 Boss 生成 */
MC.spawnEndBoss = function () {
  const w = MC.world;
  if (w.type !== 'end' || w.bossSpawned) return;
  w.bossSpawned = true;
  // 预生成中央区域，保证柱子/传送门已存在
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (!w.getChunk(dx, dz)) w.createChunk(dx, dz);
  w.update(0, 0, 100);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU;
    const px = Math.round(Math.cos(a) * 42), pz = Math.round(Math.sin(a) * 42);
    const top = 66 + Math.floor(hash3(i, 1, 0, w.seed + 3) * 12) + 2;
    w.crystals.push(new EndCrystal(w, px + 0.5, top, pz + 0.5));
  }
  const dragon = new EnderDragon(w);
  w.mobs.push(dragon);
  MC.ui.setBossBar('末影龙', 1, true);
  MC.ui.chat('末影龙出现了！摧毁末影水晶（右键/左键攻击）可以阻止它回血。', 'warn');
};

MC.onDragonDefeated = function () {
  MC.ui.chat('★ 你击败了末影龙！中央出现了返回传送门，跳进去即可回到主世界。', 'sys');
  MC.ach.dragonDefeated = true;
  setTimeout(() => { if (MC.world.type === 'end') MC.ui.showCredits(); }, 2500);
};

/* 贴图/渲染自检：在玩家正前方放一个工作台，渲染后采样屏幕中央像素 */
MC.renderCheck = function () {
  const p = MC.player, w = MC.world;
  const bx = Math.floor(p.pos.x) + Math.round(-Math.sin(p.yaw) * 2.5);
  const bz = Math.floor(p.pos.z) + Math.round(-Math.cos(p.yaw) * 2.5);
  const by = Math.floor(p.pos.y + 1);
  const saved = { block: w.getBlock(bx, by, bz), pos: p.pos, pitch: p.pitch, flying: p.flying };
  try {
    w.setBlock(bx, by, bz, B.crafting_table, { noRecord: true });
    for (let i = 0; i < 6; i++) w.update(p.pos.x, p.pos.z, 1);
    MC.game.updateSky(0.02);                       // 先刷新天空/雾，颜色才对得上
    MC.renderer.render(MC.scene, MC.camera);
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 40;
    const cx = cv.getContext('2d');
    cx.drawImage(MC.renderer.domElement, 0, 0, 64, 40);
    const d = cx.getImageData(30, 19, 4, 2).data;
    let R = 0, G = 0, B2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B2 += d[i + 2]; n++; }
    R /= n; G /= n; B2 /= n;
    const tile = MC.atlas.tileCanvas(T.CRAFT_TOP).getContext('2d').getImageData(0, 0, 16, 16).data;
    let tr = 0, tg = 0, tb = 0, tn = 0;
    for (let i = 0; i < tile.length; i += 4) { tr += tile[i]; tg += tile[i + 1]; tb += tile[i + 2]; tn++; }
    const tileLum = (tr + tg + tb) / tn / 3;
    // 准星射线实际打到了什么（用于判断是“没渲染”还是“本来就没瞄准方块”）
    const eye = p.eyePos, look = p.lookDir();
    const rhit = w.raycast(eye.x, eye.y, eye.z, look.x, look.y, look.z, 6);
    const aimed = rhit.hit ? (BLOCKS[w.getBlock(rhit.x, rhit.y, rhit.z)].cn + '@' + rhit.dist.toFixed(1)) : '空气';
    // 顺便检查这个方块有没有真的进入“当前生效的区块网格”
    let inMesh = 0;
    const ch2 = w.getChunkAt(bx, bz);
    if (ch2 && ch2.meshOpaque) {
      const lp = ch2.meshOpaque.geometry.getAttribute('position');
      const lx0 = bx - ch2.x * CHUNK_W, lz0 = bz - ch2.z * CHUNK_W;
      for (let i = 0; i < lp.count; i++) {
        const x = lp.getX(i), y = lp.getY(i), z = lp.getZ(i);
        if (x >= lx0 - 0.01 && x <= lx0 + 1.01 && y >= by - 0.01 && y <= by + 1.01 && z >= lz0 - 0.01 && z <= lz0 + 1.01) inMesh++;
      }
    }
    const brown = R > B2 + 15;
    const magenta = R > 150 && B2 > 150 && G < 110;         // 缺贴图的洋红黑格
    let msg = '准星处像素 ' + [R, G, B2].map(v => v.toFixed(0)).join('/') + '（贴图平均亮度 ' + tileLum.toFixed(0) + '）';
    msg += '；该方块在网格中的顶点数=' + inMesh + '；准星射线命中=' + aimed;
    if (magenta) msg += ' —— 这是“缺贴图”的洋红格子，说明方块贴图索引错了。';
    else if (inMesh === 0) msg += ' —— 方块没有进入网格（重建没跟上），这是程序 bug，请把这段发给我。';
    else if (!brown) msg += ' —— 方块没有出现在准星处（可能没被渲染，或你正前方不是空地）。请转身面对一片空地再试一次，并把这段文字发给开发者。';
    return { ok: brown, magenta, rgb: [R, G, B2].map(v => v.toFixed(0)).join('/'), msg };
  } finally {
    w.setBlock(bx, by, bz, saved.block, { noRecord: true });
    p.pos = saved.pos; p.pitch = saved.pitch; p.flying = saved.flying;
  }
};

/* 末影之眼：朝要塞方向飞出 */
MC.throwEyeOfEnder = function (eye) {
  const p = MC.player;
  const SX = -176.5, SZ = 144.5;
  MC.player.inv.removeItem('eye_of_ender', 1);
  MC.player.inv.damageHeld(0, MC.player);
  const e = new EyeProjectile(MC.world, eye.x, eye.y + 0.4, eye.z, SX - p.pos.x, SZ - p.pos.z);
  MC.world.arrows.push(e);
  MC.sound.play('bow', eye.x, eye.y, eye.z);
  const d = Math.hypot(SX - p.pos.x, SZ - p.pos.z);
  MC.ui.chat('末影之眼朝着要塞方向飞去…（距离约 ' + Math.round(d) + ' 格，坐标 ' + Math.round(SX) + ',' + Math.round(SZ) + '）', 'sys');
  MC.ui.updateHotbar();
};

/* ============================================================
   指令系统
   ============================================================ */
class Commands {
  exec(raw) {
    const line = raw.trim();
    const ui = MC.ui;
    if (!line.startsWith('/')) {
      ui.chat('<b>你：</b>' + this.escape(line));
      return;
    }
    const p = line.slice(1).split(/\s+/);
    const cmd = (p[0] || '').toLowerCase();
    const player = MC.player;
    const ok = (m) => ui.chat(m, 'sys');
    const err = (m) => ui.chat(m, 'err');
    try {
      switch (cmd) {
        case 'help':
          ui.chat('可用指令：/time set day|night · /weather clear|rain · /give <物品> [数量] · /tp <x> <y> <z> · /gamemode creative|survival · /difficulty 0-2 · /summon <生物> [数量] · /kill · /heal · /fly · /xp <n> · /seed · /rendercheck（贴图自检）· /clear · /day', 'sys');
          break;
        case 'time':
          if (p[1] === 'set') {
            const v = p[2];
            if (v === 'day' || v === 'noon') MC.world.time = v === 'day' ? 0.27 : 0.5;
            else if (v === 'night' || v === 'midnight') MC.world.time = 0.78;
            else if (v === 'sunset') MC.world.time = 0.72;
            else if (v === 'sunrise') MC.world.time = 0.26;
            ok('时间已设置为 ' + v);
          } else ok('当前时间 ' + (MC.world.time * 24).toFixed(1) + ' 时，第 ' + MC.world.dayCount + ' 天');
          break;
        case 'weather':
          if (p[1] === 'rain') { MC.world.weather.rain = true; ok('开始下雨'); }
          else if (p[1] === 'thunder') { MC.world.weather.rain = true; MC.world.weather.thunder = 1; ok('雷雨来了'); }
          else { MC.world.weather.rain = false; ok('天气转晴'); }
          break;
        case 'give': {
          const id = this.findItem(p[1]);
          const n = parseInt(p[2] || '1', 10);
          if (!id) { err('未知物品：' + p[1]); break; }
          const left = player.inv.addItem(id, n);
          if (left) MC.world.spawnItem(player.pos.x, player.pos.y + 1, player.pos.z, id, left);
          MC.ui.updateHotbar();
          ok('已给予 ' + itemName(id) + ' ×' + n);
          break;
        }
        case 'tp':
          player.pos.x = parseFloat(p[1]); player.pos.y = parseFloat(p[2]); player.pos.z = parseFloat(p[3]);
          player.vel = { x: 0, y: 0, z: 0 };
          ok('已传送到 ' + p.slice(1, 4).join(' '));
          break;
        case 'gamemode':
        case 'gm': {
          const m = (p[1] || '').toLowerCase();
          const val = (m === 'creative' || m === '1' || m === 'c') ? 'creative' : 'survival';
          MC.setGamemode(val);
          ok('游戏模式：' + (val === 'creative' ? '创造' : '生存'));
          break;
        }
        case 'difficulty':
        case 'diff': {
          const d = clamp(parseInt(p[1] || '1', 10) || 0, 0, 2);
          MC.difficulty = d;
          ok('难度：' + ['和平', '普通', '困难'][d]);
          break;
        }
        case 'summon': {
          const type = (p[1] || '').toLowerCase();
          if (!MOB_TYPES[type]) { err('未知生物，可用：' + Object.keys(MOB_TYPES).join(' / ')); break; }
          const n = clamp(parseInt(p[2] || '1', 10), 1, 20);
          const dir = player.lookDir();
          for (let i = 0; i < n; i++) {
            const mob = new Mob(MC.world, type, player.pos.x + dir.x * (4 + i) + (Math.random() - 0.5), player.pos.y + 1, player.pos.z + dir.z * (4 + i) + (Math.random() - 0.5));
            MC.world.mobs.push(mob);
          }
          ok(`召唤了 ${n} 只 ${MOB_TYPES[type].cn}`);
          break;
        }
        case 'kill':
          if (p[1] === 'mobs' || p[1] === '@e') {
            MC.world.mobs.forEach(m => { m.remove = true; });
            ok('已清除所有生物');
          } else { player.hurt(1000, null, '指令'); }
          break;
        case 'heal': player.health = player.maxHealth; player.hunger = 20; player.air = 300; MC.ui.updateStats(); ok('已恢复满血'); break;
        case 'fly': player.flying = !player.flying; ok('飞行：' + (player.flying ? '开' : '关')); break;
        case 'xp': player.addXP(parseInt(p[1] || '10', 10) || 10); ok('获得经验'); break;
        case 'clear':
          player.inv.hotbar.clear(); player.inv.main.clear(); player.inv.armor.clear();
          MC.ui.updateHotbar(); ok('背包已清空'); break;
        case 'seed': ok('当前种子：' + MC.world.seed); break;
        case 'rendercheck':
        case 'checktex': {
          const r = MC.renderCheck();
          if (r.ok) ok('贴图自检：正常 ✓　工作台中心像素 RGB ' + r.rgb + '（贴图应为棕色）');
          else err('贴图自检：异常 ✗　' + r.msg);
          break;
        }
        case 'dimension':
        case 'dim': {
          const target = (p[1] || '').toLowerCase();
          const map = { overworld: 'overworld', main: 'overworld', 主世界: 'overworld', nether: 'nether', 下界: 'nether', end: 'end', 末地: 'end', the_end: 'end' };
          const t = map[target];
          if (!t) { err('用法：/dimension overworld|nether|end'); break; }
          player.teleportCooldown = 0;
          MC.travelNow(t, false);
          ok('已切换到' + MC.DIM_NAMES[t]);
          break;
        }
        case 'locate': {
          if ((p[1] || '').startsWith('end') || (p[1] || '').startsWith('strong')) {
            ok('要塞（末地传送门）位于 x=-176, z=144 附近的地下 y=24。用末影之眼可以指路，或直接 /tp -176 24 144');
          } else ok('可定位：/locate stronghold（末地传送门）');
          break;
        }
        case 'day': MC.world.time = 0.27; ok('天亮了'); break;
        case 'spawn':
          player.spawnPoint = { x: player.pos.x, y: player.pos.y, z: player.pos.z };
          ok('重生点已设置'); break;
        default: err('未知指令：/' + cmd + '（输入 /help 查看帮助）');
      }
    } catch (e) {
      err('指令执行出错：' + e.message);
    }
  }
  escape(s) { return s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
  findItem(name) {
    if (!name) return null;
    const n = name.toLowerCase();
    if (B[name] !== undefined) return name;
    if (ITEMS[name]) return name;
    for (const id in ITEMS) if (ITEMS[id].en && ITEMS[id].en.toLowerCase() === n) return id;
    for (const b of BLOCKS) if (b && (b.en || '').toLowerCase() === n) return b.name;
    for (const id in ITEMS) if (ITEMS[id].cn === name || id.includes(n)) return id;
    for (const b of BLOCKS) if (b && (b.cn === name || b.name.includes(n))) return b.name;
    return null;
  }
}

/* ============================================================
   游戏主循环
   ============================================================ */
class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.fps = 0; this.frames = 0; this.fpsTimer = 0;
    this.paused = false; this.autoSaveTimer = 30;
    this.lastTime = performance.now();
    this.skyObjects = {};
    this.rain = null;
  }
  initRenderer() {
    MC.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    MC.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    MC.renderer.setSize(window.innerWidth, window.innerHeight, false);
    MC.renderer.setClearColor(0x87c5ff);
    MC.scene = new THREE.Scene();
    MC.scene.background = new THREE.Color(0x87c5ff);
    MC.camera = new THREE.PerspectiveCamera(MC.settings.fov, window.innerWidth / window.innerHeight, 0.06, 1000);
    MC.camera.rotation.order = 'YXZ';       // 先偏航再俯仰，视角不会越转越歪
    MC.scene.add(MC.camera);                 // ★ 相机必须进场景，挂在它身上的手持物品才会被渲染
    window.addEventListener('resize', () => {
      MC.camera.aspect = window.innerWidth / window.innerHeight;
      MC.camera.updateProjectionMatrix();
      MC.renderer.setSize(window.innerWidth, window.innerHeight, false);
    });
    // 实体光照
    this.ambient = new THREE.AmbientLight(0xffffff, 0.7);
    MC.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffffff, 0.8);
    MC.scene.add(this.sun);
    MC.scene.fog = new THREE.Fog(0x87c5ff, 60, 120);
  }
  initSky() {
    // 太阳
    const sunTex = this.glowTexture('#fff9d0', '#ffd45e');
    const moonTex = this.glowTexture('#e8f0ff', '#9fb0d0');
    this.skyObjects.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false }));
    this.skyObjects.sun.scale.set(60, 60, 1);
    this.skyObjects.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, transparent: true, depthWrite: false, fog: false }));
    this.skyObjects.moon.scale.set(34, 34, 1);
    MC.scene.add(this.skyObjects.sun); MC.scene.add(this.skyObjects.moon);
    // 星空
    const starGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 900; i++) {
      const a = Math.random() * TAU, b = Math.acos(Math.random() * 2 - 1), r = 380;
      pts.push(Math.sin(b) * Math.cos(a) * r, Math.cos(b) * r * 0.9 + 40, Math.sin(b) * Math.sin(a) * r);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.skyObjects.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false }));
    MC.scene.add(this.skyObjects.stars);
    // 云
    const cloudTex = this.cloudTexture();
    const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.skyObjects.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), cloudMat);
    this.skyObjects.clouds.rotation.x = -Math.PI / 2;
    this.skyObjects.clouds.position.y = 108;
    MC.scene.add(this.skyObjects.clouds);
    // 雨
    const rainCount = 1600;
    const rgeo = new THREE.BufferGeometry();
    const rpos = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rpos[i * 3] = (Math.random() - 0.5) * 44;
      rpos[i * 3 + 1] = Math.random() * 24;
      rpos[i * 3 + 2] = (Math.random() - 0.5) * 44;
    }
    rgeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
    this.rain = new THREE.Points(rgeo, new THREE.PointsMaterial({ color: 0xa8d0ff, size: 0.09, transparent: true, opacity: 0.65, fog: false }));
    this.rain.visible = false;
    MC.scene.add(this.rain);
    // 方块选中框
    const boxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.highlight = new THREE.LineSegments(boxGeo, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthTest: true }));
    this.highlight.visible = false;
    MC.scene.add(this.highlight);
    if (MC.camera.parent !== MC.scene) MC.scene.add(MC.camera);
  }
  glowTexture(inner, outer) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    g.addColorStop(0, inner); g.addColorStop(0.35, inner); g.addColorStop(0.55, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  cloudTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * 128, y = Math.random() * 128, w = 12 + Math.random() * 34, h = 8 + Math.random() * 18;
      ctx.fillRect(x, y, w, h);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 3); t.magFilter = THREE.NearestFilter;
    return t;
  }

  /* ---------- 世界启动 ---------- */
  startWorld(seedStr, mode, difficulty, save) {
    MC.mode = mode; MC.difficulty = difficulty;
    // 种子：读档时直接沿用数字种子；玩家输入纯数字则直接作为种子，其余文本做哈希
    let seed;
    if (save && typeof save.seed === 'number') seed = save.seed >>> 0;
    else {
      const s = seedStr === undefined || seedStr === null ? '' : String(seedStr).trim();
      if (!s) seed = (Math.random() * 4294967295) >>> 0;
      else if (/^\d{1,10}$/.test(s)) seed = parseInt(s, 10) >>> 0;
      else seed = hashStr(s);
    }
    // 清空旧世界
    if (MC.world) { MC.scene.clear(); this.initSky(); MC.scene.add(MC.camera); }
    MC.world = new World(MC.scene, seed);
    MC.worldSeed = seed;
    MC.dimensions = { overworld: MC.world };
    MC.world.renderDistance = MC.settings.renderDistance;
    MC.world.time = 0.28;      // 清晨开局
    MC.particles = new Particles(MC.scene);
    MC.redstone = new Redstone(MC.world);
    MC.entities = new EntityManager(MC.world);
    MC.player = new Player(MC.world, MC.camera);
    MC.player.attachInput(this.canvas);
    MC.ui = new UI(this);
    MC.ui.init();
    MC.ui.game = this;
    MC.commands = new Commands();
    MC.world.mesher.setDay(1);
    // 出生点
    const spawn = MC.world.gen.findSpawn();
    MC.player.pos = { x: spawn.x, y: spawn.y + 1, z: spawn.z };
    MC.player.spawnPoint = { x: spawn.x, y: spawn.y + 1, z: spawn.z };
    MC.player.creative = (mode === 'creative');
    if (save) {
      MC.world.applySave(save.worlds && save.worlds.overworld ? save.worlds.overworld : save);
      // 其它维度的改动等它们被创建时再应用
      MC.pendingSaves = save.worlds || null;
      if (save.player) {
        MC.player.pos = save.player.pos || MC.player.pos;
        MC.player.spawnPoint = save.player.spawnPoint || MC.player.spawnPoint;
        MC.player.creative = save.player.creative;
        MC.player.health = save.player.health ?? 20;
        MC.player.hunger = save.player.hunger ?? 20;
        MC.player.level = save.player.level || 0;
        MC.player.xp = save.player.xp || 0;
      }
      MC.player.inv.applySave(save.inventory);
      // 先切回存档时所在的维度（下界/末地坐标和主世界完全不同）
      if (save.dimension && save.dimension !== 'overworld') {
        MC.setDimension(save.dimension);
        MC.player.world = MC.world;
        MC.player.pos = save.player.pos || MC.player.pos;
      }
      if (save.ach) { MC.ach.got = new Set(save.ach.got || []); Object.assign(MC.ach, save.ach.stats || {}); MC.ach.got = new Set(save.ach.got || []); }
      MC.difficulty = save.difficulty ?? difficulty;
      MC.mode = save.mode || mode;
    } else {
      // 初始物品
      if (mode === 'survival') { /* 空手开始，更有生存感 */ }
    }
    // 预生成出生点周围区块
    const pcx = Math.floor(MC.player.pos.x / CHUNK_W), pcz = Math.floor(MC.player.pos.z / CHUNK_W);
    let done = 0;
    const targets = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) targets.push([pcx + dx, pcz + dz]);
    targets.sort((a, b) => (Math.abs(a[0] - pcx) + Math.abs(a[1] - pcz)) - (Math.abs(b[0] - pcx) + Math.abs(b[1] - pcz)));
    for (const [cx, cz] of targets) { if (!MC.world.getChunk(cx, cz)) MC.world.createChunk(cx, cz); }
    MC.world.update(MC.player.pos.x, MC.player.pos.z, 100);
    if (!save) {
      // 新世界：从地表上方落下
      MC.player.pos.y = MC.world.gen.heightAt(Math.floor(MC.player.pos.x), Math.floor(MC.player.pos.z), MC.world.gen.biomeAt(Math.floor(MC.player.pos.x), Math.floor(MC.player.pos.z))) + 1.2;
      MC.player.spawnPoint.y = MC.player.pos.y;
    } else {
      // 读档：保留存档里的坐标，只在卡进方块里时往上顶
      for (let i = 0; i < 80; i++) {
        const inBlock = MC.world.collideAt(MC.player.pos.x, MC.player.pos.y, MC.player.pos.z, MC.player.width, MC.player.height);
        if (!inBlock) break;
        MC.player.pos.y += 0.5;
      }
      MC.world.update(MC.player.pos.x, MC.player.pos.z, 20);
    }
    MC.running = true;
    MC.installAutoSaveHooks();
    MC.installLockWatchers();
    MC.ui.updateHotbar(); MC.ui.updateStats();
    MC.ui.chat('欢迎来到 <b>西密乐方块世界</b>（Similar Craft）！制作人：武士芝士', 'sys');
    MC.ui.chat('世界种子 ' + seed + '　输入 /help 查看世界指令', 'sys');
    MC.ui.chat('提示：砍树 → 工作台 → 木镐 → 挖石头 → 熔炼铁锭。按 T 聊天，E 打开背包。', 'sys');
    MC.ui.chat('一天 8 分钟（设置里可调）：天黑了会刷怪，记得造房子或插火把。', 'sys');
    MC.ui.chat('吃东西：把食物拿在手上，按住鼠标右键 1.3 秒（饿了才吃得上，下方有进度条）。', 'sys');
  }
  togglePause() {
    if (!MC.running) return;
    this.paused = !this.paused;
    document.getElementById('pause').classList.toggle('hidden', !this.paused);
    if (!this.paused) MC.lockMouse();
    if (this.paused) {
      document.getElementById('pauseInfo').textContent = `种子 ${MC.world.seed}　第 ${MC.world.dayCount} 天　坐标 ${MC.player.pos.x.toFixed(0)}, ${MC.player.pos.y.toFixed(0)}, ${MC.player.pos.z.toFixed(0)}`;
      MC.ui.centerVirtualCursor();
    } else MC.lockMouse();
  }

  /* ---------- 主循环 ---------- */
  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    let dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.frames++; this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) { this.fps = Math.round(this.frames / this.fpsTimer); this.frames = 0; this.fpsTimer = 0; }
    if (!MC.running) { if (MC.renderer) MC.renderer.render(MC.scene, MC.camera); return; }
    if (!this.paused && MC.player.alive) this.update(dt * MC.settings.speedMultiplier || dt);
    else if (!MC.player.alive) { /* 死亡时仍渲染 */ }
    MC.ui.tick(dt);
    MC.sound.tickMusic(dt);
    this.render();
    this.autoSave(dt);
  }
  render() {
    // 相机抖动
    const ui = MC.ui;
    if (ui.shakeAmount > 0) {
      MC.camera.position.x += (Math.random() - 0.5) * ui.shakeAmount * 0.4;
      MC.camera.position.y += (Math.random() - 0.5) * ui.shakeAmount * 0.4;
      MC.camera.position.z += (Math.random() - 0.5) * ui.shakeAmount * 0.4;
    }
    MC.renderer.render(MC.scene, MC.camera);
  }
  update(dt) {
    const w = MC.world, p = MC.player;
    w.update(p.pos.x, p.pos.z, 1);
    p.update(dt);
    MC.entities.update(dt, p);
    MC.redstone.tick(dt);
    MC.particles.tick(dt);
    w.tick(dt, p);
    this.updateSky(dt);
    this.updateHighlight();
    // 水下效果
    const headBlock = w.getBlock(Math.floor(p.pos.x), Math.floor(p.eyePos.y), Math.floor(p.pos.z));
    const underwater = headBlock === B.water;
    w.mesher.setTime(performance.now() / 1000, underwater);
  }
  updateSky(dt) {
    const w = MC.world;
    const dim = w.dimConfig;
    // 共享材质：写入本维度的环境光
    [w.mesher.matOpaque.userData.uniforms, w.mesher.matTransparent.userData.uniforms]
      .forEach(u => { u.uAmbient.value = dim.ambient; });
    const t = w.time;
    const elev = Math.sin((t - 0.25) * TAU);           // -1 午夜, 1 正午
    const rain = (dim.weather && w.weather.rain) ? 1 : 0;
    let day = dim.hasSun ? clamp(elev * 1.5 + 0.35, 0.13, 1) * (1 - rain * 0.45) : 1;
    day = Math.max(0.11, day);
    w.mesher.setDay(day);
    // 非主世界：固定氛围色（下界红雾 / 末地紫黑）
    if (!dim.hasSun) {
      const fogC = new THREE.Color(dim.fog[0], dim.fog[1], dim.fog[2]);
      const R1 = w.renderDistance;
      const far1 = Math.max(44, (R1 - 0.4) * 16 * dim.fogScale);
      const near1 = far1 * 0.45;
      [w.mesher.matOpaque.userData.uniforms, w.mesher.matTransparent.userData.uniforms].forEach(u => {
        u.fogColor.value.copy(fogC); u.fogNear.value = near1; u.fogFar.value = far1;
      });
      MC.scene.background = fogC;
      MC.scene.fog.color.copy(fogC); MC.scene.fog.near = near1; MC.scene.fog.far = far1;
      this.skyObjects.sun.visible = false;
      this.skyObjects.moon.visible = false;
      this.skyObjects.stars.visible = false;
      this.skyObjects.clouds.visible = false;
      if (this.rain) this.rain.visible = false;
      this.ambient.intensity = dim.ambient * 4.2;
      this.sun.intensity = dim.ambient * 3.2;
      this.sun.position.set(MC.player.pos.x + 20, MC.player.pos.y + 40, MC.player.pos.z + 20);
      const headBlock = w.getBlock(Math.floor(MC.player.pos.x), Math.floor(MC.player.eyePos.y), Math.floor(MC.player.pos.z));
      w.mesher.setTime(performance.now() / 1000, headBlock === B.water);
      return;
    }
    this.skyObjects.sun.visible = true;
    this.skyObjects.moon.visible = true;
    this.skyObjects.clouds.visible = true;
    // 天空颜色
    const night = [0.05, 0.07, 0.16], dusk = [0.85, 0.45, 0.28], dayC = [0.52, 0.72, 1.0];
    let sky;
    if (elev > 0.22) sky = dayC;
    else if (elev > -0.12) {
      const k = (elev + 0.12) / 0.34;
      sky = k < 0.5 ? [lerp(night[0], dusk[0], k * 2), lerp(night[1], dusk[1], k * 2), lerp(night[2], dusk[2], k * 2)]
        : [lerp(dusk[0], dayC[0], (k - 0.5) * 2), lerp(dusk[1], dayC[1], (k - 0.5) * 2), lerp(dusk[2], dayC[2], (k - 0.5) * 2)];
    } else sky = night;
    sky = sky.map(c => c * (1 - rain * 0.4));
    const headBlock = w.getBlock(Math.floor(MC.player.pos.x), Math.floor(MC.player.eyePos.y), Math.floor(MC.player.pos.z));
    const underwater = headBlock === B.water;
    const fogBase = underwater ? [0.05, 0.18, 0.42] : sky;
    const col = new THREE.Color(fogBase[0], fogBase[1], fogBase[2]);
    MC.scene.background = col;
    const R = w.renderDistance;
    const fogFar = underwater ? 22 : Math.max(38, (R - 0.6) * 16);
    const fogNear = underwater ? 2 : fogFar * 0.62;
    const fu = w.mesher.fogUniforms();
    [w.mesher.matOpaque.userData.uniforms, w.mesher.matTransparent.userData.uniforms].forEach(u => {
      u.fogColor.value.copy(col); u.fogNear.value = fogNear; u.fogFar.value = fogFar;
    });
    MC.scene.fog.color.copy(col); MC.scene.fog.near = fogNear; MC.scene.fog.far = fogFar;
    // 太阳/月亮位置
    const sunAngle = (t - 0.25) * TAU;
    const dist = 420;
    const px = MC.player.pos.x, pz = MC.player.pos.z;
    this.skyObjects.sun.position.set(px + Math.cos(sunAngle) * dist, MC.player.pos.y + Math.sin(sunAngle) * dist, pz + dist * 0.35);
    this.skyObjects.moon.position.set(px - Math.cos(sunAngle) * dist, MC.player.pos.y - Math.sin(sunAngle) * dist, pz - dist * 0.35);
    this.skyObjects.sun.material.opacity = clamp(elev + 0.35, 0, 1);
    this.skyObjects.moon.material.opacity = clamp(-elev + 0.35, 0, 1);
    this.skyObjects.stars.material.opacity = clamp(0.9 - day, 0, 1) * (1 - rain * 0.8);
    this.skyObjects.stars.visible = this.skyObjects.stars.material.opacity > 0.02;
    this.skyObjects.stars.position.set(px, MC.player.pos.y, pz);
    this.skyObjects.clouds.position.set(px, 108, pz);
    this.skyObjects.clouds.material.opacity = 0.55 * (0.4 + day) * (1 + rain * 0.4);
    // 实体光照
    this.ambient.intensity = 0.22 + day * 0.85;
    this.sun.intensity = 0.25 + day * 0.85;
    this.sun.position.set(px + Math.cos(sunAngle) * 60, MC.player.pos.y + Math.sin(sunAngle) * 60, pz + 20);
    // 雷雨
    if (w.weather.thunder > 0 && Math.random() < 0.02) {
      this.ambient.intensity = 2.5; this.sun.intensity = 2.5;
    }
    // 雨雪粒子
    if (this.rain && dim.weather) {
      const biome = w.gen.biomeAt(Math.floor(px), Math.floor(pz));
      const snow = biome === BIOME.SNOW;
      this.rain.visible = w.weather.rain;
      if (this.rain.visible) {
        const pos = this.rain.geometry.attributes.position;
        const speed = snow ? 4 : 22;
        for (let i = 0; i < pos.count; i++) {
          let y = pos.getY(i) - speed * dt;
          let x = pos.getX(i) + (snow ? Math.sin(performance.now() / 500 + i) * 0.02 : 0.02);
          if (y < 0) { y = 22 + Math.random() * 4; x = (Math.random() - 0.5) * 44; pos.setZ(i, (Math.random() - 0.5) * 44); }
          pos.setX(i, x); pos.setY(i, y);
        }
        pos.needsUpdate = true;
        this.rain.material.color.setHex(snow ? 0xffffff : 0xa8d0ff);
        this.rain.material.size = snow ? 0.13 : 0.09;
        this.rain.position.set(px, MC.player.pos.y - 4, pz);
      }
    }
  }
  updateHighlight() {
    const hit = MC.ui.highlight;
    if (!hit || !hit.hit) { this.highlight.visible = false; return; }
    this.highlight.visible = true;
    this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  }
  autoSave(dt) {
    this.autoSaveTimer -= dt;
    if (this.autoSaveTimer <= 0) { this.autoSaveTimer = 30; MC.saveWorld(true); }
  }
}

/* ============================================================
   存档
   ============================================================ */
/* 鼠标锁定：进游戏、关闭容器界面后自动锁回鼠标（原版行为） */
MC.isMouseLocked = function () {
  const cv = MC.renderer && MC.renderer.domElement;
  return !!cv && (document.pointerLockElement === cv || document.webkitPointerLockElement === cv);
};
/* 有任意弹窗/菜单打开时不锁鼠标（主菜单、暂停、设置、成就、死亡、通关…） */
MC.anyOverlayOpen = function () {
  if (MC.ui && MC.ui.screenOpen) return true;
  if (MC.game && MC.game.paused) return true;
  const ids = ['menu', 'loading', 'pause', 'settings', 'help', 'ach', 'death', 'credits'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden')) return true;
  }
  return false;
};
MC.lockMouse = function (retry) {
  try {
    const cv = MC.renderer && MC.renderer.domElement;
    if (!cv || MC.isMouseLocked()) return true;
    if (MC.anyOverlayOpen()) return false;
    if (MC.ui && MC.ui.chatOpen && MC.ui.chatOpen()) return false;
    const fn = cv.requestPointerLock || cv.webkitRequestPointerLock;
    if (!fn) return false;
    const r = fn.call(cv);
    if (r && r.catch) r.catch(() => { if (retry) MC.showLockHint(true); });
    MC._lastLockedAt = performance.now();
    return true;
  } catch (e) { return false; }
};
/* 没锁上时画一个“点击继续”提示（和原版一样） */
MC.showLockHint = function (force) {
  let el = document.getElementById('lockHint');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lockHint';
    el.textContent = '点击画面即可继续操作鼠标';
    document.body.appendChild(el);
  }
  const unlockedTooLong = (performance.now() - (MC._lastLockedAt || 0)) > 1200;
  const shouldShow = MC.running && !MC.isMouseLocked() && !MC.anyOverlayOpen() && (force || unlockedTooLong);
  el.style.display = shouldShow ? 'block' : 'none';
  if (MC.isMouseLocked()) MC._lastLockedAt = performance.now();
};
MC.showLockHintSoon = function () { MC._lastLockedAt = performance.now(); if (MC.showLockHint) MC.showLockHint(); };
MC.installLockWatchers = function () {
  if (MC._lockWatchers) return;
  MC._lockWatchers = true;
  document.addEventListener('pointerlockchange', () => { if (MC.isMouseLocked()) MC._lastLockedAt = performance.now(); MC.showLockHint(); });
  document.addEventListener('webkitpointerlockchange', () => { if (MC.isMouseLocked()) MC._lastLockedAt = performance.now(); MC.showLockHint(); });
  // 任何一次点击或按键都尝试锁回（浏览器要求用户手势）
  document.addEventListener('mousedown', () => { if (MC.running) MC.lockMouse(true); }, true);
  document.addEventListener('keydown', (e) => {
    if (!MC.running) return;
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
    if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'F11') return;
    MC.lockMouse(true);
  }, true);
  setInterval(() => MC.showLockHint(), 700);
};
MC.unlockMouse = function () {
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { }
};

MC.installAutoSaveHooks = function () {
  if (MC._autoSaveHooked) return;
  MC._autoSaveHooked = true;
  const saveNow = () => { try { if (MC.running && MC.world && MC.player.alive) MC.saveWorld(true); } catch (e) { } };
  window.addEventListener('beforeunload', saveNow);
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
};

MC.saveWorld = function (silent) {
  if (!MC.world) return;
  try {
    const data = MC.world.serialize();
    // 每个维度各自的方块改动分别保存（同名坐标在不同维度是不同方块）
    data.worlds = {};
    for (const t in MC.dimensions) { if (MC.dimensions[t]) data.worlds[t] = MC.dimensions[t].serialize(); }
    data.player = {
      pos: MC.player.pos, spawnPoint: MC.player.spawnPoint, creative: MC.player.creative,
      health: MC.player.health, hunger: MC.player.hunger, level: MC.player.level, xp: MC.player.xp,
    };
    data.inventory = MC.player.inv.serialize();
    data.ach = { got: Array.from(MC.ach.got), stats: { placed: MC.ach.placed, mined: MC.ach.mined, crafted: MC.ach.crafted, killedZombie: MC.ach.killedZombie, killedAnimal: MC.ach.killedAnimal, wood: MC.ach.wood, table: MC.ach.table, pick: MC.ach.pick, stone: MC.ach.stone, ironIngot: MC.ach.ironIngot, ironPick: MC.ach.ironPick, farm: MC.ach.farm, deepMined: MC.ach.deepMined } };
    data.mode = MC.mode; data.difficulty = MC.difficulty;
    data.dimension = MC.world.type;          // 记住存档时在哪个维度
    data.settings = MC.settings;
    // 写入：超出浏览器配额时逐级瘦身（先丢远处的方块改动记录，保证玩家附近的建筑不丢）
    let text = JSON.stringify(data);
    try {
      const prev = localStorage.getItem('blockworld3d_save');
      if (prev && prev.length > 200) localStorage.setItem('blockworld3d_save.bak', prev);   // 保留上一份存档
      localStorage.setItem('blockworld3d_save', text);
    } catch (e) {
      const px = MC.player.pos.x, pz = MC.player.pos.z;
      for (const factor of [0.5, 0.25, 0.12]) {
        const radius = 400 * factor;
        for (const t in data.worlds) {
          const w = data.worlds[t];
          if (!w || !w.editsCompact) continue;
          for (const ck in w.editsCompact) {
            const parts = ck.split(',');
            const cx = parseInt(parts[0], 10) * CHUNK_W, cz = parseInt(parts[1], 10) * CHUNK_W;
            if (Math.hypot(cx - px, cz - pz) > radius) delete w.editsCompact[ck];
          }
        }
        try {
          text = JSON.stringify(data);
          localStorage.setItem('blockworld3d_save', text);
          MC.ui && MC.ui.toast('存档较大：已丢弃 ' + Math.round(radius) + ' 格以外的方块改动记录（附近建筑保留）', 'bad');
          break;
        } catch (e2) { }
      }
      if (!localStorage.getItem('blockworld3d_save')) throw e;
    }
    if (!silent) MC.ui && MC.ui.toast('世界已保存（' + Math.round(text.length / 1024) + ' KB）', 'good');
  } catch (e) {
    bootLog('保存失败: ' + e.message, true);
    MC.ui && MC.ui.toast('保存失败（浏览器存储不可用）', 'bad');
  }
};
MC.loadSaveData = function () {
  try {
    const raw = localStorage.getItem('blockworld3d_save');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
};
MC.saveSettings = function () {
  try { localStorage.setItem('blockworld3d_settings', JSON.stringify(MC.settings)); } catch (e) { }
};
MC.loadSettings = function () {
  try {
    const raw = localStorage.getItem('blockworld3d_settings');
    if (raw) Object.assign(MC.settings, JSON.parse(raw));
  } catch (e) { }
};
MC.setGamemode = function (mode) {
  MC.mode = mode;
  MC.player.creative = (mode === 'creative');
  if (!MC.player.creative) MC.player.flying = false;
  MC.ui.buildSettings();
  MC.ui.toast('模式：' + (mode === 'creative' ? '创造' : '生存'), 'info');
};
MC.screenshot = function () {
  try {
    MC.renderer.render(MC.scene, MC.camera);
    const url = MC.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url; a.download = 'blockworld-' + Date.now() + '.png';
    a.click();
    MC.ui.toast('截图已保存', 'good');
  } catch (e) { MC.ui.toast('截图失败', 'bad'); }
};

/* ============================================================
   启动
   ============================================================ */
function boot() {
  window.MC = MC;
  const game = new Game();
  MC.game = game;
  MC.loadSettings();
  game.initRenderer();
  MC.atlas = new TextureAtlas();
  MC.icons = new Icons(MC.atlas);
  MC.sound = new AudioEngine();
  game.initSky();
  game.loop();
  bootLog('引擎初始化完成，贴图 ' + TILE_FNS.length + ' 张');

  const $ = (id) => document.getElementById(id);
  const menu = $('menu'), loading = $('loading'), hud = $('hud');
  const loadBar = $('loadBar'), loadText = $('loadText');
  const tips = [
    '提示：手持镐子挖石头会快得多，等级不够的镐挖不到铁矿。',
    '提示：夜晚会刷出僵尸和苦力怕，搭个房子或者插火把更安全。',
    '提示：红石粉可以连接拉杆与红石灯、活塞、TNT。',
    '提示：用锄头开垦草地，再种下小麦种子，等它成熟就能收麦子。',
    '提示：附魔台可以消耗经验等级强化装备。',
    '提示：按 T 输入 /give diamond 100 试试。',
    '提示：床可以跳过夜晚，睡一觉天就亮了。',
    '提示：食物要按住右键 1.3 秒才会吃，饿了（饱食度不满）才吃得下。',
    '提示：工作台/熔炉/箱子/附魔台都是右键打开，用镐子挖石头记得升级工具。',
  ];
  $('menuTips').textContent = tips[randInt(tips.length)];

  const startGame = (seed, mode, diff, save) => {
    menu.classList.add('hidden');
    loading.classList.remove('hidden');
    loadBar.style.width = '4%';
    loadText.textContent = '生成地形…';
    MC.sound.init(); MC.sound.resume();
    setTimeout(() => {
      try {
        loadText.textContent = '构建区块与光照…';
        loadBar.style.width = '35%';
        game.startWorld(seed, mode, diff, save);
        loadText.textContent = '生成树木与生物…';
        loadBar.style.width = '72%';
        setTimeout(() => {
          // 初始动物
          for (let i = 0; i < 8; i++) MC.entities.trySpawnPassive(MC.player);
          loadBar.style.width = '100%';
          loadText.textContent = '完成！';
          setTimeout(() => {
            loading.classList.add('hidden');
            hud.classList.remove('hidden');
            if (MC.mode === 'creative') MC.player.inv.hotbar.set(0, makeStack('stone', 64));
            MC.ui.updateHotbar(); MC.ui.updateStats();
            MC.lockMouse(true);
            MC.ui.toast(MC.isMouseLocked() ? '世界已就绪（鼠标已锁定，按 Esc 可释放）' : '世界已就绪：点击一下画面即可锁定鼠标', 'good');
            MC.showLockHint();
          }, 120);
        }, 60);
      } catch (e) {
        bootLog('世界生成失败: ' + (e && e.stack || e), true);
        loadText.textContent = '生成失败：' + e.message;
      }
    }, 60);
  };

  // 显示上次存档的信息（让玩家知道“继续”会回到哪里）
  const describeSave = (save) => {
    if (!save) return '';
    const p = (save.player && save.player.pos) || {};
    let items = 0;
    const inv = save.inventory || {};
    for (const key of ['hotbar', 'main', 'armor']) {
      (inv[key] || []).forEach(s2 => { if (s2) items += s2[1] || 1; });
    }
    const dim = MC.DIM_NAMES[save.dimension || 'overworld'] || '主世界';
    const hh = Math.floor((save.time || 0) * 24), mm = Math.floor(((save.time || 0) * 24 % 1) * 60);
    return `上次存档：<b>${dim}</b> 第 ${save.dayCount || 1} 天 ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` +
      `　坐标 ${(p.x || 0).toFixed(0)}, ${(p.y || 0).toFixed(0)}, ${(p.z || 0).toFixed(0)}` +
      `　物品 <b>${items}</b> 件　种子 ${save.seed}`;
  };
  const refreshSaveInfo = () => {
    const save = MC.loadSaveData();
    const el = $('saveInfo');
    if (el) el.innerHTML = save ? describeSave(save) : '还没有存档，点「创建新世界」开始吧。';
    $('btnLoad').disabled = !save;
    const bak = (() => { try { return JSON.parse(localStorage.getItem('blockworld3d_save.bak') || 'null'); } catch (e) { return null; } })();
    $('btnRestore').classList.toggle('hidden', !bak);
  };
  refreshSaveInfo();

  $('btnNew').addEventListener('click', () => {
    const save = MC.loadSaveData();
    if (save) {
      const info = describeSave(save).replace(/<[^>]*>/g, '');
      if (!confirm('创建新世界会覆盖现有存档！\n\n' + info + '\n\n确定要重新开始吗？（旧存档会保留一份备份）')) return;
      try { localStorage.setItem('blockworld3d_save.bak', localStorage.getItem('blockworld3d_save') || ''); } catch (e) { }
    }
    startGame($('seedInput').value, $('modeSelect').value, parseInt($('diffSelect').value, 10), null);
  });
  $('btnRestore').addEventListener('click', () => {
    let bak = null;
    try { bak = localStorage.getItem('blockworld3d_save.bak'); } catch (e) { }
    if (!bak) return;
    try { localStorage.setItem('blockworld3d_save', bak); } catch (e) { }
    refreshSaveInfo();
    $('menuTips').textContent = '已恢复备份存档，点「继续上次存档」进入。';
  });
  $('btnLoad').addEventListener('click', () => {
    const save = MC.loadSaveData();
    if (!save) { $('menuTips').textContent = '没有找到存档，请先创建新世界。'; return; }
    startGame(String(save.seed), save.mode || 'survival', save.difficulty ?? 1, save);
  });
  $('btnHelp').addEventListener('click', () => { $('help').classList.remove('hidden'); if (MC.ui) MC.ui.centerVirtualCursor(); });
  $('btnHelpBack').addEventListener('click', () => $('help').classList.add('hidden'));
  $('btnAch').addEventListener('click', () => {
    if (MC.ui) MC.ui.buildAchievements();
    $('ach').classList.remove('hidden');
    if (MC.ui) MC.ui.centerVirtualCursor();
  });
  $('btnAchBack').addEventListener('click', () => $('ach').classList.add('hidden'));
  const openSettings = () => {
    if (!MC.ui) { $('menuTips').textContent = '进入世界后即可调整设置。'; return; }
    MC.ui.buildSettings(); $('settings').classList.remove('hidden');
    MC.ui.centerVirtualCursor();
  };
  $('btnSet').addEventListener('click', openSettings);
  $('btnSetBack').addEventListener('click', () => $('settings').classList.add('hidden'));
  $('btnResume').addEventListener('click', () => game.togglePause());
  $('btnSettings').addEventListener('click', openSettings);
  $('btnSave').addEventListener('click', () => MC.saveWorld());
  $('btnQuit').addEventListener('click', () => {
    MC.saveWorld(true);
    MC.running = false;
    setTimeout(() => location.reload(), 80);
  });
  $('btnRespawn').addEventListener('click', () => MC.player.respawn());
  // 背包快捷键
  window.addEventListener('keydown', (e) => {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
    if (!MC.running) return;
    if (e.code === 'KeyE') {
      e.preventDefault();
      if (MC.ui.screenOpen) MC.ui.closeScreen();
      else MC.ui.openScreen(MC.player.creative ? 'creative' : 'inventory');
    }
    if (e.code === 'KeyT') { e.preventDefault(); MC.ui.openChat(''); }
    if (e.code === 'Slash') { e.preventDefault(); MC.ui.openChat('/'); }
    if (e.code === 'KeyM') { const m = document.getElementById('hudTopLeft'); m.style.display = m.style.display === 'none' ? '' : 'none'; }
    if (e.code === 'KeyJ') {
      const shown = MC.ui.toggleQuests();
      MC.ui.toast(shown ? '新手目标：显示' : '新手目标：已收起（按 J 再显示）', 'info');
    }
  });
  // 初始动物需要实体管理器，等世界启动后处理
  // 自动开始（?autostart=1 或 #auto，方便快速进入或做自动化测试）
  if (/autostart|#auto/.test(location.search + location.hash)) setTimeout(() => $('btnNew').click(), 50);
  if (/loadsave/.test(location.search)) setTimeout(() => $('btnLoad').click(), 50);
  if (/selftest/.test(location.search) && typeof runSelfTest === 'function') setTimeout(() => { try { runSelfTest(); } catch (e) { bootLog('selftest crashed: ' + e.message, true); } }, 2500);
  const soakMatch = location.search.match(/soak=(\d+)/);
  if (/soak/.test(location.search) && typeof runSoakTest === 'function') {
    const secs = soakMatch ? clamp(parseInt(soakMatch[1], 10), 1, 300) : 10;
    setTimeout(() => { try { runSoakTest(secs); } catch (e) { bootLog('soak crashed: ' + e.message, true); } }, 2000);
  }
  bootLog('启动完成');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
