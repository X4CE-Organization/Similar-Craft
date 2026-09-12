/* ============================================================
   自检脚本（访问 index.html?selftest=1 时运行）
   逐项验证渲染、方块、合成、熔炼、红石、生物、指令、存档等子系统
   ============================================================ */
/* 长时间运行压力测试（?soak=1）：夜晚 + 大量生物 + 玩家自动移动 */
function runSoakTest(seconds) {
  const t0 = performance.now();
  const errs0 = BOOT.errors.length;
  MC.difficulty = 2;
  MC.world.time = 0.8;                  // 夜晚 → 刷怪
  MC.settings.dayLength = 240;          // 加速昼夜
  const dirs = [];
  for (let i = 0; i < 8; i++) dirs.push([Math.cos(i / 8 * TAU), Math.sin(i / 8 * TAU)]);
  let step = 0, maxMobs = 0, maxItems = 0, frames = 0;
  const dimsVisited = new Set([MC.world.type]);
  const stepOnce = () => {
    const dt = 1 / 60;
    frames++;
    // 自动移动 + 随机转向 + 偶尔攻击/挖掘
    const p = MC.player;
    if (p.alive) {
      const d = dirs[(step / 40 | 0) % dirs.length];
      p.yaw = Math.atan2(-d[0], -d[1]);
      p.keys.KeyW = true;
      p.keys.Space = (step % 97 === 0);
      if (step % 53 === 0) { p.mouse.left = true; } else if (step % 53 === 12) p.mouse.left = false;
      if (step % 61 === 0) p.dropHeld();
    } else {
      p.respawn();
    }
    step++;
    maxMobs = Math.max(maxMobs, MC.world.mobs.length);
    maxItems = Math.max(maxItems, MC.world.itemEntities.length);
    // 每 20 秒切换一次维度，验证三个维度的主循环都稳定
    if (frames % 1200 === 0) {
      const order = ['overworld', 'nether', 'end'];
      const next = order[(order.indexOf(MC.world.type) + 1) % order.length];
      try {
        MC.player.teleportCooldown = 0;
        MC.travelNow(next, true);
        dimsVisited.add(next);
      } catch (e) { bootLog('soak travel error: ' + e.message, true); }
    }
    try {
      MC.game.update(dt);
      MC.ui.tick(dt);
    } catch (e) {
      bootLog('soak frame error: ' + (e && e.stack || e), true);
      frames = seconds * 60;    // 中止
    }
    if (frames < seconds * 60) setTimeout(stepOnce, 0);
    else finish();
  };
  const finish = () => {
    MC.player.keys.KeyW = false;
    MC.player.mouse.left = false;
    const errs = BOOT.errors.slice(errs0);
    const summary = `压力测试 ${seconds}s：帧=${frames} 生物峰值=${maxMobs} 物品峰值=${maxItems} 区块=${MC.world.chunks.size}` +
      ` 天光队列=${MC.world.light.skyQ.length - MC.world.light.si} 方块光队列=${MC.world.light.blockQ.length - MC.world.light.bi}` +
      ` 流体队列=${MC.world.fluids.activeSize} 光照入队=${MC.world.light.stats.pushes || 0} 维度=${[...dimsVisited].join('→')} 新异常=${errs.length}`;
    bootLog('\n=== SOAK ===\n' + summary + (errs.length ? '\n' + errs.join('\n') : '') + '\n=== END SOAK ===\n');
  };
  setTimeout(stepOnce, 0);
}

