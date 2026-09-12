/* ============================================================
   玩家：控制、物理、挖掘、放置、战斗、相机
   ============================================================ */

class Player {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    this.isPlayer = true;
    this.pos = { x: 0.5, y: 50, z: 0.5 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.pitch = 0;
    this.width = 0.6; this.height = 1.8; this.eye = 1.62;
    this.onGround = false;
    this.sneaking = false; this.sprinting = false; this.flying = false;
    this.swimming = false;
    this.inWater = false; this.inLava = false;
    this.health = 20; this.maxHealth = 20;
    this.hunger = 20; this.saturation = 5; this.exhaustion = 0;
    this.air = 300;
    this.xp = 0; this.level = 0;
    this.alive = true;
    this.creative = false;
    this.fallStartY = null;
    this.hurtTimer = 0; this.invuln = 0;
    this.lastDamageTime = 0; this.regenTimer = 0; this.hungerTimer = 0;
    this.mining = { active: false, x: 0, y: 0, z: 0, progress: 0, soundTimer: 0 };
    this.attackCD = 0;
    this.swingTimer = 0;
    this.eatTimer = 0;
    this.spawnPoint = { x: 0.5, y: 50, z: 0.5 };
    this.viewMode = 0;
    this.thirdModel = null;
    this.bobTimer = 0;
    this.stepDistance = 0;
    this.inv = new PlayerInv();
    this.keys = {};
    this.mouse = { left: false, right: false };
  }

  get box() { return new Box(this.pos.x - this.width / 2, this.pos.y, this.pos.z - this.width / 2, this.pos.x + this.width / 2, this.pos.y + this.height, this.pos.z + this.width / 2); }
  get eyePos() { return { x: this.pos.x, y: this.pos.y + (this.sneaking ? this.eye - 0.25 : this.eye), z: this.pos.z }; }