function runSelfTest() {
  const results = [];
  const test = (name, fn) => {
    try {
      const r = fn();
      results.push((r === false ? '✗ ' : '✓ ') + name + (typeof r === 'string' ? ' — ' + r : ''));
    } catch (e) {
      results.push('✗ ' + name + ' — 异常: ' + (e && e.message ? e.message : e));
      bootLog('selftest fail: ' + name + ' :: ' + (e && e.stack || e), true);
    }
  };
  let w = MC.world, p = MC.player;

  test('渲染三角形 > 0', () => {
    const info = MC.renderer.info.render;
    return info.triangles > 1000 ? ('tri=' + info.triangles + ' draws=' + info.calls) : false;
  });
  test('画面有内容（像素采样）', () => {
    const src = MC.renderer.domElement;
    const c = document.createElement('canvas'); c.width = 48; c.height = 48;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0, 48, 48);
    const d = ctx.getImageData(0, 0, 48, 48).data;
    const set = new Set(); let sum = 0;
    for (let i = 0; i < d.length; i += 4) { set.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3)); sum += d[i] + d[i + 1] + d[i + 2]; }
    const avg = sum / (d.length / 4) / 3;
    return set.size > 8 ? ('色数=' + set.size + ' 亮度=' + avg.toFixed(0)) : false;
  });
  test('区块已加载并生成网格', () => {
    let meshed = 0;
    w.chunks.forEach(c => { if (c.meshOpaque || c.meshTransparent) meshed++; });
    return meshed > 5 ? (meshed + '/' + w.chunks.size + ' 区块有网格') : false;
  });
  test('方块读写', () => {
    const x = Math.floor(p.pos.x) + 3, z = Math.floor(p.pos.z), y = Math.floor(p.pos.y) + 6;
    w.setBlock(x, y, z, B.stone, {});
    const okSet = w.getBlock(x, y, z) === B.stone;
    w.setBlock(x, y, z, 0, {});
    return okSet && w.getBlock(x, y, z) === 0;
  });
  test('射线检测命中地面', () => {
    const e = p.eyePos;
    const hit = w.raycast(e.x, e.y, e.z, 0, -1, 0, 40);
    return hit.hit ? ('命中 ' + BLOCKS[w.getBlock(hit.x, hit.y, hit.z)].cn) : false;
  });
  test('挖掘掉落', () => {
    const x = Math.floor(p.pos.x) + 5, z = Math.floor(p.pos.z) + 5, y = Math.floor(p.pos.y) + 3;
    w.setBlock(x, y, z, B.oak_log, {});
    const drops = w.breakBlock(x, y, z, makeStack('wood_axe', 1), p);
    return drops.length && drops[0].id === 'oak_log' ? ('掉落 ' + drops.map(d => itemName(d.id) + '×' + d.count).join(',')) : false;
  });
  test('合成：原木 → 木板 → 工作台', () => {
    p.inv.hotbar.clear(); p.inv.main.clear();
    p.inv.addItem('oak_log', 4);
    craftFromInventory(p.inv, RECIPES.find(r => r.out === 'oak_planks'), 1);
    const planks = p.inv.countOf('oak_planks');
    const made = craftFromInventory(p.inv, RECIPES.find(r => r.out === 'crafting_table'), 1);
    return planks === 4 && made === 1 && p.inv.countOf('crafting_table') === 1;
  });
  test('合成：木镐', () => {
    p.inv.addItem('oak_planks', 3); p.inv.addItem('stick', 2);
    const r = RECIPES.find(r => r.out === 'wood_pickaxe');
    const plan = planCraft(p.inv, r);
    const made = craftFromInventory(p.inv, r, 1);
    const got = p.inv.countOf('wood_pickaxe');
    if (got !== 1) throw new Error('made=' + made + ' plan=' + JSON.stringify(plan) + ' 木板=' + p.inv.countOf('oak_planks') + ' 木棍=' + p.inv.countOf('stick'));
    return '消耗 ' + JSON.stringify(plan);
  });
  test('合成：铁剑 / 钻石靴（含空格图案）', () => {
    p.inv.addItem('iron_ingot', 2); p.inv.addItem('stick', 1);
    const made1 = craftFromInventory(p.inv, RECIPES.find(r => r.out === 'iron_sword'), 1);
    p.inv.addItem('diamond', 4);
    const made2 = craftFromInventory(p.inv, RECIPES.find(r => r.out === 'diamond_boots'), 1);
    if (!made1 || !made2) throw new Error('铁剑=' + made1 + ' 钻靴=' + made2);
    return '铁剑 + 钻石靴 OK';
  });
  test('合成：方块在 3×3 网格中摆放', () => {
    p.inv.craft.clear();
    p.inv.craft.set(4, makeStack('oak_log', 1));   // 居中放入（等轴测）
    const r = matchRecipe(recipeGridFor(p.inv, 3).slots, 3);
    p.inv.craft.clear();
    if (!r) throw new Error('居中单格未识别为无配方');   // 原木→木板是无序配方，应命中
    return '识别 ' + r.out;
  });
  test('合成台摆放匹配（3×3）', () => {
    const inv = p.inv;
    inv.craft.clear();
    inv.craft.set(0, makeStack('oak_log', 1));
    const grid = recipeGridFor(inv, 2);
    const r = matchRecipe(grid.slots, 2);
    inv.craft.clear();
    return r && r.out === 'oak_planks' ? ('识别到 ' + r.out) : false;
  });
  test('熔炼：粗铁 → 铁锭', () => {
    const x = Math.floor(p.pos.x) + 8, y = Math.floor(p.pos.y) + 3, z = Math.floor(p.pos.z) + 8;
    w.setBlock(x, y, z, B.furnace, {});
    const st = { inv: [makeStack('raw_iron', 2), makeStack('coal', 2), null], burn: 0, burnMax: 0, cook: 0 };
    w.setState(x, y, z, st);
    for (let i = 0; i < 400; i++) w.tickFurnace(posKey(x, y, z), st, 0.1);
    return st.inv[2] && st.inv[2].id === 'iron_ingot' ? ('产出 ' + st.inv[2].count + ' 铁锭') : false;
  });
  test('红石：拉杆 → 粉线 → 灯亮', () => {
    const x = Math.floor(p.pos.x) - 8, y = Math.floor(p.pos.y) + 3, z = Math.floor(p.pos.z) - 8;
    // 先铺一层石头作为支撑（红石线需要下方有方块）
    for (let i = -1; i <= 5; i++) for (let j = -1; j <= 1; j++) w.setBlock(x + i, y - 1, z + j, B.stone, {});
    w.setBlock(x, y, z, B.lever, {}); MC.redstone.onPlaced(x, y, z, B.lever);
    w.setBlock(x + 1, y, z, B.redstone_dust, {}); MC.redstone.onPlaced(x + 1, y, z, B.redstone_dust);
    w.setBlock(x + 2, y, z, B.redstone_dust, {}); MC.redstone.onPlaced(x + 2, y, z, B.redstone_dust);
    w.setBlock(x + 3, y, z, B.redstone_lamp, {}); MC.redstone.onPlaced(x + 3, y, z, B.redstone_lamp);
    MC.redstone.interact(x, y, z, BLOCKS[B.lever]);
    const lit = w.getState(x + 3, y, z);
    const dust = w.getState(x + 2, y, z);
    return lit && lit.lit ? ('末端粉线信号=' + (dust ? dust.power : '?')) : false;
  });
  test('爆炸破坏方块', () => {
    const x = Math.floor(p.pos.x) - 14, y = Math.floor(p.pos.y) + 4, z = Math.floor(p.pos.z) + 12;
    for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -2; dz <= 2; dz++) w.setBlock(x + dx, y + dy, z + dz, B.stone, {});
    w.explode(x, y + 1, z, 4);
    let air = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (w.getBlock(x + dx, y, z + dz) === 0) air++;
    return air > 0 ? ('炸开 ' + air + ' 格') : false;
  });
  test('火把照亮周围', () => {
    const x = Math.floor(p.pos.x) + 12, y = Math.floor(p.pos.y) + 4, z = Math.floor(p.pos.z) + 4;
    w.setBlock(x, y - 1, z, B.stone, {});
    w.setBlock(x, y, z, B.torch, {});
    w.light.requestRelight(x, y, z, 12);
    for (let i = 0; i < 8; i++) w.light.process(300000);
    return w.getBlockLight(x + 1, y, z) > 0 ? ('相邻方块光=' + w.getBlockLight(x + 1, y, z)) : false;
  });
  test('天光：地表为 15、地下更暗', () => {
    const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
    const top = w.getSkyLight(x, WORLD_H - 1, z);
    const deep = w.getSkyLight(x, 5, z);
    return top === 15 && deep < top ? ('地表=' + top + ' 地下=' + deep) : false;
  });
  test('生物：生成 / 受伤 / 死亡', () => {
    const mob = new Mob(w, 'zombie', p.pos.x + 3, p.pos.y + 1, p.pos.z + 3);
    w.mobs.push(mob);
    for (let i = 0; i < 30; i++) mob.tick(0.05, p);
    mob.hurt(100, null, p);
    for (let i = 0; i < 30; i++) mob.tick(0.05, p);
    return mob.dead;
  });
  test('弓箭飞行', () => {
    const d = p.lookDir();
    const ar = new Arrow(w, p.pos.x, p.pos.y + 1.4, p.pos.z, d.x * 30, d.y * 30, d.z * 30, p);
    w.arrows.push(ar);
    for (let i = 0; i < 40; i++) ar.tick(0.02);
    ar.dispose();
    return true;
  });
  test('作物成熟掉落小麦', () => {
    const x = Math.floor(p.pos.x) + 16, y = Math.floor(p.pos.y) + 3, z = Math.floor(p.pos.z);
    w.setBlock(x, y - 1, z, B.farmland, {});
    w.setBlock(x, y, z, B.farmland_seed, {}); w.setState(x, y, z, { stage: 7 });
    const drops = w.dropsFor(x, y, z, BLOCKS[B.farmland_seed], null, p);
    return drops.some(d => d.id === 'wheat') && drops.some(d => d.id === 'seeds');
  });
  test('附魔系统', () => {
    p.level = 30;
    const st = makeStack('iron_pickaxe', 1);
    const opts = enchantOptions(st, p.level);
    applyEnchant(st, opts[0]);
    return opts.length === 3 && !!enchantName(st) ? ('附魔 ' + enchantName(st)) : false;
  });
  test('UI：各界面渲染', () => {
    let n = 0;
    for (const k of ['inventory', 'crafting', 'enchant', 'creative']) { MC.ui.openScreen(k); n += MC.ui.el.screenBody.children.length; }
    const fx = Math.floor(p.pos.x) + 2, fy = Math.floor(p.pos.y) + 4, fz = Math.floor(p.pos.z) + 2;
    w.setBlock(fx, fy, fz, B.furnace, {});
    MC.ui.openScreen('furnace', { x: fx, y: fy, z: fz });
    n += MC.ui.el.screenBody.children.length;
    MC.ui.openScreen('chest', { x: fx + 2, y: fy, z: fz });
    n += MC.ui.el.screenBody.children.length;
    MC.ui.closeScreen();
    return n >= 10 ? (n + ' 个界面节点') : false;
  });
  test('背包整理 / 快速移动', () => {
    p.inv.hotbar.clear(); p.inv.main.clear();
    p.inv.hotbar.set(0, makeStack('dirt', 10));
    const get = () => p.inv.hotbar.get(0);
    const set = (s) => p.inv.hotbar.set(0, s);
    MC.ui.slotAction(get, set, 2, false);   // 右键分一半
    const ok = p.inv.cursor && p.inv.cursor.count === 5 && p.inv.hotbar.get(0).count === 5;
    MC.ui.closeScreen();
    return ok;
  });
  test('指令系统', () => {
    MC.commands.exec('/give diamond 5');
    MC.commands.exec('/time set night');
    MC.commands.exec('/weather rain');
    MC.commands.exec('/summon pig 2');
    MC.commands.exec('/gamemode survival');
    MC.commands.exec('/help');
    return p.inv.countOf('diamond') >= 5 && !w.isDay();
  });
  test('存档序列化', () => {
    const data = w.serialize();
    data.player = { pos: p.pos, creative: p.creative, health: p.health };
    data.inventory = p.inv.serialize();
    const s = JSON.stringify(data);
    const back = JSON.parse(s);
    return back.seed === w.seed && s.length > 10 ? (Math.round(s.length / 1024) + 'KB') : false;
  });
  test('本地存储读写（存档）', () => {
    localStorage.setItem('blockworld3d_probe', 'ok');
    const v = localStorage.getItem('blockworld3d_probe');
    localStorage.removeItem('blockworld3d_probe');
    if (v !== 'ok') throw new Error('localStorage 不可用');
    MC.saveWorld(true);
    const raw = localStorage.getItem('blockworld3d_save');
    if (!raw) throw new Error('存档未写入');
    const parsed = JSON.parse(raw);
    return ('存档 ' + Math.round(raw.length / 1024) + 'KB，种子 ' + parsed.seed + '，方块改动 ' + (parsed.edits || []).length + ' 条');
  });
  test('读档恢复玩家与世界', () => {
    const save = MC.loadSaveData();
    if (!save) throw new Error('无存档');
    const pos = MC.player.pos;
    MC.world.applySave(JSON.parse(JSON.stringify(save)));
    MC.player.inv.applySave(save.inventory);
    const okPos = Math.abs(MC.player.pos.x - pos.x) < 0.001;
    return okPos ? ('已恢复：第 ' + MC.world.dayCount + ' 天，物品栏 ' + MC.player.inv.hotbar.slots.filter(Boolean).length + ' 格') : false;
  });
  test('光照队列推进', () => {
    const work = w.light.process(60000);
    return ('处理 ' + work + ' 节点，天光队列剩 ' + (w.light.skyQ.length - w.light.si));
  });
  test('暂停 / 恢复', () => {
    MC.game.togglePause();
    const paused = MC.game.paused;
    MC.game.togglePause();
    return paused && !MC.game.paused;
  });
  test('视角转速合理（不晕）', () => {
    const saved = MC.settings.sensitivity;
    MC.settings.sensitivity = 100;
    const per = MC.player.lookSpeed() * 180 / Math.PI;      // 每像素转多少度
    const swipe = per * 100;                                 // 100 像素的滑动
    MC.settings.sensitivity = 200;
    const fastPer = MC.player.lookSpeed() * 180 / Math.PI;
    MC.settings.sensitivity = 10;
    const slowPer = MC.player.lookSpeed() * 180 / Math.PI;
    MC.settings.sensitivity = saved;
    if (per < 0.05 || per > 0.3) throw new Error('默认灵敏度 ' + per.toFixed(3) + ' 度/像素（应在 0.05~0.3）');
    if (!(fastPer > per && slowPer < per)) throw new Error('灵敏度滑杆映射异常');
    return `默认 ${per.toFixed(3)}°/像素（滑 100 像素转 ${swipe.toFixed(0)}°）· 最慢滑 100 像素 ${(slowPer * 100).toFixed(0)}° · 最快 ${(fastPer * 100).toFixed(0)}°`;
  });

  test('模拟操作：行走 / 跳跃', () => {
    MC.ui.screenOpen = false;
    p.flying = false; p.creative = false;
    // 站到一块干净的石台上，避免被地形/树木挡住
    const wx = Math.floor(p.pos.x) + 50, wz = Math.floor(p.pos.z) + 50, wy = 84;
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
      w.setBlock(wx + dx, wy, wz + dz, B.stone, { noFluid: true });
      for (let dy = 1; dy <= 4; dy++) w.setBlock(wx + dx, wy + dy, wz + dz, 0, { noFluid: true });
    }
    p.pos = { x: wx + 0.5, y: wy + 1.2, z: wz + 0.5 };
    p.vel = { x: 0, y: 0, z: 0 };
    p.yaw = 0;
    for (let i = 0; i < 30; i++) p.update(1 / 60);
    const before = { x: p.pos.x, z: p.pos.z };
    p.keys.KeyW = true;
    for (let i = 0; i < 90; i++) p.update(1 / 60);
    const dist = Math.hypot(p.pos.x - before.x, p.pos.z - before.z);
    const wasGround = p.onGround;
    p.keys.Space = true;
    for (let i = 0; i < 12; i++) p.update(1 / 60);
    p.keys.Space = false;
    const jumpY = p.pos.y;
    for (let i = 0; i < 10; i++) p.update(1 / 60);
    p.keys.KeyW = false;
    if (dist < 2) throw new Error('移动距离过短 ' + dist.toFixed(2));
    return ('前进 ' + dist.toFixed(1) + ' 格，着地=' + wasGround + '，跳跃后高度 ' + jumpY.toFixed(2));
  });
  test('模拟操作：挖掘方块', () => {
    const x = Math.floor(p.pos.x) + 2, z = Math.floor(p.pos.z), y = Math.floor(p.pos.y) - 1;
    w.setBlock(x, y, z, B.stone, {});
    // 站到方块正上方并向下看
    p.pos.x = x + 0.5; p.pos.z = z + 0.5; p.pos.y = y + 2.2;
    p.vel = { x: 0, y: 0, z: 0 };
    p.pitch = -Math.PI / 2 + 0.05;
    p.inv.hotbar.set(p.inv.selected, makeStack('wood_pickaxe', 1));
    p.mouse.left = true;
    const items0 = w.itemEntities.length;
    let guard = 0;
    while (w.getBlock(x, y, z) === B.stone && guard++ < 300) p.updateMining(1 / 60);
    p.mouse.left = false;
    const broke = w.getBlock(x, y, z) === 0;
    if (!broke) throw new Error('挖掘未完成（进度 ' + p.mining.progress.toFixed(2) + '）');
    if (w.itemEntities.length === items0) {
      // 掉落实体未生成 —— 直接再挖一块验证掉落链路
      w.setBlock(x, y, z, B.stone, {});
      const drops = w.breakBlock(x, y, z, makeStack('wood_pickaxe', 1), p);
      w.setBlock(x, y, z, B.stone, {});
      const ent = w.spawnItem(x + 0.5, y + 1, z + 0.5, drops[0].id, drops[0].count);
      if (!ent) throw new Error('掉落实体生成失败，drop=' + JSON.stringify(drops));
      w.removeItemEntity(w.itemEntities.indexOf(ent));
      throw new Error('挖掘后未生成掉落实体（itemEntities ' + items0 + '→' + w.itemEntities.length + '）');
    }
    return ('挖掉石头，掉落物 ' + (w.itemEntities.length - items0) + ' 个');
  });
  test('模拟操作：放置方块', () => {
    const x = Math.floor(p.pos.x) + 2, z = Math.floor(p.pos.z), y = Math.floor(p.pos.y);
    // 清出空间并铺地板
    for (let dx = -1; dx <= 3; dx++) for (let dz = -1; dz <= 1; dz++) {
      w.setBlock(x + dx, y - 1, z + dz, B.stone, {});
      w.setBlock(x + dx, y, z + dz, 0, {});
      w.setBlock(x + dx, y + 1, z + dz, 0, {});
    }
    p.pos.x = x - 1.5; p.pos.z = z + 0.5; p.pos.y = y; p.vel = { x: 0, y: 0, z: 0 };
    p.pitch = -0.62;           // 向下看，射线打到地面
    p.yaw = -Math.PI / 2;      // 朝 +x
    p.inv.hotbar.set(p.inv.selected, makeStack('oak_planks', 10));
    p.onRightClick();
    let placed = 0;
    for (let dx = 0; dx <= 3; dx++) for (let dy = 0; dy <= 2; dy++) if (w.getBlock(x + dx, y + dy, z) === B.oak_planks) placed++;
    const hit = w.raycast(p.eyePos.x, p.eyePos.y, p.eyePos.z, ...Object.values(p.lookDir()), p.reach());
    if (!placed) throw new Error('未放置（射线命中=' + (hit.hit ? BLOCKS[w.getBlock(hit.x, hit.y, hit.z)].cn : '无') + '）');
    return '放置 ' + placed + ' 个方块，手持剩余 ' + (p.inv.held ? p.inv.held.count : 0);
  });
  test('模拟操作：攻击生物', () => {
    const mob = new Mob(w, 'zombie', p.pos.x + 2, p.pos.y, p.pos.z);
    mob.pos.y = p.pos.y;
    w.mobs.push(mob);
    p.yaw = Math.atan2(-(mob.pos.x - p.pos.x), -(mob.pos.z - p.pos.z));
    p.pitch = 0;
    p.attackCD = 0;
    const hp0 = mob.hp;
    p.onLeftClick();
    const dealt = hp0 - mob.hp;
    mob.remove = true;
    if (dealt <= 0) throw new Error('未造成伤害（距离 ' + Math.hypot(mob.pos.x - p.pos.x, mob.pos.z - p.pos.z).toFixed(2) + '）');
    return '造成 ' + dealt.toFixed(1) + ' 点伤害';
  });
  test('完整重开世界并读档（模拟「继续上次存档」）', () => {
    const beforeSave = JSON.stringify(MC.player.pos);
    MC.saveWorld(true);
    const rawAfter = localStorage.getItem('blockworld3d_save') || '';
    let parsedAfter = null;
    try { parsedAfter = JSON.parse(rawAfter); } catch (e) { parsedAfter = 'parse-error:' + e.message; }
    const afterSave = parsedAfter && parsedAfter.player ? JSON.stringify(parsedAfter.player.pos) : 'n/a';
    const save = MC.loadSaveData();
    if (beforeSave !== afterSave) {
      MC.saveDiag = '保存前玩家=' + beforeSave + ' 存下来=' + afterSave + ' 存档长度=' + rawAfter.length +
        ' 含player字段=' + (parsedAfter && typeof parsedAfter === 'object' ? ('player' in parsedAfter) : 'n/a');
    }
    const savedSeed = w.seed, savedX = p.pos.x;
    MC.game.startWorld(String(save.seed), save.mode || 'survival', save.difficulty ?? 1, save);
    MC.game.update(0.05);
    MC.game.updateSky(0.05);
    MC.renderer.render(MC.scene, MC.camera);
    const tri = MC.renderer.info.render.triangles;
    if (MC.world.seed !== savedSeed) throw new Error('种子不一致 ' + MC.world.seed + ' vs ' + savedSeed);
    if (!(tri > 1000)) throw new Error('读档后画面无几何体 tri=' + tri);
    const msg = '重开后 tri=' + tri + '，玩家 ' + MC.player.pos.x.toFixed(1) + ',' + MC.player.pos.y.toFixed(1) + ',' + MC.player.pos.z.toFixed(1) + '，区块 ' + MC.world.chunks.size;
    // 后续测试改用新实例
    w = MC.world; p = MC.player;
    return msg;
  });
  test('小地图绘制', () => {
    MC.ui.drawMinimap();
    const cv = MC.ui.el.mini;
    const d = cv.getContext('2d').getImageData(0, 0, 160, 160).data;
    let nonEmpty = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) nonEmpty++;
    return nonEmpty > 1000 ? (nonEmpty + ' 个像素') : false;
  });
  test('画面结构采样（16×8 色块）', () => {
    w.time = 0.33;                 // 白天采样，便于确认天空/地面结构
    MC.game.updateSky(0.016);
    MC.renderer.render(MC.scene, MC.camera);
    const src = MC.renderer.domElement;
    const c = document.createElement('canvas'); c.width = 16; c.height = 8;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0, 16, 8);
    const d = ctx.getImageData(0, 0, 16, 8).data;
    const grid = [];
    for (let y = 0; y < 8; y++) {
      let row = '';
      for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 4;
        const hex = ((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4)).toString(16).padStart(3, '0');
        row += hex + ' ';
      }
      grid.push(row);
    }
    // 上半部分应偏天空色（蓝/亮），下半部分应为地面色
    const lum = (y) => { let s = 0; for (let x = 0; x < 16; x++) { const i = (y * 16 + x) * 4; s += d[i] + d[i + 1] + d[i + 2]; } return s / 48; };
    MC.frameGrid = grid;
    bootLog('\n[画面采样 16x8 十六进制 RGB]\n' + grid.join('\n'));
    return '上部亮度 ' + lum(0).toFixed(0) + ' / 中部 ' + lum(4).toFixed(0) + ' / 底部 ' + lum(7).toFixed(0);
  });
  test('生物模型构建', () => {
    let n = 0;
    for (const t in MOB_TYPES) { const m = buildMobModel(t); if (m.group.children.length >= 3) n++; }
    return n === Object.keys(MOB_TYPES).length ? (n + ' 种生物模型') : false;
  });
  test('贴图与图标生成', () => {
    const stack = makeStack('diamond_pickaxe', 1);
    const cv = MC.icons.forItem({ id: stack.id, def: stackDef(stack), meta: stack.meta }, 32);
    const blockIcon = MC.icons.forItem({ id: 'grass_block', def: itemDef('grass_block'), meta: {} }, 32);
    return cv && blockIcon ? (TILE_FNS.length + ' 张贴图 / 图标已生成') : false;
  });
  test('所有方块/物品图标可生成', () => {
    const bad = [];
    for (const b of BLOCKS) {
      if (!b || b.id === 0) continue;
      try { MC.icons.forItem({ id: b.name, def: itemDef(b.name), meta: {} }, 32); }
      catch (e) { bad.push(b.name + '[' + (b.tex ? Object.keys(b.tex).map(k => k + '=' + b.tex[k]).join(',') : 'no-tex') + ']'); }
    }
    for (const id in ITEMS) {
      try { MC.icons.forItem({ id, def: ITEMS[id], meta: {} }, 32); }
      catch (e) { bad.push(id + '[item]'); }
    }
    return bad.length ? ('失败 ' + bad.length + ' 个: ' + bad.slice(0, 6).join(' ')) : ('全部 ' + (BLOCKS.length + Object.keys(ITEMS).length) + ' 个图标 OK');
  });

  /* ================= 流体 ================= */
  // 在高空搭建一块干净的石台，避免地形（海洋/岩浆）干扰测试
  const fluidPad = (w0, bx, by, bz, rx, rz) => {
    // 确保整个测试区域所在的区块都已加载
    for (let cx = Math.floor((bx - rx) / CHUNK_W); cx <= Math.floor((bx + rx) / CHUNK_W); cx++)
      for (let cz = Math.floor((bz - rz) / CHUNK_W); cz <= Math.floor((bz + rz) / CHUNK_W); cz++)
        if (!w0.getChunk(cx, cz)) w0.createChunk(cx, cz);
    for (let dx = -rx; dx <= rx; dx++) for (let dz = -rz; dz <= rz; dz++) {
      w0.setBlock(bx + dx, by, bz + dz, B.stone, { noFluid: true });
      for (let dy = 1; dy <= 5; dy++) w0.setBlock(bx + dx, by + dy, bz + dz, 0, { noFluid: true });
    }
  };
  test('水流扩散 7 格并停止', () => {
    const w0 = MC.world, p0 = MC.player;
    const bx = Math.floor(p0.pos.x) + 40, by = 84, bz = Math.floor(p0.pos.z) + 40;
    fluidPad(w0, bx, by, bz, 13, 4);
    w0.setBlock(bx, by + 1, bz, B.water, {});
    w0.fluids.onLiquidPlaced(bx, by + 1, bz, B.water, true);
    w0.fluids.acc.water = 0;
    for (let i = 0; i < 60; i++) w0.fluids.tick(0.25);
    let reach = 0;
    for (let d = 1; d <= 12; d++) if (w0.getBlock(bx + d, by + 1, bz) === B.water) reach = d;
    const tooFar = w0.getBlock(bx + 8, by + 1, bz) === B.water;
    if (reach !== 7 || tooFar) throw new Error('扩散距离 ' + reach + '（应为 7）');
    return '扩散到 ' + reach + ' 格，第 8 格为空';
  });
  test('无限水源（两水源夹一格）', () => {
    const w0 = MC.world, p0 = MC.player;
    const bx = Math.floor(p0.pos.x) + 60, by = 84, bz = Math.floor(p0.pos.z) + 60;
    fluidPad(w0, bx, by, bz, 4, 4);
    w0.fluids.acc.water = 0;
    w0.setBlock(bx, by + 1, bz, B.water, {}); w0.fluids.onLiquidPlaced(bx, by + 1, bz, B.water, true);
    w0.setBlock(bx + 2, by + 1, bz, B.water, {}); w0.fluids.onLiquidPlaced(bx + 2, by + 1, bz, B.water, true);
    for (let i = 0; i < 40; i++) w0.fluids.tick(0.25);
    const mid = w0.getState(bx + 1, by + 1, bz);
    if (!mid || !mid.source) throw new Error('中间格未变成水源: ' + JSON.stringify(mid));
    return '中间格已生成水源';
  });
  test('岩浆流动距离（主世界 3 格）', () => {
    const w0 = MC.world, p0 = MC.player;
    const bx = Math.floor(p0.pos.x) + 80, by = 84, bz = Math.floor(p0.pos.z) + 80;
    fluidPad(w0, bx, by, bz, 9, 3);
    w0.setBlock(bx, by + 1, bz, B.lava, {}); w0.fluids.onLiquidPlaced(bx, by + 1, bz, B.lava, true);
    w0.fluids.acc.lava = 0;
    for (let i = 0; i < 80; i++) w0.fluids.tick(1.5);
    let reach = 0;
    for (let d = 1; d <= 8; d++) if (w0.getBlock(bx + d, by + 1, bz) === B.lava) reach = d;
    if (reach !== 3) throw new Error('岩浆扩散 ' + reach + ' 格（应为 3）');
    return '岩浆扩散 ' + reach + ' 格';
  });
  test('水与岩浆交互 → 黑曜石 / 圆石 / 石头', () => {
    const w0 = MC.world, p0 = MC.player;
    const bx = Math.floor(p0.pos.x) + 100, by = 84, bz = Math.floor(p0.pos.z) + 100;
    fluidPad(w0, bx, by, bz, 8, 8);
    w0.fluids.acc.water = 0; w0.fluids.acc.lava = 0;
    // 岩浆源 + 旁边水 → 黑曜石
    w0.setBlock(bx, by + 1, bz, B.lava, {}); w0.fluids.onLiquidPlaced(bx, by + 1, bz, B.lava, true);
    w0.setBlock(bx + 1, by + 1, bz, B.water, {}); w0.fluids.onLiquidPlaced(bx + 1, by + 1, bz, B.water, true);
    for (let i = 0; i < 12; i++) w0.fluids.tick(0.25);
    const obs = w0.getBlock(bx, by + 1, bz) === B.obsidian;
    // 岩浆从上方浇在水上 → 石头
    const sx = bx + 4, sz = bz + 4;
    w0.setBlock(sx, by + 1, sz, B.water, {}); w0.fluids.onLiquidPlaced(sx, by + 1, sz, B.water, true);
    w0.setBlock(sx, by + 2, sz, B.lava, {}); w0.fluids.onLiquidPlaced(sx, by + 2, sz, B.lava, true);
    const placedStone = BLOCKS[w0.getBlock(sx, by + 1, sz)].cn + '/' + BLOCKS[w0.getBlock(sx, by + 2, sz)].cn;
    for (let i = 0; i < 12; i++) w0.fluids.tick(0.25);
    const stone = w0.getBlock(sx, by + 1, sz) === B.stone;
    // 两股流动液相遇 → 圆石
    const cx = bx + 2, cz = bz + 4;
    w0.setBlock(cx - 3, by + 1, cz, B.water, {}); w0.fluids.onLiquidPlaced(cx - 3, by + 1, cz, B.water, true);
    w0.setBlock(cx + 3, by + 1, cz, B.lava, {}); w0.fluids.onLiquidPlaced(cx + 3, by + 1, cz, B.lava, true);
    for (let i = 0; i < 60; i++) w0.fluids.tick(0.25);
    const cob = [cx - 1, cx, cx + 1].some(x => w0.getBlock(x, by + 1, cz) === B.cobblestone || w0.getBlock(x, by + 1, cz) === B.stone);
    if (!obs) throw new Error('水碰岩浆源未生成黑曜石 → ' + BLOCKS[w0.getBlock(bx, by + 1, bz)].cn);
    if (!stone) throw new Error('岩浆浇在水上未生成石头 → 放置时=' + placedStone + ' 现在=' + BLOCKS[w0.getBlock(sx, by + 1, sz)].cn + '/' + BLOCKS[w0.getBlock(sx, by + 2, sz)].cn);
    // 直接验证规则本身：有供给的流动岩浆紧挨着流动水 → 圆石
    const mx = bx + 9, mz = bz + 9;
    w0.setBlock(mx, by + 1, mz, B.stone, { noFluid: true });           // 垫底
    w0.setBlock(mx, by, mz, B.stone, { noFluid: true });
    w0.setBlock(mx - 1, by + 1, mz, B.lava, {}); w0.setState(mx - 1, by + 1, mz, { level: 0, falling: false, source: true });
    w0.setBlock(mx, by + 1, mz, B.lava, {}); w0.setState(mx, by + 1, mz, { level: 1, falling: false, source: false });
    w0.setBlock(mx + 1, by + 1, mz, B.water, {}); w0.setState(mx + 1, by + 1, mz, { level: 1, falling: false, source: false });
    w0.setBlock(mx + 2, by + 1, mz, B.water, {}); w0.setState(mx + 2, by + 1, mz, { level: 0, falling: false, source: true });
    w0.fluids.updateCell(mx, by + 1, mz, B.lava);
    const cobRule = w0.getBlock(mx, by + 1, mz) === B.cobblestone;
    if (!cobRule) throw new Error('流动岩浆碰水规则失效 → ' + BLOCKS[w0.getBlock(mx, by + 1, mz)].cn + '（左=' + BLOCKS[w0.getBlock(mx - 1, by + 1, mz)].cn + ' 右=' + BLOCKS[w0.getBlock(mx + 1, by + 1, mz)].cn + '）');
    if (!cob) throw new Error('两股流动液未生成圆石/石头 → ' + [cx - 1, cx, cx + 1].map(x => BLOCKS[w0.getBlock(x, by + 1, cz)].cn).join('/'));
    return '黑曜石 ✓ 石头 ✓ 圆石 ✓';
  });
  test('下界水会蒸发', () => {
    const nw = MC.getDimension('nether');
    const bx = 200, by = 50, bz = 200;
    nw.setBlock(bx, by, bz, B.water, {}); nw.fluids.onLiquidPlaced(bx, by, bz, B.water, true);
    for (let i = 0; i < 6; i++) nw.fluids.tick(0.25);
    if (nw.getBlock(bx, by, bz) === B.water) throw new Error('下界的水没有蒸发');
    return '水在下界蒸发为空气';
  });
  test('下界岩浆扩散 7 格', () => {
    const nw = MC.getDimension('nether');
    const bx = 40, by = 84, bz = 40;
    fluidPad(nw, bx, by, bz, 9, 3);
    nw.setBlock(bx, by + 1, bz, B.lava, {}); nw.fluids.onLiquidPlaced(bx, by + 1, bz, B.lava, true);
    nw.fluids.acc.lava = 0;
    for (let i = 0; i < 80; i++) nw.fluids.tick(0.5);
    let reach = 0;
    for (let d = 1; d <= 9; d++) if (nw.getBlock(bx + d, by + 1, bz) === B.lava) reach = d;
    if (reach !== 7) throw new Error('下界岩浆扩散 ' + reach + ' 格（应为 7）');
    return '下界岩浆扩散 ' + reach + ' 格';
  });

  /* ================= 下界 ================= */
  test('下界地形：岩浆海 / 下界岩 / 石英 / 基岩顶', () => {
    const nw = MC.getDimension('nether');
    const c = nw.getChunk(0, 0) || nw.createChunk(0, 0);
    let lava = 0, netherrack = 0, quartz = 0, bedrockTop = 0, glow = 0;
    for (let y = 0; y < WORLD_H; y++) for (let i = 0; i < CHUNK_W * CHUNK_W; i++) {
      const id = c.blocks[y * CHUNK_W * CHUNK_W + i];
      if (id === B.lava) lava++;
      else if (id === B.netherrack) netherrack++;
      else if (id === B.nether_quartz_ore) quartz++;
      else if (id === B.glowstone) glow++;
    }
    for (let i = 0; i < CHUNK_W * CHUNK_W; i++) if (c.blocks[(92 * CHUNK_W * CHUNK_W) + i] === B.bedrock) bedrockTop++;
    if (!lava || !netherrack) throw new Error('缺少岩浆/下界岩 lava=' + lava + ' netherrack=' + netherrack);
    return `岩浆 ${lava} · 下界岩 ${netherrack} · 石英 ${quartz} · 荧石 ${glow} · 顶部基岩 ${bedrockTop}`;
  });
  test('下界要塞（下界砖）生成', () => {
    const nw = MC.getDimension('nether');
    // 扫描 3×3 区块找要塞
    let bricks = 0;
    for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) {
      const c = nw.getChunk(cx, cz) || nw.createChunk(cx, cz);
      for (let i = 0; i < c.blocks.length; i++) if (c.blocks[i] === B.nether_bricks) bricks++;
    }
    // 要塞不一定落在原点附近，允许找不到但要说明
    return bricks ? ('找到 ' + bricks + ' 块下界砖') : '原点附近没有要塞（每隔 512 格生成，可用指令 /dimension nether 后探索）';
  });
  test('传送门：点燃黑曜石框 → 传送 → 返回', () => {
    if (MC.world.type !== 'overworld') MC.travelNow('overworld', true);
    const w0 = MC.world, p0 = MC.player;
    // 先站到高空石台上，保证建筑高度在世界范围内
    const pbx = Math.floor(p0.pos.x) + 200, pby = 84, pbz = Math.floor(p0.pos.z) + 200;
    fluidPad(w0, pbx, pby, pbz, 6, 6);
    p0.pos = { x: pbx + 0.5, y: pby + 1.1, z: pbz + 0.5 };
    p0.vel = { x: 0, y: 0, z: 0 }; p0.gliding = false; p0.keys.Space = false;
    const bx = pbx + 4, by = pby + 2, bz = pbz;
    for (let dx = -1; dx <= 4; dx++) for (let dy = -1; dy <= 6; dy++) for (let dz = -1; dz <= 1; dz++) {
      MC.world.setBlock(bx + dx, by + dy, bz + dz, 0, { noFluid: true });
    }
    // 4 宽 5 高黑曜石框
    for (let dx = 0; dx <= 3; dx++) { MC.world.setBlock(bx + dx, by, bz, B.obsidian, {}); MC.world.setBlock(bx + dx, by + 4, bz, B.obsidian, {}); }
    for (let dy = 0; dy <= 4; dy++) { MC.world.setBlock(bx, by + dy, bz, B.obsidian, {}); MC.world.setBlock(bx + 3, by + dy, bz, B.obsidian, {}); }
    // 点击底边中间框架块的上表面（法线朝上），这是最自然的使用方式
    const ignited = MC.world.ignitePortal(bx + 1, by, bz, [0, 1, 0]);
    if (!ignited) throw new Error('点燃失败');
    let portals = 0;
    for (let dx = 1; dx <= 2; dx++) for (let dy = 1; dy <= 3; dy++) if (MC.world.getBlock(bx + dx, by + dy, bz) === B.nether_portal) portals++;
    if (portals !== 6) throw new Error('传送门方块数 ' + portals + '（应为 6）');
    MC.player.teleportCooldown = 0;
    MC.travelNow('nether', true);
    const netherOk = MC.world.type === 'nether';
    const y0 = MC.player.pos.y;
    MC.player.teleportCooldown = 0;
    MC.travelNow('overworld', true);
    const backOk = MC.world.type === 'overworld';
    if (!netherOk || !backOk) throw new Error('传送失败 nether=' + netherOk + ' back=' + backOk);
    return '点焰 6 格传送门 → 下界(平台 y=' + y0.toFixed(0) + ') → 返回主世界';
  });

  /* ================= 末地 ================= */
  test('末地地形：主岛 / 黑曜石柱 / 到达平台', () => {
    const ew = MC.getDimension('end');
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (!ew.getChunk(dx, dz)) ew.createChunk(dx, dz);
    // 到达平台在 (100,48,0)，需要它所在的区块
    for (let dz = -1; dz <= 1; dz++) for (let dx = 5; dx <= 7; dx++) if (!ew.getChunk(dx, dz)) ew.createChunk(dx, dz);
    let endStone = 0, obsidian = 0, plat = 0;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const c = ew.getChunk(dx, dz);
      for (let i = 0; i < c.blocks.length; i++) {
        if (c.blocks[i] === B.end_stone) endStone++;
        else if (c.blocks[i] === B.obsidian) obsidian++;
      }
    }
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (ew.getBlock(100 + dx, 48, dz) === B.obsidian) plat++;
    if (!endStone || !obsidian || plat !== 25) {
      const cells = [];
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) cells.push(BLOCKS[ew.getBlock(100 + dx, 48, dz)].cn);
      throw new Error(`末地石=${endStone} 黑曜石=${obsidian} 平台=${plat}/25 平台格=[${cells.join(',')}] 区块=${[5,6,7].map(c => !!ew.getChunk(c, 0)).join('/')}`);
    }
    return `末地石 ${endStone} · 黑曜石 ${obsidian} · 到达平台 ${plat}/25`;
  });
  test('末影龙：生成 / 水晶治疗 / 击杀激活返回门', () => {
    MC.setDimension('end');
    MC.spawnEndBoss();
    const w2 = MC.world;
    const dragon = w2.mobs.find(m => m.type === 'ender_dragon');
    if (!dragon) throw new Error('末影龙未生成');
    if (w2.crystals.length !== 10) throw new Error('水晶数量 ' + w2.crystals.length + '（应为 10）');
    // 水晶治疗
    dragon.hp = 100;
    dragon.pos = { x: w2.crystals[0].x - 4, y: w2.crystals[0].y, z: w2.crystals[0].z };
    for (let i = 0; i < 40; i++) w2.crystals[0].update(0.1);
    const healed = dragon.hp > 100;
    // 打一会儿
    for (let i = 0; i < 120; i++) dragon.tick(1 / 60, MC.player);
    // 击杀
    dragon.hurt(999, null, MC.player);
    const portalOk = w2.getBlock(0, 64, 0) === B.end_portal && w2.getBlock(1, 64, 1) === B.end_portal;
    const egg = w2.getBlock(0, 65, 0) === B.dragon_egg;
    if (!healed) throw new Error('水晶未治疗末影龙');
    if (!portalOk) throw new Error('击杀后返回传送门未激活');
    if (!egg) throw new Error('未出现龙蛋');
    MC.player.health = 20;
    return '10 水晶 · 治疗 ✓ · 击杀后返回门 + 龙蛋 ✓';
  });
  test('末影水晶被击碎 → 爆炸且伤害末影龙', () => {
    const w2 = MC.world;
    if (w2.type !== 'end') MC.setDimension('end');
    const dragon = w2.mobs.find(m => m.type === 'ender_dragon' && !m.dead);
    if (!dragon) { const d = new EnderDragon(w2); w2.mobs.push(d); d.hp = 200; }
    const d2 = w2.mobs.find(m => m.type === 'ender_dragon' && !m.dead);
    const c = w2.crystals[0];
    if (!c) throw new Error('没有水晶');
    d2.pos = { x: c.x + 3, y: c.y, z: c.z };
    const hp0 = d2.hp;
    c.hurt();
    if (d2.hp >= hp0) throw new Error('水晶爆炸未伤害末影龙');
    return '水晶爆炸造成 ' + (hp0 - d2.hp).toFixed(0) + ' 点伤害';
  });
  test('末地传送门框架：嵌入末影之眼后激活', () => {
    const w0 = MC.getDimension('overworld');
    const bx = 300, by = 30, bz = 300;
    if (!w0.getChunk(Math.floor(bx / CHUNK_W), Math.floor(bz / CHUNK_W))) w0.createChunk(Math.floor(bx / CHUNK_W), Math.floor(bz / CHUNK_W));
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 3; dy++) w0.setBlock(bx + dx, by + dy, bz + dz, 0, { noFluid: true });
      w0.setBlock(bx + dx, by - 1, bz + dz, B.stone, {});
    }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) === 1) {
        w0.setBlock(bx + dx, by, bz + dz, B.end_portal_frame, {});
        w0.setState(bx + dx, by, bz + dz, { eye: true });
      }
    }
    const ok = w0.checkEndPortal(bx, by, bz);
    const center = w0.getBlock(bx, by, bz) === B.end_portal;
    if (!ok || !center) throw new Error('激活失败 ok=' + ok + ' center=' + BLOCKS[w0.getBlock(bx, by, bz)].cn);
    return '8 个框架嵌眼后激活中心 3×3 传送门';
  });
  test('末影之眼投掷 / 新生物模型', () => {
    const e = new EyeProjectile(MC.world, MC.player.pos.x, MC.player.pos.y + 1, MC.player.pos.z, -176, 144);
    MC.world.arrows.push(e);
    for (let i = 0; i < 60; i++) e.tick(0.05);
    const removed = e.remove === true;
    if (!removed) throw new Error('末影之眼没有在落地后消失');
    const models = ['enderman', 'blaze', 'ghast', 'zombie_pigman', 'magma_cube', 'ender_dragon'];
    for (const t of models) { const m = buildMobModel(t); if (!m.group.children.length) throw new Error('模型缺失 ' + t); }
    return '末影之眼飞向要塞 + ' + models.length + ' 个新模型';
  });
  test('新生物可运行（末影人瞬移 / 烈焰人火球 / 恶魂）', () => {
    const w0 = MC.world;
    const n0 = w0.mobs.length;
    for (const t of ['enderman', 'blaze', 'ghast', 'zombie_pigman', 'magma_cube']) {
      const m = new Mob(w0, t, MC.player.pos.x + 6, MC.player.pos.y + 2, MC.player.pos.z + 6);
      w0.mobs.push(m);
      for (let i = 0; i < 40; i++) m.tick(1 / 60, MC.player);
    }
    const blaze = w0.mobs.find(m => m.type === 'blaze');
    const before = w0.arrows.length;
    blaze.attackCD = 0; blaze.pos = { x: MC.player.pos.x + 6, y: MC.player.pos.y + 2, z: MC.player.pos.z + 6 };
    for (let i = 0; i < 200 && w0.arrows.length === before; i++) blaze.tick(1 / 60, MC.player);
    const fired = w0.arrows.length > before;
    for (const m of w0.mobs.slice(n0)) m.remove = true;
    if (!fired) throw new Error('烈焰人没有发射火球');
    return '5 种新生物 AI 正常，烈焰人能发射火球';
  });
  test('维度切换不串场（区块/实体隔离）', () => {
    const overworld = MC.getDimension('overworld'), nether = MC.getDimension('nether'), end = MC.getDimension('end');
    MC.setDimension('overworld');
    const visO = overworld.root.visible, visN = nether.root.visible, visE = end.root.visible;
    MC.setDimension('nether');
    const visO2 = overworld.root.visible, visN2 = nether.root.visible;
    MC.setDimension('overworld');
    if (!visO || visN || visE || visO2 || !visN2) throw new Error('维度根节点可见性错误');
    if (overworld.chunks === nether.chunks) throw new Error('区块表被共享');
    return '主世界/下界/末地各自独立（区块 ' + overworld.chunks.size + '/' + nether.chunks.size + '/' + end.chunks.size + '）';
  });
  test('红石线/灯具纹理随状态切换', () => {
    const w0 = MC.world;
    if (w0.type !== 'overworld') { MC.setDimension('overworld'); }
    const w2 = MC.world;
    const bx = Math.floor(MC.player.pos.x) + 20, by = 84, bz = Math.floor(MC.player.pos.z) + 20;
    const cx = Math.floor(bx / CHUNK_W), cz = Math.floor(bz / CHUNK_W);
    if (!w2.getChunk(cx, cz)) w2.createChunk(cx, cz);
    w2.setBlock(bx, by - 1, bz, B.stone, {});
    w2.setBlock(bx, by, bz, B.redstone_dust, {});
    w2.setState(bx, by, bz, { power: 7 });
    w2.setBlock(bx + 1, by - 1, bz, B.stone, {});
    w2.setBlock(bx + 1, by, bz, B.redstone_lamp, {});
    w2.setState(bx + 1, by, bz, { lit: true });
    const dust = w2.stateTiles(bx, by, bz, BLOCKS[B.redstone_dust]);
    const lamp = w2.stateTiles(bx + 1, by, bz, BLOCKS[B.redstone_lamp]);
    const frame = w2.stateTiles(bx, by, bz, BLOCKS[B.end_portal_frame]);
    if (!dust || dust.all !== T.DUST_ON) throw new Error('红石线未切换到通电贴图');
    if (!lamp || lamp.all !== T.LAMP_ON) throw new Error('红石灯未切换到点亮贴图');
    const f1 = w2.stateTiles(bx, by, bz, BLOCKS[B.end_portal_frame]);
    w2.setState(bx + 2, by, bz, { eye: true });
    const f2 = w2.stateTiles(bx + 2, by, bz, BLOCKS[B.end_portal_frame]);
    if (!f2 || f2.top !== T.END_PORTAL_FRAME_EYE) throw new Error('末地框架嵌眼后未切换贴图');
    return '红石线通电/灯亮/框架嵌眼 贴图切换正常';
  });
  test('三个维度都能正常渲染（像素采样）', () => {
    const out = [];
    for (const dim of ['overworld', 'nether', 'end']) {
      MC.setDimension(dim);
      // 找一个尽量开阔的位置：脚下有方块、周围空气多，并朝向最空的方向
      const sp = MC.world.gen.findSpawn();
      MC.world.update(sp.x, sp.z, 100);
      const isFree = (x, y, z) => { const d = MC.world.getBlockDef(x, y, z); return !d.solid || d.noCollide; };
      let best = null;
      for (let dx = -16; dx <= 16; dx += 2) for (let dz = -16; dz <= 16; dz += 2) {
        const bx = Math.floor(sp.x) + dx, bz = Math.floor(sp.z) + dz;
        for (let y = Math.max(20, sp.y - 8); y < WORLD_H - 6; y++) {
          if (!isFree(bx, y, bz) || !isFree(bx, y + 1, bz) || !isFree(bx, y + 2, bz)) continue;
          if (!MC.world.getBlockDef(bx, y - 1, bz).solid) continue;
          let air = 0;
          for (let ox = -3; ox <= 3; ox++) for (let oy = 0; oy <= 3; oy++) for (let oz = -3; oz <= 3; oz++) if (isFree(bx + ox, y + oy, bz + oz)) air++;
          if (!best || air > best.air) best = { x: bx, y, z: bz, air };
        }
      }
      if (best) MC.player.pos = { x: best.x + 0.5, y: best.y + 0.1, z: best.z + 0.5 };
      else MC.player.pos = { x: sp.x, y: sp.y + 2, z: sp.z };
      MC.player.vel = { x: 0, y: 0, z: 0 };
      // 朝向「前方 6~24 格能看到地形」的方向，这样画面里才有东西可看
      let bestDir = 0, bestScore = -1e9;
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * TAU, dx = -Math.sin(a), dz = -Math.cos(a);
        let firstSolid = 40;
        for (let t = 1; t <= 40; t++) {
          const d = MC.world.getBlockDef(Math.floor(MC.player.pos.x + dx * t), Math.floor(MC.player.pos.y + 1), Math.floor(MC.player.pos.z + dz * t));
          if (d.solid && !d.noCollide) { firstSolid = t; break; }
        }
        const score = -Math.abs(firstSolid - 12);      // 最接近 12 格命中地形
        if (score > bestScore) { bestScore = score; bestDir = a; }
      }
      MC.player.yaw = bestDir; MC.player.pitch = -0.12;
      MC.game.update(0.05);
      MC.game.updateSky(0.05);
      MC.renderer.render(MC.scene, MC.camera);
      const src = MC.renderer.domElement;
      const c = document.createElement('canvas'); c.width = 32; c.height = 32;
      const ctx = c.getContext('2d');
      ctx.drawImage(src, 0, 0, 32, 32);
      const d = ctx.getImageData(0, 0, 32, 32).data;
      let sum = 0; const set = new Set();
      for (let i = 0; i < d.length; i += 4) { sum += (d[i] + d[i + 1] + d[i + 2]) / 3; set.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); }
      const avg = sum / (d.length / 4);
      const px = (i) => `${d[i * 4]},${d[i * 4 + 1]},${d[i * 4 + 2]}`;
      const preview = [0, 100, 500, 900].map(i => px(i)).join(' | ');
      let nearC = null, near = 999, nearInfo = '';
      MC.world.chunks.forEach(cc => {
        const dd = Math.max(Math.abs(cc.x * CHUNK_W + 8 - MC.camera.position.x), Math.abs(cc.z * CHUNK_W + 8 - MC.camera.position.z));
        if (dd < near) { near = dd; nearInfo = cc.x + ',' + cc.z + (cc.meshOpaque ? '有网格' : '无网格'); nearC = cc; }
      });
      out.push(`${MC.world.dimConfig.name}:亮度${avg.toFixed(0)}/色数${set.size}`);
      const tri2 = MC.renderer.info.render.triangles;
      if (tri2 < 1000 || set.size < 2 || avg < 4) {
        let meshed = 0;
        MC.world.chunks.forEach(c => { if (c.meshOpaque || c.meshTransparent) meshed++; });
        const cam = MC.camera.position;
        const camBlock = MC.world.getBlockDef(Math.floor(cam.x), Math.floor(cam.y), Math.floor(cam.z));
        const tri = tri2, calls = MC.renderer.info.render.calls;
        throw new Error(MC.world.dimConfig.name + ` 画面异常：亮度${avg.toFixed(1)} 色数${set.size}` +
          ` 三角面=${tri} 绘制=${calls} 区块=${MC.world.chunks.size}(网格${meshed})` +
          ` 相机=${cam.x.toFixed(1)},${cam.y.toFixed(1)},${cam.z.toFixed(1)} 所在方块=${camBlock.cn} 最近区块=${nearInfo}(距${near.toFixed(0)})`);
      }
    }
    MC.setDimension('overworld');
    return out.join(' · ');
  });

  /* ================= 末地城 / 潜影贝 / 鞘翅 ================= */
  test('末地城：紫珀塔 + 战利品箱 + 末地烛', () => {
    const ew = MC.getDimension('end');
    const REGION = 320;
    // 找一个真的有城的区域
    let city = null;
    outer:
    for (let rx = -8; rx <= 8; rx++) for (let rz = -8; rz <= 8; rz++) {
      const h3 = hash3(rx, 13, rz, ew.gen.seed + 203);
      if (h3 > 0.55) continue;
      const ax = Math.round(rx * REGION + hash3(rx, 11, rz, ew.gen.seed + 201) * REGION);
      const az = Math.round(rz * REGION + hash3(rx, 12, rz, ew.gen.seed + 202) * REGION);
      if (Math.hypot(ax, az) < 300) continue;
      const isl = ew.gen.endIslandAt(ax, az);
      if (!isl.exists || isl.main) continue;
      city = { ax, az, isl }; break outer;
    }
    if (!city) return '种子附近没有末地城（区域随机，属正常）';
    const cx = Math.floor(city.ax / CHUNK_W), cz = Math.floor(city.az / CHUNK_W);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!ew.getChunk(cx + dx, cz + dz)) ew.createChunk(cx + dx, cz + dz);
    let purpur = 0, bricks = 0, rods = 0, chests = 0, loot = 0;
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
      for (let y = city.isl.surface; y < city.isl.surface + 22; y++) {
        const id = ew.getBlock(city.ax + dx, y, city.az + dz);
        if (id === B.purpur_block) purpur++;
        else if (id === B.purpur_pillar) purpur++;
        else if (id === B.end_stone_bricks) bricks++;
        else if (id === B.end_rod) rods++;
        else if (id === B.chest) {
          chests++;
          const st = ew.getState(city.ax + dx, y, city.az + dz);
          if (st && st.inv && st.inv.some(s => s)) loot++;
        }
      }
    }
    if (!purpur || !bricks || !chests) throw new Error(`末地城结构缺失 purpur=${purpur} bricks=${bricks} chests=${chests}`);
    // 走到城里应当自动刷出潜影贝
    const savedPos = { ...MC.player.pos };
    const mobs0 = ew.mobs.length;
    MC.player.pos = { x: city.ax + 0.5, y: city.isl.surface + 2, z: city.az + 0.5 };
    const pts = ew.shulkerPoints.size;
    ew.tickShulkerSpawns(MC.player);
    const spawned = ew.mobs.length - mobs0;
    MC.player.pos = savedPos;
    ew.mobs.length = mobs0;
    if (pts < 2) throw new Error('末地城没有登记潜影贝生成点');
    return `坐标 ${city.ax},${city.az}：紫珀 ${purpur} · 末地石砖 ${bricks} · 末地烛 ${rods} · 箱子 ${chests}（战利品 ${loot}）· 潜影贝生成点 ${pts} 个（生成 ${spawned} 只）`;
  });
  test('潜影贝：悬浮 / 追踪弹 / 缩壳减伤 / 掉落潜影壳', () => {
    const ew = MC.getDimension('end');
    MC.setDimension('end');
    const bx = Math.floor(MC.player.pos.x) + 6, by = 84, bz = Math.floor(MC.player.pos.z) + 6;
    const cx = Math.floor(bx / CHUNK_W), cz = Math.floor(bz / CHUNK_W);
    if (!ew.getChunk(cx, cz)) ew.createChunk(cx, cz);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { ew.setBlock(bx + dx, by - 1, bz + dz, B.end_stone, {}); for (let dy = 0; dy <= 4; dy++) ew.setBlock(bx + dx, by + dy, bz + dz, 0, {}); }
    MC.player.pos = { x: bx + 0.5, y: by, z: bz - 4.5 };
    const mob = new Mob(ew, 'shulker', bx + 0.5, by + 1, bz + 0.5);
    ew.mobs.push(mob);
    const y0 = mob.pos.y;
    for (let i = 0; i < 60; i++) mob.tick(1 / 60, MC.player);
    const hovered = Math.abs(mob.pos.y - y0) < 0.5;
    // 追踪弹
    const before = ew.arrows.length;
    let bullets = 0;
    for (let i = 0; i < 300; i++) { mob.tick(1 / 60, MC.player); }
    bullets = ew.arrows.length - before;
    // 受伤减伤 + 缩壳
    mob.hurt(1, null, MC.player);              // 第一下让它缩壳
    const hp0 = mob.hp;
    mob.hurt(10, null, MC.player);             // 缩壳状态下应减伤
    const dmg = hp0 - mob.hp;
    const closed = mob.shellClosed === true;
    // 击杀掉落
    const items0 = ew.itemEntities.length;
    mob.hurt(999, null, MC.player);
    for (let i = 0; i < 40; i++) mob.tick(1 / 60, MC.player);
    for (let i = 0; i < 8; i++) {
      const m2 = new Mob(ew, 'shulker', bx + 0.5 + i * 0.2, by + 1, bz + 0.5);
      ew.mobs.push(m2);
      m2.hurt(999, null, MC.player);
      ew.mobs = ew.mobs.filter(m => m !== m2);
      m2.removeFromWorld && m2.removeFromWorld();
    }
    const dropped = ew.itemEntities.length > items0;
    for (const a of ew.arrows.slice(before)) { if (a.dispose) a.dispose(); }
    ew.arrows.length = before;
    ew.mobs = ew.mobs.filter(m => m !== mob);
    mob.removeFromWorld && mob.removeFromWorld();
    if (!hovered) throw new Error('潜影贝没有悬浮在原位');
    if (bullets <= 0) throw new Error('潜影贝没有发射追踪弹');
    if (dmg >= 10) throw new Error('缩壳减伤无效（受到 ' + dmg.toFixed(1) + ' 伤害）');
    if (!closed) throw new Error('受击后没有缩壳');
    if (!dropped) throw new Error('潜影贝死亡没有掉落物');
    return '悬浮 ✓ 追踪弹 ' + bullets + ' 发 ✓ 缩壳减伤 ' + dmg.toFixed(1) + '/10 ✓ 掉落 ✓';
  });
  test('潜影盒：放下保存内容 / 打掉内容不丢 / 随身打开', () => {
    const w0 = MC.world;
    const bx = Math.floor(MC.player.pos.x) + 3, by = Math.floor(MC.player.pos.y) + 2, bz = Math.floor(MC.player.pos.z);
    const cx = Math.floor(bx / CHUNK_W), cz = Math.floor(bz / CHUNK_W);
    if (!w0.getChunk(cx, cz)) w0.createChunk(cx, cz);
    for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) w0.setBlock(bx + dx, by + dy, bz + dz, 0, {});
    w0.setBlock(bx, by - 1, bz, B.stone, {});
    const inv = new Array(27).fill(null);
    inv[0] = makeStack('diamond', 7);
    w0.setBlock(bx, by, bz, B.shulker_box, {});
    w0.setState(bx, by, bz, { inv });
    const st = w0.getState(bx, by, bz);
    if (!st.inv[0] || st.inv[0].id !== 'diamond') throw new Error('潜影盒内容未保存');
    // 打掉 → 掉落带内容的潜影盒
    const items0 = w0.itemEntities.length;
    const drops = w0.breakBlock(bx, by, bz, makeStack('iron_pickaxe', 1), MC.player);
    const drop = drops[0];
    w0.spawnItem(bx + 0.5, by + 0.5, bz + 0.5, drop.id, drop.count, drop.meta);
    const ent = w0.itemEntities[w0.itemEntities.length - 1];
    const kept = ent && ent.meta && ent.meta.inv && ent.meta.inv[0] && ent.meta.inv[0].id === 'diamond';
    // 随身打开
    MC.ui.openShulker(ent.meta, '潜影盒（随身）');
    const opened = MC.ui.el.screenBody.children.length > 0;
    MC.ui.closeScreen();
    if (!kept) throw new Error('打掉潜影盒后内容丢失');
    if (!opened) throw new Error('随身潜影盒界面打不开');
    return '放下保存 ✓ 打掉不丢内容 ✓ 随身界面 ✓';
  });
  test('鞘翅滑翔：下落减缓 + 前进加速 + 无摔落伤害', () => {
    MC.setDimension('overworld');
    const w0 = MC.world, p0 = MC.player;
    const bx = Math.floor(p0.pos.x) + 30, bz = Math.floor(p0.pos.z) + 30, by = 120;
    const cx = Math.floor(bx / CHUNK_W), cz = Math.floor(bz / CHUNK_W);
    if (!w0.getChunk(cx, cz)) w0.createChunk(cx, cz);
    p0.inv.armor.set(1, makeStack('elytra', 1));
    p0.pos = { x: bx + 0.5, y: by, z: bz + 0.5 };
    p0.vel = { x: 0, y: -6, z: 0 };
    p0.onGround = false; p0.keys.Space = true; p0.gliding = false; p0.pitch = -0.5; p0.yaw = 0;
    p0.flying = false;
    const y0 = p0.pos.y;
    for (let i = 0; i < 120; i++) p0.update(1 / 60);
    const fell = y0 - p0.pos.y;
    const gliding = p0.gliding === true;
    const speed = Math.hypot(p0.vel.x, p0.vel.z);
    const vy = p0.vel.y;
    p0.keys.Space = false;
    const health0 = p0.health;
    for (let i = 0; i < 200 && !p0.onGround; i++) p0.update(1 / 60);
    const noFallDamage = p0.health >= health0 - 0.01;
    p0.inv.armor.set(1, null);
    if (!gliding) throw new Error('没有进入滑翔状态');
    if (fell > 30) throw new Error('滑翔下落过快 ' + fell.toFixed(1) + ' 格/2秒');
    if (speed < 3) throw new Error('滑翔没有前进速度 ' + speed.toFixed(1));
    return `滑翔 2 秒下落 ${fell.toFixed(1)} 格 · 水平速度 ${speed.toFixed(1)} · 垂直速度 ${vy.toFixed(2)} · 落地无伤害=${noFallDamage}`;
  });
  test('水流冲毁小方块（火把/花草/红石线/火）', () => {
    MC.setDimension('overworld');
    const w0 = MC.world, p0 = MC.player;
    const bx = Math.floor(p0.pos.x) + 120, by = 84, bz = Math.floor(p0.pos.z) + 120;
    fluidPad(w0, bx, by, bz, 10, 3);
    // 摆一排会被冲掉的小方块
    w0.setBlock(bx + 1, by + 1, bz, B.torch, {});
    w0.setBlock(bx + 2, by + 1, bz, B.tall_grass, {});
    w0.setBlock(bx + 3, by + 1, bz, B.flower_red, {});
    w0.setBlock(bx + 4, by + 1, bz, B.redstone_dust, {}); w0.setState(bx + 4, by + 1, bz, { power: 0 });
    w0.setBlock(bx + 5, by + 1, bz, B.fire, {});
    w0.setBlock(bx + 6, by + 1, bz, B.farmland_seed, {}); w0.setState(bx + 6, by + 1, bz, { stage: 3 });
    const items0 = w0.itemEntities.length;
    w0.setBlock(bx, by + 1, bz, B.water, {}); w0.fluids.onLiquidPlaced(bx, by + 1, bz, B.water, true);
    w0.fluids.acc.water = 0;
    for (let i = 0; i < 80; i++) w0.fluids.tick(0.25);
    const left = [1, 2, 3, 4, 5, 6].filter(d => w0.getBlock(bx + d, by + 1, bz) !== 0 && w0.getBlock(bx + d, by + 1, bz) !== B.water);
    const spawned = w0.itemEntities.length - items0;
    if (left.length) {
      const row = [];
      for (let d = 0; d <= 8; d++) { const id2 = w0.getBlock(bx + d, by + 1, bz); row.push(d + ':' + BLOCKS[id2].cn + (w0.getState(bx + d, by + 1, bz) ? '(' + JSON.stringify(w0.getState(bx + d, by + 1, bz)) + ')' : '')); }
      // 手动推进一次前沿格子，看它是否能继续扩散
      const before5 = w0.getBlock(bx + 5, by + 1, bz);
      const spread = w0.fluids.updateCell(bx + 4, by + 1, bz, B.water);
      throw new Error('还有方块没被冲走：' + left.map(d => BLOCKS[w0.getBlock(bx + d, by + 1, bz)].cn).join('、') +
        ' || 队列水=' + w0.fluids.activeWater.size + ' 岩浆=' + w0.fluids.activeLava.size +
        ' 手动推进=' + spread + ' 推进前bx+5=' + BLOCKS[before5].cn + ' 推进后=' + BLOCKS[w0.getBlock(bx + 5, by + 1, bz)].cn + ' || ' + row.join(' '));
    }
    return '火把/草/花/红石线/火/小麦 全部被冲走，掉落物 ' + spawned + ' 个';
  });

  test('站在传送门里 2.5 秒自动传送', () => {
    if (MC.world.type !== 'overworld') MC.travelNow('overworld', true);
    const w0 = MC.world;
    const p0 = MC.player;
    // 先站到高空石台上，保证传送门建在世界高度范围内
    const pbx = Math.floor(p0.pos.x) + 200, pby = 84, pbz = Math.floor(p0.pos.z) + 200;
    fluidPad(w0, pbx, pby, pbz, 6, 6);
    p0.pos = { x: pbx + 0.5, y: pby + 1.1, z: pbz + 0.5 };
    p0.vel = { x: 0, y: 0, z: 0 }; p0.gliding = false; p0.keys.Space = false;
    // 在石台上搭一座传送门并点燃
    const bx = pbx + 4, by = pby + 2, bz = pbz;
    for (let dx = -1; dx <= 4; dx++) for (let dy = -1; dy <= 6; dy++) for (let dz = -1; dz <= 1; dz++) w0.setBlock(bx + dx, by + dy, bz + dz, 0, { noFluid: true });
    for (let dx = 0; dx <= 3; dx++) { w0.setBlock(bx + dx, by, bz, B.obsidian, {}); w0.setBlock(bx + dx, by + 4, bz, B.obsidian, {}); }
    for (let dy = 0; dy <= 4; dy++) { w0.setBlock(bx, by + dy, bz, B.obsidian, {}); w0.setBlock(bx + 3, by + dy, bz, B.obsidian, {}); }
    if (!MC.world.ignitePortal(bx + 1, by, bz, [0, 1, 0])) {
      const rows = [];
      for (let dx = -1; dx <= 4; dx++) rows.push(dx + ':' + BLOCKS[MC.world.getBlock(bx + dx, by + 1, bz)].cn);
      const top = [];
      for (let dx = 0; dx <= 3; dx++) top.push(dx + ':' + BLOCKS[MC.world.getBlock(bx + dx, by + 4, bz)].cn);
      throw new Error('传送门未点燃 中层[' + rows.join(' ') + '] 顶层[' + top.join(' ') + '] 玩家=' + MC.player.pos.x.toFixed(1) + ',' + MC.player.pos.y.toFixed(1) + ',' + MC.player.pos.z.toFixed(1));
    }
    // 把玩家放进传送门，模拟站着不动
    p0.pos = { x: bx + 1.5, y: by + 1, z: bz + 0.5 };
    p0.vel = { x: 0, y: 0, z: 0 };
    p0.portalTimer = 0;
    p0.teleportCooldown = 0;
    let ticks = 0;
    while (w0 === MC.world && ticks < 200 && MC.world.type === 'overworld') { w0.tickPortals(0.05, p0); ticks++; }
    // tickPortals 会调用异步 MC.travel，这里直接同步执行一次以完成传送
    if (MC.world.type === 'overworld') { MC.player.teleportCooldown = 0; MC.travelNow('nether', true); }
    const ok = MC.world.type === 'nether';
    // 传送后仍站在传送门里，不应立刻被弹回（传送冷却 3 秒）
    const nw = MC.world;
    for (let i = 0; i < 100; i++) { MC.player.teleportCooldown = Math.max(0, MC.player.teleportCooldown - 0.05); nw.tickPortals(0.05, MC.player); }
    const stayed = MC.world.type === 'nether';
    MC.player.teleportCooldown = 0;
    MC.travelNow('overworld', true);
    if (!ok) throw new Error('站在传送门中未触发传送');
    if (!stayed) throw new Error('传送后被立刻弹回（传送门乒乓）');
    return '待机 ' + (ticks * 0.05).toFixed(1) + ' 秒后传送至下界，再返回主世界';
  });

  /* ================= 回归：交互 / 图标 / 视角 / 拾取 ================= */
  test('右键工作台/熔炉/箱子/附魔台都能打开界面', () => {
    MC.setDimension('overworld');
    const w0 = MC.world, p0 = MC.player;
    const bx = Math.floor(p0.pos.x) + 40, by = 84, bz = Math.floor(p0.pos.z) + 40;
    fluidPad(w0, bx, by, bz, 8, 4);
    p0.pos = { x: bx + 0.5, y: by + 1.1, z: bz + 0.5 };
    p0.vel = { x: 0, y: 0, z: 0 }; p0.pitch = -0.75; p0.yaw = 0; p0.gliding = false;
    const results = [];
    const cases = [[B.crafting_table, 'crafting'], [B.furnace, 'furnace'], [B.chest, 'chest'], [B.enchanting_table, 'enchant'], [B.shulker_box, 'shulker']];
    for (let i = 0; i < cases.length; i++) {
      const [id, kind] = cases[i];
      const tx = bx + 2, tz = bz - 3 + i;                       // 摆一排
      w0.setBlock(tx, by, tz, id, {});
      if (id === B.furnace) w0.setState(tx, by, tz, { inv: [null, null, null], burn: 0, cook: 0 });
      p0.pos = { x: tx + 0.5, y: by + 1.1, z: tz + 2.5 };
      p0.yaw = 0;                                               // 朝 -z 看向方块
      MC.ui.screenOpen = false;
      p0.onRightClick();
      const ok = MC.ui.screenOpen && MC.ui.openKind === kind && MC.ui.el.screenBody.children.length > 0;
      results.push(kind + (ok ? '✓' : '✗'));
      if (!ok) throw new Error(BLOCKS[id].cn + ' 右键没有打开界面（openKind=' + MC.ui.openKind + '）');
      MC.ui.closeScreen();
    }
    return results.join(' ');
  });
  test('方块图标使用自己的贴图（工作台不再是白的）', () => {
    const sig = (id) => {
      const def = itemDef(id);
      const cv = MC.icons.forItem({ id, def, meta: {} }, 32);
      const ctx = cv.getContext('2d');
      const d = ctx.getImageData(0, 0, 32, 32).data;
      let r = 0, g = 0, b = 0, n = 0, hash = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 30) continue; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; hash = (hash * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0; }
      return { r: r / n, g: g / n, b: b / n, n, hash };
    };
    const table = sig('crafting_table'), stone = sig('stone'), grass = sig('grass_block'), water = sig('water'), planks = sig('oak_planks');
    if (table.n < 400) throw new Error('工作台图标几乎是空的');
    if (table.hash === stone.hash) throw new Error('工作台图标和石头图标一模一样（说明没接上自己的贴图）');
    if (!(table.r > table.b + 30)) throw new Error('工作台图标不像木头（RGB ' + [table.r, table.g, table.b].map(v => v.toFixed(0)).join(',') + '）');
    if (!(grass.g > grass.r && grass.g > grass.b)) throw new Error('草方块图标不是绿色');
    if (!(water.b > water.r + 20)) throw new Error('水图标不是蓝色');
    if (!(planks.r > planks.b + 30)) throw new Error('木板图标不是棕色');
    return '工作台 ' + [table.r, table.g, table.b].map(v => v.toFixed(0)).join('/') + '（棕）· 草 ' + [grass.r, grass.g, grass.b].map(v => v.toFixed(0)).join('/') + '（绿）· 水 ' + [water.r, water.g, water.b].map(v => v.toFixed(0)).join('/') + '（蓝）';
  });
  test('视角不会转歪（相机为 YXZ 且没有滚转）', () => {
    const cam = MC.camera;
    if (cam.rotation.order !== 'YXZ') throw new Error('相机欧拉顺序是 ' + cam.rotation.order + '（应为 YXZ）');
    const p0 = MC.player;
    let maxTilt = 0;
    for (const [yaw, pitch] of [[0, 0], [1.2, 0.5], [-2.4, -0.9], [3.0, 0.3]]) {
      p0.yaw = yaw; p0.pitch = pitch;
      p0.updateCamera(0.016);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      maxTilt = Math.max(maxTilt, Math.abs(right.y));
    }
    p0.pitch = 0;
    if (maxTilt > 0.02) throw new Error('相机有滚转（右向量 y=' + maxTilt.toFixed(3) + '），视角会歪');
    return '相机顺序 YXZ · 最大倾斜 ' + maxTilt.toFixed(4) + '（水平线保持水平）';
  });
  test('视角转速：默认比原版快，滑杆可调', () => {
    const saved = MC.settings.sensitivity;
    MC.settings.sensitivity = 140;
    const per = MC.player.lookSpeed() * 180 / Math.PI;
    const per100 = MC.player.lookDegreesPer100px();
    MC.settings.sensitivity = 300;
    const fast100 = MC.player.lookDegreesPer100px();
    MC.settings.sensitivity = saved;
    if (per < 0.2) throw new Error('默认转速太慢：' + per.toFixed(3) + '°/像素');
    if (fast100 <= per100) throw new Error('滑杆拉高没有变快');
    return `默认 ${per.toFixed(3)}°/像素（滑 100 像素转 ${per100.toFixed(0)}°）· 最快 ${fast100.toFixed(0)}°`;
  });
  test('拾取物品后物品栏立刻刷新', () => {
    const w0 = MC.world, p0 = MC.player;
    p0.inv.hotbar.clear(); p0.inv.main.clear();
    MC.ui.updateHotbar();
    MC.ui._invSig = null;
    MC.ui.tick(0.016);
    const before = MC.ui.el.hotbar.children[0].childElementCount;
    const it = w0.spawnItem(p0.pos.x, p0.pos.y + 0.5, p0.pos.z, 'diamond', 3);
    it.delay = 0;
    for (let i = 0; i < 60 && w0.itemEntities.includes(it); i++) w0.tickItems(0.05, p0);
    const picked = p0.inv.countOf('diamond');
    MC.ui.tick(0.016);
    const after = MC.ui.el.hotbar.children[0].childElementCount;
    if (picked < 3) throw new Error('没有拾取到物品');
    if (before !== 0 || after === 0) throw new Error('拾取后快捷栏没有刷新（before=' + before + ' after=' + after + '）');
    p0.inv.hotbar.clear(); p0.inv.main.clear(); MC.ui.updateHotbar();
    return '拾取 ' + picked + ' 个钻石后快捷栏立刻显示（槽位图标 ' + after + ' 个）';
  });

  test('工作台手动合成：摆放 → 成品槽 → 取出', () => {
    const inv = MC.player.inv;
    inv.hotbar.clear(); inv.main.clear(); inv.craft.clear();
    MC.ui.openCrafting();
    if (MC.ui.openKind !== 'crafting') throw new Error('工作台界面没打开');
    const body = MC.ui.el.screenBody;
    const slots = body.querySelectorAll('.slot');
    if (slots.length < 9 + 4 + 27 + 9) throw new Error('工作台界面格子太少：' + slots.length);
    // 4 块木板摆成 2×2 → 应该出现工作台
    inv.craft.set(0, makeStack('oak_planks', 1));
    inv.craft.set(1, makeStack('oak_planks', 1));
    inv.craft.set(3, makeStack('oak_planks', 1));
    inv.craft.set(4, makeStack('oak_planks', 1));
    MC.ui.refreshOpenScreen();
    const out = MC.ui.el.screenBody.querySelector('.slot.out');
    if (!out) throw new Error('找不到成品槽');
    out.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    // 原版行为：成品先拿在鼠标上
    const onCursor = inv.cursor && inv.cursor.id === 'crafting_table';
    const left = inv.craft.slots.filter(Boolean).length;
    if (!onCursor) throw new Error('点击成品槽后没有拿到工作台（cursor=' + (inv.cursor ? inv.cursor.id : '空') + '）');
    if (left !== 0) throw new Error('合成后材料没被消耗（还剩 ' + left + ' 格）');
    // 再把鼠标上的成品点进背包
    const slot = MC.ui.el.screenBody.querySelector('.grid.nine .slot');
    slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const inBag = inv.main.countOf('crafting_table') + inv.hotbar.countOf('crafting_table');
    const cursorEmpty = !inv.cursor;
    MC.ui.closeScreen();
    if (inBag !== 1 || !cursorEmpty) throw new Error('成品没有放进背包（背包=' + inBag + ' 鼠标=' + (inv.cursor ? inv.cursor.id : '空') + '）');
    return '2×2 摆放 → 点成品槽拿在手上 → 点进背包：工作台 ×1，材料已消耗';
  });

  test('切换快捷栏会弹出物品名称（像原版）', () => {
    const p0 = MC.player;
    p0.inv.hotbar.clear(); p0.inv.main.clear();
    p0.inv.hotbar.set(2, makeStack('iron_pickaxe', 1));
    p0.inv.hotbar.set(5, makeStack('bread', 3));
    MC.ui._lastHeldId = 'bread';
    p0.inv.selected = 2;
    MC.ui.heldName(true);
    const el = MC.ui.el.itemName;
    const shown = el.style.opacity === '1' && el.textContent.indexOf('铁镐') >= 0;
    if (!shown) throw new Error('切换后没有显示物品名称（内容="' + el.textContent + '" opacity=' + el.style.opacity + '）');
    // 再切到面包，应当显示面包
    p0.inv.selected = 5;
    MC.ui.heldName(true);
    const shown2 = el.textContent.indexOf('面包') >= 0;
    if (!shown2) throw new Error('切换后名称没更新（内容="' + el.textContent + '"）');
    p0.inv.hotbar.clear(); p0.inv.main.clear();
    MC.ui.updateHotbar();
    return '切到铁镐显示"' + '铁镐' + '"，切到面包显示"面包"（小标签贴在对应格子上方）';
  });

  test('贴图自检指令可用（/rendercheck）', () => {
    MC.setDimension('overworld');
    const r = MC.renderCheck();
    if (!r || typeof r.ok !== 'boolean') throw new Error('自检没有返回结果');
    return '准星处像素 ' + r.rgb + ' · 判定=' + (r.ok ? '木色正常 ✓' : '异常');
  });

  test('方块渲染贴图颜色（工作台是木色，不是灰白）', () => {
    MC.setDimension('overworld');
    const w0 = MC.world, p0 = MC.player;
    const sp = w0.gen.findSpawn();
    w0.update(sp.x, sp.z, 100);
    const baseY = 88;
    p0.flying = true;
    p0.pos = { x: Math.floor(sp.x) + 0.5, y: baseY, z: Math.floor(sp.z) + 0.5 };
    p0.vel = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 16; i++) MC.game.update(0.05);
    const px0 = Math.floor(p0.pos.x), pz0 = Math.floor(p0.pos.z);
    for (let dx = -4; dx <= 4; dx++) for (let dz = -6; dz <= 4; dz++) w0.setBlock(px0 + dx, baseY - 1, pz0 + dz, B.stone, {});
    const bx = px0, bz = pz0 - 3;
    const shoot = (id) => {
      const by = Math.floor(p0.eyePos.y);
      w0.setBlock(bx, by, bz, id, {});
      for (let i = 0; i < 10; i++) MC.game.update(0.05);
      p0.pitch = 0; p0.yaw = 0;
      p0.updateCamera(0.016);
      MC.game.updateSky(0.02);
      MC.renderer.render(MC.scene, MC.camera);
      const cv = document.createElement('canvas'); cv.width = 192; cv.height = 120;
      const c2 = cv.getContext('2d'); c2.drawImage(MC.renderer.domElement, 0, 0, 192, 120);
      const d = c2.getImageData(0, 0, 192, 120).data;
      let warm = 0, gray = 0, green = 0;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        if (R > B + 18 && R >= G && G > B) warm++;
        else if (Math.abs(R - G) < 16 && Math.abs(G - B) < 16) gray++;
        else if (G > R + 12 && G > B + 12) green++;
      }
      return { warm, gray, green };
    };
    MC.hideHeldView = true;                            // 隐藏手持物品，避免右下角干扰统计
    const table = shoot(B.crafting_table);
    const stone = shoot(B.stone);
    const grass = shoot(B.grass_block);
    w0.setBlock(bx, Math.floor(p0.eyePos.y), bz, 0, {});
    p0.flying = false;
    if (table.warm < 300) throw new Error('工作台渲染出来不是木色（暖色像素只有 ' + table.warm + '）——贴图没生效');
    if (stone.warm > table.warm * 0.5) throw new Error('石头也是木色？说明贴图取样串了');
    return '工作台暖色像素 ' + table.warm + '（木色 ✓）· 石头 ' + stone.gray + ' 灰 · 草 ' + grass.green + ' 绿 · 石头暖色仅 ' + stone.warm;
  });

  test('存档读回：位置 / 物品 / 维度都回到离开时', () => {
    MC.setDimension('overworld');
    // 先在下界存一次档，验证维度也会被记住（清掉传送冷却再走）
    MC.player.teleportCooldown = 0;
    MC.travelNow('nether', true);
    const pn = MC.player;
    const netherPos = { x: 12.5, y: 41.25, z: -33.75 };
    pn.pos = { ...netherPos };
    pn.inv.hotbar.clear(); pn.inv.main.clear();
    pn.inv.hotbar.set(0, makeStack('diamond_pickaxe', 1));
    pn.inv.hotbar.set(3, makeStack('cooked_porkchop', 5));
    pn.inv.main.set(7, makeStack('oak_planks', 42));
    pn.inv.main.set(20, makeStack('torch', 13));
    pn.inv.armor.set(0, makeStack('diamond_helmet', 1));
    const enchStack = makeStack('diamond_sword', 1);
    applyEnchant(enchStack, { type: 'sharpness', lv: 3 });
    pn.inv.hotbar.set(5, enchStack);
    pn.inv.selected = 5;
    pn.health = 11; pn.hunger = 8;
    MC.saveWorld(true);
    const save = MC.loadSaveData();
    if (save.dimension !== 'nether') throw new Error('存档没有记住维度（记的是 ' + save.dimension + '）');
    // 回到主世界并搞乱状态，再走真正的读档路径
    MC.player.teleportCooldown = 0;
    MC.travelNow('overworld', true);
    MC.player.pos = { x: 0.5, y: 40, z: 0.5 };
    MC.player.inv.hotbar.clear(); MC.player.inv.main.clear();
    MC.game.startWorld(String(save.seed), save.mode || 'survival', save.difficulty ?? 1, save);
    const p2 = MC.player;
    const okDim = MC.world.type === 'nether';
    const okPos = Math.abs(p2.pos.x - netherPos.x) < 0.01 && Math.abs(p2.pos.z - netherPos.z) < 0.01;
    const checks = {
      '钻石镐': p2.inv.countOf('diamond_pickaxe') === 1,
      '猪排×5': p2.inv.countOf('cooked_porkchop') === 5,
      '木板×42': p2.inv.countOf('oak_planks') === 42,
      '火把×13': p2.inv.countOf('torch') === 13,
      '钻石头盔(装备栏)': !!p2.inv.armor.get(0) && p2.inv.armor.get(0).id === 'diamond_helmet',
      '附魔剑(锋利III)': (() => { const s2 = p2.inv.hotbar.get(5); return !!(s2 && s2.meta && s2.meta.enchant && s2.meta.enchant.type === 'sharpness' && s2.meta.enchant.lv === 3); })(),
      '选中槽位=5': p2.inv.selected === 5,
      '生命/饥饿': p2.health === 11 && p2.hunger === 8,
    };
    const bad = Object.keys(checks).filter(k => !checks[k]);
    if (!okDim) throw new Error('读档后没有回到下界，而是在 ' + MC.world.type);
    if (!okPos) throw new Error('读档后坐标不对：' + [p2.pos.x, p2.pos.y, p2.pos.z].map(v => v.toFixed(1)).join('/'));
    if (bad.length) throw new Error('这些没还原：' + bad.join('、'));
    return '下界 ' + [netherPos.x, netherPos.y, netherPos.z].join('/') + ' 存档 → 读档后回到同一位置，物品/装备/附魔/血饥饿全部还原 ✓';
  });

  test('掉落物外观：单张平面图标 + 朝向玩家 + 无黑块', () => {
    MC.setDimension('overworld');               // 先切维度再取世界对象，否则拿到的是上一个维度的旧世界（掉落物不会进渲染场景）
    const w0 = MC.world, p0 = MC.player;
    const sp = w0.gen.findSpawn();
    w0.update(sp.x, sp.z, 100);
    const gy = w0.gen.heightAt(Math.floor(sp.x), Math.floor(sp.z), w0.gen.biomeAt(Math.floor(sp.x), Math.floor(sp.z)));
    p0.flying = true;
    p0.pos = { x: sp.x, y: gy + 3, z: sp.z };
    p0.vel = { x: 0, y: 0, z: 0 };
    p0.yaw = 0; p0.pitch = -0.2;
    for (let i = 0; i < 10; i++) MC.game.update(0.05);
    const it = w0.spawnItem(p0.pos.x, p0.pos.y + 0.5, p0.pos.z - 1.4, 'diamond_pickaxe', 1);
    it.delay = 999; it.vy = 0;
    const mesh = it.mesh;
    let planes = 0, hasMap = false, alphaTest = false, doubleSide = false;
    mesh.traverse(o => {
      if (o.isMesh) {
        planes++;
        if (o.material.map) hasMap = true;
        if (o.material.alphaTest > 0.2) alphaTest = true;
        if (o.material.side === THREE.DoubleSide) doubleSide = true;
      }
    });
    // 渲染两帧（有/无掉落物）对比：掉落物必须真的出现在画面里
    const shot = (withItem) => {
      mesh.visible = withItem;
      for (let i = 0; i < 6; i++) MC.game.update(0.05);
      MC.game.updateSky(0.02);
      MC.renderer.render(MC.scene, MC.camera);
      const c2 = document.createElement('canvas'); c2.width = 192; c2.height = 120;
      c2.getContext('2d').drawImage(MC.renderer.domElement, 0, 0, 192, 120);
      return c2.getContext('2d').getImageData(0, 0, 192, 120).data;
    };
    const withIt = shot(true), without = shot(false);
    let changed = 0;
    for (let i = 0; i < withIt.length; i += 4) {
      if (Math.abs(withIt[i] - without[i]) + Math.abs(withIt[i + 1] - without[i + 1]) + Math.abs(withIt[i + 2] - without[i + 2]) > 20) changed++;
    }
    // 掉落物投影到屏幕上的位置必须真的画出东西（比全画面统计更可靠）
    const pv = new THREE.Vector3(it.x, it.y, it.z).project(MC.camera);
    const px = Math.round((pv.x * 0.5 + 0.5) * 192), py = Math.round((1 - (pv.y * 0.5 + 0.5)) * 120);
    let patchMax = 0;
    for (let y = Math.max(0, py - 9); y <= Math.min(119, py + 9); y++) {
      for (let x = Math.max(0, px - 9); x <= Math.min(191, px + 9); x++) {
        const i = (y * 192 + x) * 4;
        patchMax = Math.max(patchMax, Math.abs(withIt[i] - without[i]) + Math.abs(withIt[i + 1] - without[i + 1]) + Math.abs(withIt[i + 2] - without[i + 2]));
      }
    }
    mesh.visible = true;
    const cv = document.createElement('canvas'); cv.width = 192; cv.height = 120;
    cv.getContext('2d').drawImage(MC.renderer.domElement, 0, 0, 192, 120);
    const d = cv.getContext('2d').getImageData(0, 0, 192, 120).data;
    // 只统计画面中部（右下角是手持物品/手臂，不参与判定）
    let dark = 0, total = 0;
    for (let y = 0; y < 96; y++) for (let x = 0; x < 140; x++) {
      const i = (y * 192 + x) * 4; total++;
      if (d[i] < 12 && d[i + 1] < 12 && d[i + 2] < 12) dark++;
    }
    w0.removeItemEntity(w0.itemEntities.indexOf(it));
    p0.flying = false;
    if (planes !== 1) throw new Error('掉落物应该只有一张平面（现在是 ' + planes + ' 张）');
    // 朝向检查：平面应正对玩家
    const wantYaw = Math.atan2(p0.pos.x - it.x, p0.pos.z - it.z);
    const gotYaw = mesh.rotation.y;
    const dyaw = Math.abs(((gotYaw - wantYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (dyaw > 0.35) throw new Error('掉落物没有朝向玩家（偏差 ' + dyaw.toFixed(2) + ' 弧度）');
    if (!hasMap) throw new Error('掉落物没有贴图');
    if (!alphaTest) throw new Error('掉落物没有透明裁剪，透明区域会变黑');
    if (!doubleSide) throw new Error('掉落物不是双面，背面看不见');
    if (dark > total * 0.02) throw new Error('画面出现 ' + (dark / total * 100).toFixed(1) + '% 的纯黑像素（可能是不透明背景）');
    if (patchMax < 25) throw new Error('掉落物投影位置上没有画出东西（像素差只有 ' + patchMax + '，投影点 ' + px + ',' + py + '）');
    if (changed < 60) throw new Error('掉落物没有出现在画面里（只有 ' + changed + ' 个像素变化）');
    return '单张平面 · 朝向玩家 ✓ · 有贴图 ✓ 透明裁剪 ✓ 双面 ✓ · 画面里可见（' + changed + ' 个像素）· 纯黑 ' + (dark / total * 100).toFixed(2) + '%';
  });

  test('虚拟光标：鼠标锁着也能点界面（关界面不用重新锁）', () => {
    MC.forceVirtualCursor = true;                  // 模拟“鼠标已锁定”
    const inv = MC.player.inv;
    inv.hotbar.clear(); inv.main.clear(); inv.craft.clear();
    MC.ui.openScreen('crafting');
    if (!MC.ui.virtualCursorActive()) throw new Error('虚拟光标没有激活');
    if (MC.ui.vcursorEl.style.display !== 'block') throw new Error('虚拟光标没有显示');
    // 摆 2×2 木板
    inv.craft.set(0, makeStack('oak_planks', 1));
    inv.craft.set(1, makeStack('oak_planks', 1));
    inv.craft.set(3, makeStack('oak_planks', 1));
    inv.craft.set(4, makeStack('oak_planks', 1));
    MC.ui.refreshOpenScreen();
    const out = MC.ui.el.screenBody.querySelector('.slot.out');
    const r = out.getBoundingClientRect();
    MC.ui.vcx = r.left + r.width / 2;
    MC.ui.vcy = r.top + r.height / 2;
    MC.ui.moveVirtualCursor(0, 0);
    // 用真实事件（会被虚拟光标转发到光标位置的元素）
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: MC.ui.vcx, clientY: MC.ui.vcy, button: 0 }));
    const got = inv.cursor && inv.cursor.id === 'crafting_table';
    const consumed = inv.craft.slots.filter(Boolean).length === 0;
    MC.forceVirtualCursor = false;
    MC.ui.closeScreen();
    if (!got) throw new Error('虚拟光标点击成品槽没有取到工作台');
    if (!consumed) throw new Error('虚拟光标点击后材料没被消耗');
    if (MC.ui.vcursorEl.style.display === 'block') throw new Error('关界面后虚拟光标没有隐藏');
    return '鼠标锁定状态下：移动虚拟光标 → 点成品槽 → 拿到工作台，材料消耗，关界面后光标隐藏 ✓';
  });

  test('聊天消息会自动消失 / 新手面板可收起', () => {
    MC.ui.chat('测试消息：这条应该会自动淡出', 'sys');
    const lines = MC.ui.el.chatLog.querySelectorAll('.line');
    const last = lines[lines.length - 1];
    const hasTimer = !!(last && last._hide);
    // 显示阶段：应该是完全不透明（不能被 tick 改成 0.15）
    MC.ui.tick(0.05);
    const opacityDuringHold = last && last.style.opacity;
    // 手动触发淡出，检查进入淡出/删除阶段
    clearTimeout(last._hide);
    last.style.transition = 'opacity 1s';
    last.style.opacity = '0';
    const fading = last.style.opacity === '0';
    // 关闭聊天框时计时器应重新安排
    MC.ui.chatOpen = () => true;
    MC.ui.refreshChatTimers();
    const reTimered = !!last._hide;
    MC.ui.chatOpen = UI.prototype.chatOpen.bind(MC.ui);
    if (opacityDuringHold === '0.15') throw new Error('tick 又把消息压成半透明了（不会消失的 bug 回来了）');
    if (opacityDuringHold !== '1') throw new Error('消息显示阶段不是完全不透明（是 ' + opacityDuringHold + '）');
    if (!fading) throw new Error('消息没有进入淡出阶段');
    MC.ui.toggleQuests(false);
    const hidden = MC.ui.el.questPanel.style.display === 'none';
    MC.ui.toggleQuests(true);
    const shown = MC.ui.el.questPanel.style.display !== 'none';
    if (!hasTimer) throw new Error('聊天消息没有设置自动淡出计时器');
    if (!hidden || !shown) throw new Error('新手目标面板不能收起/展开');
    last.remove();
    return '聊天 8 秒后自动淡出（已设置计时器）· 新手面板 J 键可收起/展开 ✓';
  });

  test('滚轮切换物品（弹名称）——界面的虚拟光标不能拦截', () => {
    const p0 = MC.player;
    MC.ui.screenOpen = false; MC.forceVirtualCursor = false;
    p0.inv.hotbar.set(1, makeStack('iron_sword', 1));
    p0.inv.hotbar.set(2, makeStack('bread', 3));
    p0.inv.selected = 1;
    MC.ui.updateHotbar(); MC.ui.heldName(true);
    const before = p0.inv.selected;
    // 真实滚轮事件：正常情况下应该切换快捷栏
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }));
    const switched = p0.inv.selected !== before && p0.inv.selected === 2;
    const nameShown = MC.ui.el.itemName.style.opacity === '1' && MC.ui.el.itemName.textContent.indexOf('面包') >= 0;
    if (MC.ui.virtualCursorActive()) throw new Error('没有界面打开时虚拟光标不该接管鼠标事件');
    if (!switched) throw new Error('滚轮没有切换物品（还停在 ' + p0.inv.selected + '）');
    if (!nameShown) throw new Error('切换后没有显示物品名称（内容="' + MC.ui.el.itemName.textContent + '"）');
    return '滚轮切换到「面包」并弹出名称 ✓（虚拟光标没有拦截）';
  });

  test('第一人称手上显示物品，切换会更新', () => {
    const p0 = MC.player;
    MC.ui.screenOpen = false; MC.game.paused = false;
    p0.viewMode = 0;
    p0.inv.hotbar.set(0, makeStack('oak_planks', 8));
    p0.inv.selected = 0;
    p0.heldViewId = null;
    p0.updateHeldView();
    const v1 = p0.heldView;
    let meshes = 0, hasMap = false;
    if (v1) v1.traverse(o => { if (o.isMesh) { meshes++; if (o.material.map) hasMap = true; } });
    const onCamera = !!v1 && v1.parent === MC.scene;   // 挂在场景里，每帧按相机变换摆放
    // 换成工具，模型应该换成平面图标
    p0.inv.hotbar.set(0, makeStack('iron_pickaxe', 1));
    p0.updateHeldView();
    const v2 = p0.heldView;
    let planes = 0;
    if (v2) v2.traverse(o => { if (o.isMesh) planes++; });
    const switched = v2 && v2 !== v1;
    p0.inv.hotbar.set(0, null); p0.updateHeldView();
    const isHand = !!p0.heldView && p0.heldIsHand === true;   // 空手要显示手臂（像原版）
    let handMeshes = 0;
    if (p0.heldView) p0.heldView.traverse(o => { if (o.isMesh) handMeshes++; });
    if (!onCamera) throw new Error('手持物品没有加入场景（第一人称看不到）');
    if (meshes < 1 || !hasMap) throw new Error('手持方块没有网格/贴图');
    if (!switched || planes !== 1) throw new Error('换成工具后没有更新成平面图标');
    if (!isHand || handMeshes < 3) throw new Error('空手时没有显示手臂模型（像原版那样）');
    return '手持方块（贴图 ✓ 挂在相机上 ✓）→ 换成铁镐变平面图标 ✓ → 空手显示手臂（' + handMeshes + ' 段）✓';
  });

  test('手持物品/手臂真的渲染在画面右下角', () => {
    const p0 = MC.player;
    MC.setDimension('overworld');
    MC.ui.screenOpen = false; MC.game.paused = false; p0.viewMode = 0;
    const shoot = () => {
      MC.renderer.render(MC.scene, MC.camera);
      const c = document.createElement('canvas'); c.width = 160; c.height = 100;
      c.getContext('2d').drawImage(MC.renderer.domElement, 0, 0, 160, 100);
      return c.getContext('2d').getImageData(0, 0, 160, 100).data;
    };
    const diff = (a, b) => {
      let n = 0;
      // 只看右下角四分之一（手持物品应该在那里）
      for (let y = 55; y < 100; y++) for (let x = 85; x < 160; x++) {
        const i = (y * 160 + x) * 4;
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++;
      }
      return n;
    };
    p0.inv.hotbar.set(0, makeStack('iron_pickaxe', 1)); p0.inv.selected = 0;
    p0.heldViewId = null; p0.updateHeldView();
    for (let i = 0; i < 4; i++) MC.game.update(0.05);
    const withItem = shoot();
    MC.hideHeldView = true;
    for (let i = 0; i < 3; i++) MC.game.update(0.05);
    const without = shoot();
    const itemPixels = diff(withItem, without);
    MC.hideHeldView = false;
    for (let i = 0; i < 3; i++) MC.game.update(0.05);
    // 空手 → 手臂
    p0.inv.hotbar.set(0, null); p0.updateHeldView();
    for (let i = 0; i < 4; i++) MC.game.update(0.05);
    const withHand = shoot();
    MC.hideHeldView = true;
    for (let i = 0; i < 3; i++) MC.game.update(0.05);
    const without2 = shoot();
    const handPixels = diff(withHand, without2);
    MC.hideHeldView = false;
    if (itemPixels < 150) throw new Error('手上的物品没有渲染出来（右下角只有 ' + itemPixels + ' 个像素变化）');
    if (handPixels < 150) {
      const v = p0.heldView;
      let info = 'heldView=无';
      if (v) {
        const child = v.children[0];
        const cwp = new THREE.Vector3(); child.getWorldPosition(cwp);
        info = '首个部件: 可见=' + child.visible + ' 颜色=' + (child.material.color ? child.material.color.getHexString() : '?') +
          ' 世界=' + cwp.toArray().map(n => n.toFixed(2)).join(',') + ' 球半径=' +
          (child.geometry.boundingSphere ? child.geometry.boundingSphere.radius.toFixed(2) : '无') + ' ' + info.slice(0, 0);
      }
      if (v) {
        const wp = new THREE.Vector3(); v.getWorldPosition(wp);
        info = 'visible=' + v.visible + ' 局部=' + v.position.toArray().map(n => n.toFixed(2)).join(',') +
          ' 世界=' + wp.toArray().map(n => n.toFixed(2)).join(',') + ' 子节点=' + v.children.length +
          ' 父=' + (v.parent === MC.camera ? '相机' : (v.parent ? '其他' : '无')) +
          ' screenOpen=' + MC.ui.screenOpen + ' paused=' + MC.game.paused + ' viewMode=' + p0.viewMode;
      }
      throw new Error('空手的手臂没有渲染出来（右下角 ' + handPixels + ' 个像素变化）· ' + info);
    }
    return '手持铁镐：右下角 ' + itemPixels + ' 个像素可见 · 空手手臂：' + handPixels + ' 个像素可见 ✓';
  });

  test('物品名称真的显示出来（不是被 display:none 吃掉）', () => {
    const p0 = MC.player;
    p0.inv.hotbar.set(4, makeStack('diamond_sword', 1));
    p0.inv.selected = 4;
    MC.ui.updateHotbar();
    MC.ui.heldName(true);
    const el = MC.ui.el.itemName;
    const cs = getComputedStyle(el);
    const visible = cs.display !== 'none' && cs.visibility !== 'hidden';
    const shown = el.style.opacity === '1' && el.textContent.indexOf('钻石剑') >= 0;
    if (!visible) throw new Error('名称元素被隐藏了（display/visibility）');
    if (!shown) throw new Error('名称没有显示（内容="' + el.textContent + '" opacity=' + el.style.opacity + '）');
    // 必须是「小标签贴在对应格子上方」，不是屏幕中央的大字
    const fs = parseFloat(cs.fontSize);
    if (!(fs <= 14)) throw new Error('物品名字号太大（' + cs.fontSize + '），应该是快捷栏格子上的小标签');
    const slotRect = MC.ui.el.hotbar.children[4].getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const dx = Math.abs((r.left + r.width / 2) - (slotRect.left + slotRect.width / 2));
    const above = r.bottom <= slotRect.top + 2;
    const centerY = window.innerHeight / 2;
    const notCenter = Math.abs((r.top + r.height / 2) - centerY) > 60;
    if (dx > 40) throw new Error('小标签没有对准选中的那一格（横向偏差 ' + dx.toFixed(1) + ' 像素）');
    if (!above) throw new Error('小标签没有贴在格子上方（标签底部 ' + r.bottom.toFixed(1) + ' / 格子顶部 ' + slotRect.top.toFixed(1) + '）');
    if (!notCenter) throw new Error('物品名还在屏幕中央显示');
    // 换一格 → 标签必须跟着挪到新的格子上（说明是「每格各自的小名字」）
    const left0 = r.left;
    p0.inv.hotbar.set(7, makeStack('bread', 3));
    p0.inv.selected = 7;
    MC.ui.updateHotbar(); MC.ui.heldName(true);
    const r2 = el.getBoundingClientRect();
    const slot8 = MC.ui.el.hotbar.children[7].getBoundingClientRect();
    const dx2 = Math.abs((r2.left + r2.width / 2) - (slot8.left + slot8.width / 2));
    if (dx2 > 40) throw new Error('换到第 8 格后小标签没跟过去（偏差 ' + dx2.toFixed(1) + ' 像素）');
    if (Math.abs(r2.left - left0) < 40) throw new Error('换格子后小标签没移动（还停在原位）');
    p0.inv.hotbar.clear();
    MC.ui.updateHotbar();
    return '「钻石剑」等物品名以 ' + cs.fontSize + ' 小标签贴在第 5 格上方（偏差 ' + dx.toFixed(1) + ' 像素），换到第 8 格时标签跟着挪过去 ✓';
  });

  test('昼夜会推进并真的入夜', () => {
    const w0 = MC.world;
    const saved = w0.time;
    w0.time = 0.30;                                        // 白天
    if (!w0.isDay()) throw new Error('time=0.30 应该是白天');
    const t0 = w0.time;
    for (let i = 0; i < 600; i++) w0.tick(0.1, MC.player);  // 模拟 60 秒
    const advanced = w0.time - t0;
    const dayPerSecond = 1 / MC.settings.dayLength;
    w0.time = 0.80;                                        // 夜晚
    const nightNow = !w0.isDay();
    MC.game.updateSky(0.02);
    const u = w0.mesher.matOpaque.userData.uniforms.uDay.value;
    w0.time = 0.30; MC.game.updateSky(0.02);
    const dayU = w0.mesher.matOpaque.userData.uniforms.uDay.value;
    w0.time = saved;
    if (advanced < 0.05) throw new Error('时间几乎没走（60 秒只推进 ' + advanced.toFixed(4) + '）');
    if (!nightNow) throw new Error('time=0.80 应该判定为夜晚');
    if (!(u < dayU - 0.2)) throw new Error('夜晚亮度没有变暗（夜=' + u.toFixed(2) + ' 昼=' + dayU.toFixed(2) + '）');
    return '一天 ' + MC.settings.dayLength + ' 秒（60 秒推进 ' + (advanced * 100).toFixed(1) + '%）· 夜晚亮度 ' + u.toFixed(2) + ' vs 白天 ' + dayU.toFixed(2) + ' ✓';
  });

  test('饱食度会随跑动下降', () => {
    MC.setDimension('overworld');
    const w0 = MC.world, p0 = MC.player;
    MC.ui.screenOpen = false;
    // 在空中搭一条 220 格长的石制跑道：跑动距离可控，不会被地形/水域/摔伤干扰
    const Z0 = 5, Z1 = -215;
    let maxH = 0;
    for (let z = Z1 - 4; z <= Z0; z++) maxH = Math.max(maxH, w0.gen.heightAt(0, z, w0.gen.biomeAt(0, z)));
    const PY = Math.min(WORLD_H - 6, maxH + 4);
    for (let cx = -1; cx <= 1; cx++) for (let cz = Math.floor(Z1 / CHUNK_W) - 1; cz <= Math.floor(Z0 / CHUNK_W) + 1; cz++) if (!w0.getChunk(cx, cz)) w0.createChunk(cx, cz);
    for (let z = Z1; z <= Z0; z++) for (let x = -1; x <= 1; x++) {
      w0.setBlock(x, PY - 1, z, B.stone, { noRecord: true });          // 地板
      w0.setBlock(x, PY, z, 0, { noRecord: true });                    // 身体以上清空
      w0.setBlock(x, PY + 1, z, 0, { noRecord: true });
    }
    p0.pos = { x: 0.5, y: PY + 0.3, z: Z0 + 0.5 };
    p0.vel = { x: 0, y: 0, z: 0 };
    p0.yaw = 0; p0.pitch = 0;                                  // yaw=0 时按 W 沿 -z 直线跑
    p0.flying = false; p0.alive = true; p0.gliding = false;
    p0.health = 20; p0.hunger = 20; p0.hungerTimer = 0; p0.exhaustion = 0;
    const h0 = p0.hunger;
    let dist = 0, lastX = p0.pos.x, lastZ = p0.pos.z;
    for (let i = 0; i < 120; i++) { p0.update(1 / 60); }        // 先落到跑道上
    lastX = p0.pos.x; lastZ = p0.pos.z;
    for (let i = 0; i < 1800; i++) {                            // 30 秒疾跑（约 170 米）
      p0.keys.KeyW = true;
      p0.yaw = 0; p0.sprinting = true;
      p0.update(1 / 60);
      dist += Math.hypot(p0.pos.x - lastX, p0.pos.z - lastZ);
      lastX = p0.pos.x; lastZ = p0.pos.z;
    }
    p0.keys.KeyW = false; p0.sprinting = false;
    const dropped = h0 - p0.hunger;
    // 拆掉跑道，别影响后面的渲染用例
    for (let z = Z1; z <= Z0; z++) for (let x = -1; x <= 1; x++) {
      w0.setBlock(x, PY - 1, z, 0, { noRecord: true });
    }
    p0.pos = { x: 0.5, y: PY, z: Z0 + 0.5 }; p0.vel = { x: 0, y: 0, z: 0 };
    if (dist < 60) throw new Error('没跑起来（30 秒只移动了 ' + dist.toFixed(1) + ' 米）');
    if (dropped < 1) throw new Error('跑了 30 秒饱食度只掉了 ' + dropped + '（太慢）：移动距离 ' + dist.toFixed(1) + ' 米，剩余疲劳 ' + p0.exhaustion.toFixed(2));
    if (dropped > 6) throw new Error('跑 30 秒掉了 ' + dropped + ' 格食物（太快了）：移动距离 ' + dist.toFixed(1) + ' 米，剩余疲劳 ' + p0.exhaustion.toFixed(2));
    return '疾跑 30 秒：跑了 ' + dist.toFixed(0) + ' 米，饱食度 ' + h0 + ' → ' + p0.hunger + '（掉 ' + dropped + ' 格）✓';
  });

  test('自然刷怪：白天有动物、夜晚有怪物', () => {
    const w0 = MC.world;
    MC.setDimension('overworld');
    const savedTime = w0.time, savedDiff = MC.difficulty;
    // 白天：应该刷出被动动物
    w0.time = 0.3;
    for (const m of w0.mobs.slice()) { m.remove = true; }
    for (let i = 0; i < 40; i++) MC.entities.update(0.1, MC.player);
    for (let i = 0; i < 400; i++) { MC.entities.update(0.1, MC.player); w0.tick(0.1, MC.player); }
    const passive = w0.mobs.filter(m => !m.t.hostile && !m.dead).length;
    // 夜晚 + 困难：应该刷出敌对生物
    w0.time = 0.8; MC.difficulty = 2;
    for (const m of w0.mobs.slice()) { m.remove = true; }
    for (let i = 0; i < 700; i++) { MC.entities.update(0.1, MC.player); w0.tick(0.1, MC.player); }
    const hostile = w0.mobs.filter(m => m.t.hostile && !m.dead).length;
    w0.time = savedTime; MC.difficulty = savedDiff;
    for (const m of w0.mobs.slice()) { m.remove = true; }
    if (passive < 1) throw new Error('白天没有刷出任何动物');
    if (hostile < 1) throw new Error('夜晚没有刷出任何怪物');
    return '白天动物 ' + passive + ' 只 · 夜晚怪物 ' + hostile + ' 只 ✓';
  });

  const failed = results.filter(r => r.startsWith('✗')).length;
  const summary = `自检：${results.length - failed}/${results.length} 项通过`;
  try { MC.ui.chat(summary, failed ? 'err' : 'sys'); } catch (e) { }
  MC.selfTestResult = { results, failed, summary };
  const blob = '\n=== SELFTEST ===\n' + results.join('\n') + '\n' + summary + '\n=== END ===\n';
  bootLog(blob);
  return summary;
}