  /* ================= 输入 ================= */
  attachInput(canvas) {
    const isTyping = () => {
      const el = document.activeElement;
      return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    };
    window.addEventListener('keydown', (e) => {
      if (isTyping()) return;
      const k = e.code;
      this.keys[k] = true;
      if (k === 'Space' && !e.repeat) {
        if (this.flying) this.vel.y = 6;
        else if (this.inWater) this.vel.y = 3.6;
        else if (this.onGround) { this.vel.y = 8.2; this.exhaustion += 0.2; }
        e.preventDefault();
      }
      if (k >= 'Digit1' && k <= 'Digit9') { this.inv.selected = +k.slice(5) - 1; MC.ui.updateHotbar(); MC.ui.heldName(true); }
      if (k === 'KeyF' && this.creative && !e.repeat) {
        this.flying = !this.flying;
        MC.ui.toast(this.flying ? '飞行：开' : '飞行：关', 'info');
      }
      if (k === 'KeyQ' && !e.repeat) this.dropHeld();
      if (k === 'F5') { this.viewMode = (this.viewMode + 1) % 2; MC.ui.toast(this.viewMode ? '第三人称' : '第一人称', 'info'); }
      if (k === 'F3') MC.ui.toggleDebug();
      if (k === 'KeyP' && !e.repeat) MC.screenshot();
      if (k === 'ShiftLeft' || k === 'ShiftRight') this.sneaking = true;
      if (k === 'ControlLeft' || k === 'ControlRight') this.sprinting = true;
      if (k === 'Escape') {
        // 暂停中再按 Esc：直接回到游戏（原版行为）
        if (MC.game && MC.game.paused) MC.game.togglePause();
        else MC.ui.escPressed();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sneaking = false;
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.sprinting = false;
    });
    canvas.addEventListener('click', () => {
      if (!MC.ui.screenOpen && document.pointerLockElement !== canvas) canvas.requestPointerLock();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      // 界面打开时鼠标仍被锁着，此时移动的是“虚拟光标”，不要转动视角
      if (MC.ui && (MC.ui.screenOpen || (MC.game && MC.game.paused) || MC.ui.chatOpen())) {
        MC.ui.moveVirtualCursor(e.movementX, e.movementY);
        return;
      }
      const s = this.lookSpeed();
      this.yaw -= e.movementX * s;
      this.pitch -= e.movementY * s;
      this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
      this.yaw = mod(this.yaw + Math.PI, TAU) - Math.PI;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (MC.ui.screenOpen || (MC.game && MC.game.paused)) return;
      if (e.button === 0) { this.mouse.left = true; this.onLeftClick(); }
      if (e.button === 2) { this.mouse.right = true; this.onRightClick(); }
      if (e.button === 1) { this.pickBlock(); e.preventDefault(); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.mouse.left = false; this.mining.active = false; this.mining.progress = 0; MC.ui.setBreakProgress(0); }
      if (e.button === 2) { this.mouse.right = false; this.eatTimer = 0; }
    });
    window.addEventListener('wheel', (e) => {
      if (MC.ui.screenOpen) return;
      let s = this.inv.selected + (e.deltaY > 0 ? 1 : -1);
      this.inv.selected = mod(s, 9);
      MC.ui.updateHotbar(); MC.ui.heldName(true);
    }, { passive: true });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.left = false; this.mouse.right = false; });
  }

  onLeftClick() {
    // 优先攻击生物
    const e = this.eyePos;
    const dir = this.lookDir();
    const hit = MC.entities.raycastMob(e.x, e.y, e.z, dir.x, dir.y, dir.z, this.reach());
    const bhit = this.world.raycast(e.x, e.y, e.z, dir.x, dir.y, dir.z, this.reach());
    if (hit && (!bhit.hit || hit.dist < bhit.dist)) { this.attack(hit.mob); return; }
    this.swingTimer = 0.25;
  }

  reach() { return this.creative ? 5.6 : 4.6; }
  /* 视角转速：与原版一致的三次方曲线；100 ≈ 每像素 0.15°（不会晕） */
  lookSpeed() {
    // 和原版同样的曲线，但滑杆可以拉到 300（比原版 200% 更快），默认 140
    const v = clamp((MC.settings.sensitivity === undefined ? 140 : MC.settings.sensitivity) / 200, 0, 1.5);
    return Math.pow(v * 0.6 + 0.2, 3) * 8 * 0.15 * Math.PI / 180;
  }
  /* 每 100 像素鼠标位移转过的角度（设置界面用） */
  lookDegreesPer100px() { return this.lookSpeed() * 180 / Math.PI * 100; }
  lookDir() {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }

  attack(mob) {
    if (!mob || mob.dead) return;
    if (this.attackCD > 0) return;
    this.attackCD = 0.42;
    this.swingTimer = 0.25;
    const held = this.inv.held;
    const def = held ? stackDef(held) : null;
    let dmg = 1;
    if (def && def.toolType === 'sword') dmg = def.damage;
    else if (def && def.toolType === 'axe') dmg = def.damage - 0.5;
    else if (def && def.toolType) dmg = def.damage - 1;
    const en = held && held.meta && held.meta.enchant;
    if (en && en.type === 'sharpness') dmg += 0.7 * en.lv;
    const d = Math.hypot(mob.pos.x - this.pos.x, mob.pos.z - this.pos.z) || 1;
    const dir = this.lookDir();
    const kb = 1 + (en && en.type === 'knockback' ? en.lv * 0.4 : 0);
    mob.hurt(dmg, { x: dir.x * kb * 2, z: dir.z * kb * 2 }, this);
    MC.particles.hit(mob.pos.x, mob.pos.y + mob.height * 0.6, mob.pos.z, 0xcc2222, 6);
    MC.sound.play('hit_mob', mob.pos.x, mob.pos.y, mob.pos.z);
    if (this.inv.held && stackDef(this.inv.held).durability) this.inv.damageHeld(1, this);
  }

  pickBlock() {
    const e = this.eyePos, dir = this.lookDir();
    const hit = this.world.raycast(e.x, e.y, e.z, dir.x, dir.y, dir.z, this.reach());
    if (!hit.hit) return;
    const id = this.world.getBlock(hit.x, hit.y, hit.z);
    const def = BLOCKS[id];
    if (!def || id === B.bedrock) return;
    if (!this.creative) return;
    const s = makeStack(def.name, 1);
    // 已有的同类物品直接选中
    for (let i = 0; i < 9; i++) { const h = this.inv.hotbar.get(i); if (h && h.id === def.name) { this.inv.selected = i; MC.ui.updateHotbar(); return; } }
    this.inv.hotbar.set(this.inv.selected, s);
    MC.ui.updateHotbar();
  }

  dropHeld() {
    const s = this.inv.held;
    if (!s) return;
    const dir = this.lookDir();
    const e = this.eyePos;
    const it = this.world.spawnItem(e.x + dir.x * 0.5, e.y - 0.3, e.z + dir.z * 0.5, s.id, 1, s.meta);
    if (it) { it.vx = dir.x * 6; it.vy = dir.y * 3 + 1.5; it.vz = dir.z * 6; it.delay = 0.6; }
    s.count--;
    if (s.count <= 0) this.inv.held = null;
    MC.ui.updateHotbar();
  }

  onRightClick() {
    const e = this.eyePos, dir = this.lookDir();
    const hit = this.world.raycast(e.x, e.y, e.z, dir.x, dir.y, dir.z, this.reach());
    const held = this.inv.held;
    const def = held ? stackDef(held) : null;
    // 1) 交互方块
    if (hit.hit) {
      const bdef = hit.def;
      const st = this.world.getState(hit.x, hit.y, hit.z);
      if (bdef.interactive === 'crafting') { MC.ui.openCrafting(); return; }
      if (bdef.interactive === 'furnace') { MC.ui.openFurnace(hit.x, hit.y, hit.z); return; }
      if (bdef.interactive === 'chest') { MC.ui.openChest(hit.x, hit.y, hit.z); return; }
      if (bdef.interactive === 'enchant') { MC.ui.openEnchant(); return; }
      if (bdef.interactive === 'sleep') { this.sleep(); return; }
      if (bdef.interactive === 'shulker') {
        const st = this.world.getState(hit.x, hit.y, hit.z) || { inv: new Array(27).fill(null) };
        this.world.setState(hit.x, hit.y, hit.z, st);
        MC.ui.openShulker(st, '潜影盒');
        return;
      }
      if (bdef.interactive === 'harvest') {
        const stage = st ? st.stage | 0 : 0;
        if (stage >= 7) {
          const drops = this.world.dropsFor(hit.x, hit.y, hit.z, bdef, null, this);
          for (const d of drops) this.world.spawnItem(hit.x + 0.5, hit.y + 0.4, hit.z + 0.5, d.id, d.count);
          this.world.setState(hit.x, hit.y, hit.z, { stage: 0 });
          this.world.light.markDirtyAt(hit.x, hit.y, hit.z);
          MC.sound.play('dig_grass', hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
        } else MC.ui.toast('小麦还没成熟', 'info');
        return;
      }
      if (bdef.interactive === 'ignite') {
        if (def && def.use === 'ignite') { this.world.igniteTNT(hit.x, hit.y, hit.z); this.inv.damageHeld(1, this); return; }
      }
      // 打火石点燃下界传送门（黑曜石框）
      if (def && def.use === 'ignite' && bdef.id === B.obsidian) {
        if (this.world.ignitePortal(hit.x, hit.y, hit.z, hit.face)) { this.inv.damageHeld(1, this); MC.ui.unlock('portal'); return; }
      }
      // 末影之眼嵌入末地传送门框架
      if (bdef.interactive === 'end_frame') {
        const st = this.world.getState(hit.x, hit.y, hit.z);
        if (!st || !st.eye) {
          if (this.inv.countOf('eye_of_ender') > 0) {
            this.inv.removeItem('eye_of_ender', 1);
            this.world.setState(hit.x, hit.y, hit.z, { eye: true });
            this.world.light.markDirtyAt(hit.x, hit.y, hit.z);
            MC.sound.play('place_glass', hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
            MC.ui.updateHotbar();
            this.world.checkEndPortal(hit.x, hit.y, hit.z);
          } else MC.ui.toast('需要末影之眼（末影珍珠 + 烈焰粉合成）', 'bad');
        }
        return;
      }
      if (bdef.redstone === 'source' || bdef.redstone === 'repeater') { MC.redstone.interact(hit.x, hit.y, hit.z, bdef); return; }
    }
    // 末影之眼：寻找要塞
    if (def && def.use === 'eye' && !hit.hit) {
      if (this.inv.countOf('eye_of_ender') > 0) { MC.throwEyeOfEnder(e); return; }
    }
    // 手持潜影盒对着空气右键 → 打开随身储物
    if (held && held.id === 'shulker_box' && !hit.hit) {
      if (!held.meta) held.meta = {};
      if (!held.meta.inv) held.meta.inv = new Array(27).fill(null);
      MC.ui.openShulker(held.meta, '潜影盒（随身）');
      return;
    }
    // 2) 吃东西
    if (def && def.food) {
      if (this.hunger >= 20) {
        const now = performance.now();
        if (!this._fullHint || now - this._fullHint > 2500) {
          this._fullHint = now;
          MC.ui.toast('现在不饿（饱食度已满）——饿了才能吃，按住右键不放进食', 'info');
        }
        return;
      }
      if (this.eatTimer <= 0) this.eatTimer = 0.01;
      return;
    }
    // 3) 弓箭
    if (def && def.ranged) {
      if (this.inv.countOf('arrow') > 0) {
        this.inv.removeItem('arrow', 1);
        const speed = 40;
        const ar = new Arrow(this.world, e.x + dir.x * 0.6, e.y - 0.1, e.z + dir.z * 0.6, dir.x * speed, dir.y * speed, dir.z * speed, this);
        this.world.arrows.push(ar);
        MC.sound.play('bow', e.x, e.y, e.z);
        this.inv.damageHeld(1, this);
      } else MC.ui.toast('没有箭了', 'bad');
      return;
    }
    if (def && def.placeLiquid && hit.hit) {
      const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
      const bid = def.placeLiquid === 'water' ? B.water : B.lava;
      if (bid === B.water && this.world.dimConfig.noWater) {
        MC.sound.play('fizz', px + 0.5, py + 0.5, pz + 0.5);
        MC.particles.smoke(px + 0.5, py + 0.6, pz + 0.5);
        MC.ui.toast('这个世界的水会瞬间蒸发！', 'bad');
        this.inv.held = makeStack('bucket', 1);
        MC.ui.updateHotbar();
        return;
      }
      if (this.world.setBlock(px, py, pz, bid, { noSupport: true })) {
        this.world.fluids.onLiquidPlaced(px, py, pz, bid, true);
        this.inv.held = makeStack('bucket', 1);
        MC.sound.play('splash', px, py, pz);
        MC.ui.updateHotbar();
      }
      return;
    }
    // 空桶取液体（右键液体）
    if (held && held.id === 'bucket' && hit.hit && (hit.def.id === B.water || hit.def.id === B.lava)) {
      const isSource = this.world.fluids.isSource(hit.x, hit.y, hit.z);
      if (isSource) {
        this.world.setBlock(hit.x, hit.y, hit.z, 0, { noFluid: true });
        this.inv.held = makeStack(hit.def.id === B.water ? 'water_bucket' : 'lava_bucket', 1);
        MC.sound.play('splash', hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
        MC.ui.updateHotbar();
      } else MC.ui.toast('只能装取源头（水源/岩浆源）', 'info');
      return;
    }
    // 4) 锄头 / 种子
    if (def && def.toolType === 'hoe' && hit.hit) {
      if (hit.def.id === B.grass_block || hit.def.id === B.dirt || hit.def.id === B.snow_grass) {
        if (this.world.getBlock(hit.x, hit.y + 1, hit.z) === 0) {
          this.world.setBlock(hit.x, hit.y, hit.z, B.farmland, { noSupport: false });
          MC.sound.play('dig_gravel', hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
          this.inv.damageHeld(1, this);
          return;
        }
      }
    }
    if (held && held.id === 'seeds' && hit.hit && hit.def.id === B.farmland) {
      if (this.world.getBlock(hit.x, hit.y + 1, hit.z) === 0) {
        this.world.setBlock(hit.x, hit.y + 1, hit.z, B.farmland_seed, { noSupport: false });
        this.world.setState(hit.x, hit.y + 1, hit.z, { stage: 0 });
        held.count--; if (held.count <= 0) this.inv.held = null;
        MC.sound.play('dig_grass', hit.x + 0.5, hit.y + 1, hit.z + 0.5);
        MC.ui.updateHotbar();
        return;
      }
    }
    // 5) 放置方块
    if (held && def && def.block !== undefined && hit.hit) {
      const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
      const targetDef = this.world.getBlockDef(px, py, pz);
      if (!targetDef.replaceable && targetDef.id !== 0) return;
      if (!this.canPlaceAt(px, py, pz, def)) return;
      if (this.world.setBlock(px, py, pz, def.block, {})) {
        // 潜影盒：把手里的内容一起放进方块状态
        if (def.block === B.shulker_box) {
          const inv = (held.meta && held.meta.inv) ? held.meta.inv : new Array(27).fill(null);
          this.world.setState(px, py, pz, { inv });
          if (held.meta) delete held.meta.inv;
        }
        if (def.block === B.furnace || def.block === B.chest) {
          const st = { inv: new Array(def.block === B.furnace ? 3 : 27).fill(null) };
          if (def.block === B.furnace) { st.burn = 0; st.cook = 0; }
          this.world.setState(px, py, pz, st);
        }
        if (def.block === B.farmland_seed) this.world.setState(px, py, pz, { stage: 0 });
        if (def.block === B.redstone_dust || def.block === B.lever || def.block === B.stone_button || def.block === B.repeater || def.block === B.pressure_plate || def.block === B.redstone_lamp || def.block === B.piston) {
          MC.redstone.onPlaced(px, py, pz, def.block);
        }
        if (!this.creative) { held.count--; if (held.count <= 0) this.inv.held = null; }
        MC.sound.play('place_' + (def.block ? (BLOCKS[def.block].sound || 'stone') : 'stone'), px + 0.5, py + 0.5, pz + 0.5);
        MC.ach.placed++;
        MC.ui.updateHotbar();
        if (def.block === B.torch) MC.ui.unlock('torch');
        if (MC.ach.placed === 30) MC.ui.unlock('shelter');
      }
    }
  }

  canPlaceAt(x, y, z, def) {
    const bdef = BLOCKS[def.block];
    if (bdef.shape === 'cross' || bdef.shape === 'crop' || bdef.shape === 'flat' || bdef.shape === 'torch' || bdef.shape === 'bed') {
      const below = this.world.getBlockDef(x, y - 1, z);
      if (!(below.solid || below.shape === 'slab' || below.shape === 'bed')) return false;
    }
    if (bdef.liquid) return true;
    // 不能放在玩家身上
    const pbox = this.box;
    const nbox = Box.block(x, y, z);
    if (pbox.intersects(nbox)) return false;
    for (const m of this.world.mobs) if (m.box.intersects(nbox)) return false;
    return true;
  }

  sleep() {
    if (this.world.isDay()) { MC.ui.toast('现在还不困（白天不能睡觉）', 'bad'); return; }
    this.world.time = 0.27;      // 睡到清晨
    this.world.dayCount++;
    this.health = Math.min(this.maxHealth, this.health + 4);
    MC.ui.chat('一觉睡到天亮！', 'sys');
    MC.ui.unlock('bed');
    MC.sound.play('sleep');
  }

  /* ================= 每帧更新 ================= */
  update(dt) {
    if (!this.alive) return;
    this.attackCD = Math.max(0, this.attackCD - dt);
    this.teleportCooldown = Math.max(0, (this.teleportCooldown || 0) - dt);
    this.swingTimer = Math.max(0, this.swingTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    const eye = this.eyePos;
    this.inWater = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z)) === B.water;
    this.inLava = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z)) === B.lava;
    const headInWater = this.world.getBlock(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z)) === B.water;

    // ---- 移动输入 ----
    let fwd = 0, side = 0;
    if (!MC.ui.screenOpen) {
      if (this.keys.KeyW) fwd += 1;
      if (this.keys.KeyS) fwd -= 1;
      if (this.keys.KeyA) side -= 1;
      if (this.keys.KeyD) side += 1;
    }
    const len = Math.hypot(fwd, side);
    if (len > 0) { fwd /= len; side /= len; }
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    let mx = (-sinY * fwd + cosY * side);
    let mz = (-cosY * fwd - sinY * side);
    if (this.sneaking && !this.flying) { mx *= 0.3; mz *= 0.3; }
    const sprinting = this.sprinting && fwd > 0 && !this.sneaking;
    this.sprinting = sprinting;
    let speed = this.creative ? 5.6 : (sprinting ? 5.9 : 4.4);
    if (this.flying) speed = sprinting ? 22 : 11;
    if (this.inWater) speed *= 0.55;
    if (this.inLava) speed *= 0.4;
    if (this.sneaking && !this.flying) speed *= 0.55;

    // 鞘翅滑翔：穿在胸甲槽，下落时按住空格即可展翅
    const chestItem = this.inv.armor.get(1);
    const chestDef = chestItem ? stackDef(chestItem) : null;
    const hasElytra = !!(chestDef && chestDef.elytra);
    if (hasElytra && !this.onGround && !this.inWater && !this.flying && this.keys.Space && this.vel.y < 0.6) this.gliding = true;
    if (!hasElytra || this.onGround || this.inWater || this.flying) this.gliding = false;

    if (this.gliding) {
      const dir = this.lookDir();
      const dive = clamp(-this.pitch, -0.5, 1.3);
      const target = 8 + Math.sin(clamp(dive, 0, 1.2)) * 13;
      const k = Math.min(1, dt * 1.6);
      let vx = this.vel.x + (dir.x * target - this.vel.x) * k;
      let vz = this.vel.z + (dir.z * target - this.vel.z) * k;
      if (len > 0) { vx += mx * speed * 0.25; vz += mz * speed * 0.25; }
      this.vel.x = vx; this.vel.z = vz;
      const sink = -1.15 + clamp(this.pitch, 0, 0.5) * 2.6;
      this.vel.y = lerp(this.vel.y, sink, Math.min(1, dt * 3.5));
      this.fallStartY = null;
      this._glideTime = (this._glideTime || 0) + dt;
      if (this._glideTime > 0.08) {
        this._glideTime = 0;
        MC.particles.hit(this.pos.x - dir.x * 0.6, this.pos.y + 1.1, this.pos.z - dir.z * 0.6, 0x9aa0b8, 1);
      }
      this._elytraWear = (this._elytraWear || 0) + dt;
      if (this._elytraWear > 2 && chestItem) {
        this._elytraWear = 0;
        const def2 = stackDef(chestItem);
        if (!chestItem.meta) chestItem.meta = {};
        if (chestItem.meta.dur === undefined) chestItem.meta.dur = def2.durability;
        chestItem.meta.dur -= 1;
        if (chestItem.meta.dur <= 0) { this.inv.armor.set(1, null); MC.ui.toast('鞘翅已损坏', 'bad'); }
      }
    } else if (this.flying) {
      this.vel.x = mx * speed; this.vel.z = mz * speed;
      let vy = 0;
      if (this.keys.Space) vy += speed;
      if (this.keys.ShiftLeft || this.keys.ShiftRight) vy -= speed;
      this.vel.y = vy;
    } else if (this.inWater) {
      this.vel.x = lerp(this.vel.x, mx * speed, 0.2);
      this.vel.z = lerp(this.vel.z, mz * speed, 0.2);
      this.vel.y -= 9 * dt;
      if (this.keys.Space) this.vel.y = Math.min(this.vel.y + 26 * dt, 3.2);
      this.vel.y = clamp(this.vel.y, -5, 4);
      if (this.vel.y < 0) this.vel.y *= 0.86;
    } else {
      const accel = this.onGround ? 0.36 : 0.14;
      this.vel.x = lerp(this.vel.x, mx * speed, accel);
      this.vel.z = lerp(this.vel.z, mz * speed, accel);
      this.vel.y -= 30 * dt;
      if (this.vel.y < -42) this.vel.y = -42;
    }
    // 摔落伤害计算
    if (!this.flying && !this.inWater && this.vel.y < -0.1) {
      if (this.fallStartY === null) this.fallStartY = this.pos.y;
    }
    const prevY = this.pos.y;
    const e = { x: this.pos.x, y: this.pos.y, z: this.pos.z, height: this.height, onGround: false };
    const res = this.world.moveEntity(e, e.x + this.vel.x * dt, e.y + this.vel.y * dt, e.z + this.vel.z * dt, this.width, 0.6);
    this.pos.x = e.x; this.pos.y = e.y; this.pos.z = e.z;
    const wasGround = this.onGround;
    this.onGround = !!e.onGround;
    if (res.hitX) this.vel.x = 0;
    if (res.hitZ) this.vel.z = 0;
    if (res.hitY) {
      if (this.vel.y < 0) {
        // 落地
        if (this.fallStartY !== null && !this.creative && !this.inWater) {
          const fall = this.fallStartY - this.pos.y;
          if (fall > 3.5) { this.hurt(Math.floor(fall - 3), null, '摔落'); MC.sound.play('fall', this.pos.x, this.pos.y, this.pos.z); }
        }
        this.fallStartY = null;
      }
      this.vel.y = 0;
    }
    if (this.onGround) this.fallStartY = null;
    if (this.flying) this.fallStartY = null;
    // 掉出世界
    if (this.pos.y < -8) this.hurt(100, null, '虚空');
    // 卡在方块里 → 向上顶出
    if (this.world.collideAt(this.pos.x, this.pos.y, this.pos.z, this.width, this.height)) {
      this.pos.y += 0.1;
      if (this.world.collideAt(this.pos.x, this.pos.y, this.pos.z, this.width, this.height)) this.pos.y += 0.5;
    }

    // ---- 脚步声 ----
    if (this.onGround && !this.flying) {
      const moved = Math.hypot(this.pos.x - (this._lastX ?? this.pos.x), this.pos.z - (this._lastZ ?? this.pos.z));
      this.stepDistance += moved;
      if (this.stepDistance > (sprinting ? 2.1 : 2.7)) {
        this.stepDistance = 0;
        const below = this.world.getBlockDef(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.2), Math.floor(this.pos.z));
        MC.sound.play('step_' + (below.sound || 'stone'), this.pos.x, this.pos.y, this.pos.z, 0.5);
        this.exhaustion += sprinting ? 0.1 : 0.02;
      }
    }
    this._lastX = this.pos.x; this._lastZ = this.pos.z;

    // ---- 环境伤害 ----
    if (this.inLava && !this.creative) this.hurt(dt * 4, null, '岩浆');
    const inFire = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.3), Math.floor(this.pos.z)) === B.fire;
    if (inFire && !this.creative) this.hurt(dt * 3, null, '火');
    const feet = this.world.getBlockDef(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.1), Math.floor(this.pos.z));
    if (feet.id === B.cactus && !this.creative) this.hurt(dt * 2, null, '仙人掌');
    if (feet.id === B.magma_block && !this.creative) this.hurt(dt * 1.6, null, '岩浆块');
    if (headInWater) {
      this.air -= dt * 20;
      if (this.air <= 0) { this.air = 0; if (Math.random() < dt * 2) this.hurt(2, null, '溺水'); }
      if (Math.random() < dt * 3) MC.particles.splash(this.pos.x, this.pos.y + 1.5, this.pos.z, 1);
    } else this.air = Math.min(300, this.air + dt * 60);

    // ---- 饥饿与恢复 ----
    // 饥饿：疲劳累加到 4.0 点就掉 1 格食物（原版规则）；疲劳本身只在掉食物时被扣掉，平时不衰减
    this.hungerTimer = this.exhaustion;                 // 仅用于存档/调试显示
    if (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.hunger > 0) this.hunger--;
      else if (this.health > 1 && Math.random() < 0.5) this.hurt(1, null, '饥饿');
    }
    if (this.hunger > 17 && this.health < this.maxHealth) {
      this.regenTimer += dt;
      if (this.regenTimer > 3.2) { this.regenTimer = 0; this.health = Math.min(this.maxHealth, this.health + 1); this.exhaustion += 1.2; }
    } else this.regenTimer = 0;
    if (this.hunger <= 0) {
      this.starveTimer = (this.starveTimer || 0) + dt;
      if (this.starveTimer > 4) { this.starveTimer = 0; this.hurt(1, null, '饥饿'); }
    }
    // ---- 吃东西 ----
    if (this.mouse.right && this.inv.held) {
      const def = stackDef(this.inv.held);
      if (def && def.food && this.hunger < 20 && !MC.ui.screenOpen) {
        this.eatTimer += dt;
        MC.ui.setEatProgress(this.eatTimer / 1.3);
        if (Math.random() < dt * 12) MC.particles.hit(this.pos.x, this.pos.y + 1.4, this.pos.z, 0xb06a3a, 1);
        if (this.eatTimer > 1.3) {
          this.eatTimer = 0;
          MC.ui.setEatProgress(0);
          this.hunger = Math.min(20, this.hunger + (def.food || 0));
          if (!def.poison) this.health = Math.min(this.maxHealth, this.health + 1);
          MC.sound.play('eat', this.pos.x, this.pos.y, this.pos.z);
          this.inv.held.count--;
          if (this.inv.held.count <= 0) this.inv.held = null;
          MC.ui.updateHotbar();
        }
      } else { this.eatTimer = 0; MC.ui.setEatProgress(0); }
    }

    // ---- 挖掘 ----
    this.updateMining(dt);
    // ---- 手持物品 ----
    this.updateHeldView();
    if (this.heldView) {
      const swinging = this.swingTimer > 0;
      const t = swinging ? (1 - this.swingTimer / 0.25) : 0;
      const swing = swinging ? Math.sin(t * Math.PI) : 0;
      const bobY = Math.sin(this.bobTimer) * (this.onGround && Math.hypot(this.vel.x, this.vel.z) > 0.6 ? 0.02 : 0);
      const ud = this.heldView.userData;
      if (this.heldIsHand) {
        ud.ox = 0.46 - swing * 0.06; ud.oy = -0.36 + bobY - swing * 0.08; ud.oz = -0.56 + swing * 0.1;
        ud.rx = -0.25 + swing * 0.9; ud.ry = -0.32 - swing * 0.2; ud.rz = 0.15 + swing * 0.3;
      } else {
        ud.ox = 0.54 - swing * 0.14; ud.oy = -0.34 + bobY - swing * 0.10; ud.oz = -0.68 + swing * 0.08;
        ud.rx = 0.12 + swing * 1.1; ud.ry = -0.62 - swing * 0.35; ud.rz = 0.18 + swing * 0.4;
      }
      this.heldView.visible = this.viewMode === 0 && !MC.ui.screenOpen && !MC.game.paused && !MC.hideHeldView;
      this.applyHeldTransform(this.heldView);
    }
    // ---- 相机 ----
    this.updateCamera(dt);
    if (this.thirdModel) this.updateThirdPersonModel();
    // ---- 统计 / 成就 ----
    if (this.pos.y < 20) MC.ach.deepMined = true;
  }

  updateMining(dt) {
    if (MC.ui.screenOpen) { this.mining.active = false; MC.ui.setBreakProgress(0); return; }
    const e = this.eyePos, dir = this.lookDir();
    const hit = this.world.raycast(e.x, e.y, e.z, dir.x, dir.y, dir.z, this.reach());
    MC.ui.setHighlight(hit.hit ? hit : null);
    if (!hit.hit || !this.mouse.left) { this.mining.active = false; this.mining.progress = 0; MC.ui.setBreakProgress(0); return; }
    const id = this.world.getBlock(hit.x, hit.y, hit.z);
    const def = BLOCKS[id];
    if (!def || def.hardness === Infinity) { this.mining.progress = 0; MC.ui.setBreakProgress(0); return; }
    // 攻击冷却期间不挖
    if (this.attackCD > 0.2) return;
    if (!this.mining.active || hit.x !== this.mining.x || hit.y !== this.mining.y || hit.z !== this.mining.z) {
      this.mining = { active: true, x: hit.x, y: hit.y, z: hit.z, progress: 0, soundTimer: 0 };
    }
    const held = this.inv.held;
    const hdef = held ? stackDef(held) : null;
    let speed = 1;
    let canHarvest = true;
    if (hdef && hdef.toolType) {
      if (hdef.toolType === def.tool) speed = hdef.speed;
      else if (def.tool === 'pickaxe') speed = 1;
    }
    const heldEn = held && held.meta && held.meta.enchant;
    if (heldEn && heldEn.type === 'efficiency') speed *= 1 + heldEn.lv * 0.45;
    if (heldEn && heldEn.type === 'unbreaking' && Math.random() < heldEn.lv / (heldEn.lv + 2)) this._skipDurability = true;
    if (def.tool === 'pickaxe' && (!hdef || hdef.toolType !== 'pickaxe')) canHarvest = false;
    if (def.minLevel > 0 && (!hdef || hdef.toolType !== def.tool || hdef.tier < def.minLevel)) canHarvest = false;
    let time = def.hardness * 1.5 / Math.max(0.2, speed);
    if (!canHarvest) time = Math.max(time, def.hardness * 5);
    if (this.creative) time = 0.05;
    this.mining.progress += dt / Math.max(0.05, time);
    MC.ui.setBreakProgress(clamp(this.mining.progress, 0, 1));
    this.mining.soundTimer -= dt;
    if (this.mining.soundTimer <= 0) {
      this.mining.soundTimer = 0.22;
      MC.sound.play('dig_' + (def.sound || 'stone'), hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 0.7);
      if (this.mining.progress > 0.05 && Math.random() < 0.4) MC.particles.blockBreak(hit.x, hit.y, hit.z, def, 2);
    }
    this.swingTimer = 0.25;
    if (this.mining.progress >= 1) {
      const drops = this.world.breakBlock(hit.x, hit.y, hit.z, held, this);
      MC.particles.blockBreak(hit.x, hit.y, hit.z, def, 16);
      MC.sound.play('break_' + (def.sound || 'stone'), hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      for (const d of drops) this.world.spawnItem(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, d.id, d.count, d.meta || null);
      const skipDur = this._skipDurability; this._skipDurability = false;
      if (hdef && hdef.durability && !this.creative && !skipDur) this.inv.damageHeld(1, this);
      this.mining.active = false; this.mining.progress = 0;
      MC.ui.setBreakProgress(0);
      MC.ach.mined[id] = (MC.ach.mined[id] || 0) + 1;
      MC.ui.onMine(id);
    }
  }

  updateCamera(dt) {
    const cam = this.camera;
    const eye = this.eyePos;
      cam.fov = MC.settings.fov * (this.sprinting ? 1.045 : 1) * (this.inWater ? 0.95 : 1) * (this.gliding ? 1.06 : 1);
    cam.updateProjectionMatrix();
    // 走路视角轻微晃动
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.6 && this.onGround;
    this.bobTimer += dt * (this.sprinting ? 10 : 8);
    const bob = moving ? Math.sin(this.bobTimer) * 0.018 : 0;
    if (this.viewMode === 0) {
      cam.position.set(eye.x, eye.y + bob, eye.z);
      cam.rotation.set(this.pitch, this.yaw, Math.cos(this.bobTimer) * (moving ? 0.005 : 0));
      if (this.thirdModel) this.thirdModel.visible = false;
    } else {
      const dir = this.lookDir();
      let dist = 4;
      const back = this.world.raycast(eye.x, eye.y, eye.z, -dir.x, -dir.y, -dir.z, dist + 0.4);
      if (back.hit) dist = Math.max(0.6, back.dist - 0.35);
      cam.position.set(eye.x - dir.x * dist, eye.y - dir.y * dist + 0.2, eye.z - dir.z * dist);
      cam.rotation.set(this.pitch, this.yaw, 0);
      if (!this.thirdModel) this.buildThirdPersonModel();
      this.thirdModel.visible = true;
    }
  }

  buildThirdPersonModel() {
    const g = new THREE.Group();
    const skin = 0xe0ac69, shirt = 0x3fa9d8, pants = 0x3b4ea0;
    const head = mobBox(0.5, 0.5, 0.5, skin, 0, 1.6, 0);
    const hair = mobBox(0.54, 0.16, 0.54, 0x3a2a1a, 0, 1.86, 0);
    const body = mobBox(0.5, 0.72, 0.28, shirt, 0, 1.2, 0);
    this.tpArmL = mobBox(0.22, 0.65, 0.22, skin, -0.36, 1.24, 0);
    this.tpArmR = mobBox(0.22, 0.65, 0.22, skin, 0.36, 1.24, 0);
    this.tpLegL = mobBox(0.22, 0.72, 0.22, pants, -0.13, 0.44, 0);
    this.tpLegR = mobBox(0.22, 0.72, 0.22, pants, 0.13, 0.44, 0);
    [head, hair, body, this.tpArmL, this.tpArmR, this.tpLegL, this.tpLegR].forEach(m => { m.material.flatShading = true; g.add(m); });
    g.visible = false;
    this.world.scene.add(g);
    this.thirdModel = g;
  }
  updateThirdPersonModel() {
    const m = this.thirdModel;
    m.position.set(this.pos.x, this.pos.y, this.pos.z);
    m.rotation.y = -this.yaw + Math.PI;
    const walk = Math.sin(this.bobTimer);
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.3;
    if (this.tpLegL) {
      this.tpLegL.rotation.x = moving ? walk * 0.6 : 0;
      this.tpLegR.rotation.x = moving ? -walk * 0.6 : 0;
    }
    if (this.tpArmR) {
      const swing = this.swingTimer > 0 ? -1.4 : 0;
      this.tpArmR.rotation.x = swing || (moving ? -walk * 0.5 : 0);
      this.tpArmL.rotation.x = moving ? walk * 0.5 : 0;
    }
  }

  /* ================= 第一人称手持物品 ================= */
  attachHeldView(obj) {
    MC.scene.add(obj);
    this.heldView = obj;
  }
  /* 每帧把手持模型摆到相机右下方（用相机世界矩阵换算，最稳） */
  applyHeldTransform(obj) {
    const cam = this.camera;
    cam.updateMatrixWorld();
    obj.position.set(0, 0, 0);
    obj.quaternion.set(0, 0, 0, 1);
    obj.updateMatrix();
    obj.matrix.copy(cam.matrixWorld);          // 先对齐相机
    obj.matrix.multiply(new THREE.Matrix4().makeTranslation(obj.userData.ox || 0.38, obj.userData.oy || -0.32, obj.userData.oz || -0.62));
    obj.matrix.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(obj.userData.rx || 0.12, obj.userData.ry || -0.62, obj.userData.rz || 0.18)));
    obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
    obj.matrixWorld.copy(obj.matrix);
    obj.matrixAutoUpdate = false;
  }
  disposeHeldView() {
    if (!this.heldView) return;
    MC.scene.remove(this.heldView);
    this.heldView.traverse(o => {
      if (o.isMesh) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (o.material.map && o.material.map !== MC.atlas.texture) o.material.map.dispose(); o.material.dispose(); }
      }
    });
    this.heldView = null; this.heldViewId = null;
  }
  /* 用图集里的方块贴图搭一个小方块（手持方块用） */
  heldBlockMesh(def) {
    const tex = def.tex || {};
    const geo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
    const uv = geo.getAttribute('uv');
    const rects = {
      0: MC.atlas.uv(tex.side ?? tex.all ?? T.STONE),   // +x
      1: MC.atlas.uv(tex.side ?? tex.all ?? T.STONE),   // -x
      2: MC.atlas.uv(tex.top ?? tex.all ?? T.STONE),    // +y
      3: MC.atlas.uv(tex.bottom ?? tex.all ?? T.STONE), // -y
      4: MC.atlas.uv(tex.side ?? tex.all ?? T.STONE),   // +z
      5: MC.atlas.uv(tex.side ?? tex.all ?? T.STONE),   // -z
    };
    const map = [[0, 1], [2, 3], [1, 0], [1, 1], [0, 0], [1, 1]];   // 每个面的四个角对应 (cu,cv)
    let idx = 0;
    for (let f = 0; f < 6; f++) {
      const r = rects[f];
      for (const [cu, cv] of map) {
        uv.setXY(idx++, cu ? r[2] : r[0], cv ? r[3] : r[1]);
      }
    }
    uv.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ map: MC.atlas.texture, alphaTest: 0.35, transparent: true, depthTest: false, fog: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.material.color = new THREE.Color(0.86, 0.86, 0.86);
    m.renderOrder = 999;
    return m;
  }
  /* 工具/食物等用一张平面图标 */
  heldFlatMesh(held, def) {
    const icon = MC.icons.forItem({ id: held.id, def, meta: held.meta }, 32);
    const t = new THREE.CanvasTexture(icon);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, depthTest: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), mat);
    m.renderOrder = 999;
    return m;
  }
  updateHeldView() {
    const held = this.inv.held;
    const wantId = held ? held.id + '|' + (held.meta && held.meta.enchant ? held.meta.enchant.type + held.meta.enchant.lv : '') : null;
    if (wantId === this.heldViewId) {
      if (this.heldView) this.heldView.visible = this.viewMode === 0 && !MC.ui.screenOpen && !MC.game.paused;
      return;
    }
    this.disposeHeldView();
    this.heldViewId = wantId;
    if (!held) {                       // 空手：像原版一样显示手臂
      const g0 = new THREE.Group();
      // 用带贴图的 Basic 材质（和手持方块/掉落物同一套渲染方式，最稳）
      const mkTex = (base, shade2) => {
        const cv = document.createElement('canvas'); cv.width = cv.height = 16;
        const cx = cv.getContext('2d');
        cx.fillStyle = base; cx.fillRect(0, 0, 16, 16);
        cx.fillStyle = shade2; cx.fillRect(0, 0, 16, 3); cx.fillRect(0, 0, 3, 16);
        const t = new THREE.CanvasTexture(cv);
        t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      const skin = new THREE.MeshBasicMaterial({ map: mkTex('#e8b478', '#c98f52'), depthTest: false, fog: false, side: THREE.DoubleSide });
      const sleeve = new THREE.MeshBasicMaterial({ map: mkTex('#3fa9d8', '#2d84ad'), depthTest: false, fog: false, side: THREE.DoubleSide });
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.55), skin);
      arm.position.set(0, 0, -0.16); arm.renderOrder = 999;
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.14), sleeve);
      cuff.position.set(0, 0, 0.06); cuff.renderOrder = 999;
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.145, 0.15), skin);
      hand.position.set(0, 0, -0.44); hand.renderOrder = 999;
      g0.add(arm, cuff, hand);
      g0.userData.ox = 0.46; g0.userData.oy = -0.36; g0.userData.oz = -0.56;
      g0.userData.rx = -0.25; g0.userData.ry = -0.32; g0.userData.rz = 0.15;
      g0.visible = this.viewMode === 0 && !MC.ui.screenOpen && !MC.game.paused && !MC.hideHeldView;
      this.attachHeldView(g0);
      this.heldIsHand = true;
      return;
    }
    const def = stackDef(held);
    if (!def) return;
    this.heldIsHand = false;
    const g = new THREE.Group();
    if (def.block !== undefined) {
      const bd = BLOCKS[def.block] || {};
      if (bd.shape === 'cross' || bd.shape === 'flat' || bd.shape === 'torch' || bd.shape === 'crop') {
        const idx = (bd.tex && (bd.tex.all ?? bd.tex.side)) ?? T.STONE;
        const t = new THREE.CanvasTexture(MC.atlas.tileCanvas(idx));
        t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5),
          new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, depthTest: false }));
        m.renderOrder = 999; g.add(m);
      } else g.add(this.heldBlockMesh(bd));
    } else {
      g.add(this.heldFlatMesh(held, def));
    }
    // 放在画面右下角（和原版一样），略微倾斜
    g.position.set(0.38, -0.32, -0.62);
    g.rotation.set(0.12, -0.62, 0.18);
    this.attachHeldView(g);
    this.heldSwing = this.heldSwing || 0;
  }

  /* ================= 伤害 / 死亡 / 经验 ================= */
  hurt(amount, kb, source) {
    if (!this.alive || this.creative || amount <= 0) return;
    const continuous = source === '岩浆' || source === '仙人掌' || source === '饥饿' || source === '溺水' || source === '虚空';
    if (this.invuln > 0 && !continuous) return;
    const defense = this.inv.defense();
    const prot = this.inv.armor.slots.reduce((acc, s) => {
      const en = s && s.meta && s.meta.enchant;
      return acc + (en && en.type === 'protection' ? en.lv : 0);
    }, 0);
    let dmg = amount * (1 - Math.min(0.8, defense * 0.04 + prot * 0.04));
    this.health -= dmg;
    this.hurtTimer = 0.4;
    if (!continuous) this.invuln = 0.6;
    this.lastDamageTime = performance.now() / 1000;
    if (defense > 0) this.inv.damageArmor(Math.max(1, Math.floor(dmg / 4)));
    if (kb && !this.flying) { this.vel.x += kb.x * 5; this.vel.z += kb.z * 5; this.vel.y = Math.max(this.vel.y, 4); }
    MC.sound.play('hurt', this.pos.x, this.pos.y, this.pos.z);
    MC.ui.damageFlash();
    MC.particles.hit(this.pos.x, this.pos.y + 1.2, this.pos.z, 0xcc2222, 6);
    MC.ui.shake(0.1);
    this.hunger = Math.max(0, this.hunger - 0.4);
    if (this.health <= 0) this.die(source);
  }
  die(source) {
    this.alive = false;
    this.health = 0;
    MC.sound.play('die');
    // 掉落物品
    const dropAll = (c) => c.slots.forEach((s, i) => { if (s) { this.world.spawnItem(this.pos.x, this.pos.y + 1, this.pos.z, s.id, s.count, s.meta); c.set(i, null); } });
    dropAll(this.inv.hotbar); dropAll(this.inv.main); dropAll(this.inv.armor);
    this.xp = 0; this.level = 0;
    MC.ui.showDeath(source || '未知原因');
  }
  respawn() {
    this.alive = true;
    this.health = this.maxHealth;
    this.hunger = 20; this.air = 300;
    this.vel = { x: 0, y: 0, z: 0 };
    if (MC.world.type !== 'overworld') MC.setDimension('overworld');
    this.world = MC.world;
    this.pos = { x: this.spawnPoint.x, y: this.spawnPoint.y, z: this.spawnPoint.z };
    // 确保落点安全
    for (let i = 0; i < 60; i++) {
      const d = this.world.getBlockDef(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z));
      const below = this.world.getBlockDef(Math.floor(this.pos.x), Math.floor(this.pos.y) - 1, Math.floor(this.pos.z));
      if (!d.solid && !below.liquid) break;
      this.pos.y += 1;
    }
    this.flying = false;
    MC.ui.hideDeath();
    MC.ui.updateStats();
  }
  addXP(amount) {
    this.xp += amount;
    while (this.xp >= this.xpNeeded()) { this.xp -= this.xpNeeded(); this.level++; MC.sound.play('levelup'); MC.ui.toast('升级！等级 ' + this.level, 'good'); }
    MC.ui.updateStats();
  }
  xpNeeded() { return 12 + this.level * 8; }
}
