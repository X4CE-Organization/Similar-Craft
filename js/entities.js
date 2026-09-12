/* ============================================================
   生物、箭矢、粒子
   ============================================================ */

const MOB_TYPES = {
  pig: { cn: '猪', hp: 10, w: 0.9, h: 0.9, speed: 1.15, hostile: false, xp: 1, drops: [['raw_porkchop', 1, 3]] },
  cow: { cn: '牛', hp: 10, w: 0.9, h: 1.3, speed: 1.1, hostile: false, xp: 1, drops: [['raw_beef', 1, 3], ['leather', 0, 2]] },
  sheep: { cn: '羊', hp: 8, w: 0.9, h: 1.2, speed: 1.1, hostile: false, xp: 1, drops: [['wool_white', 1, 1], ['raw_beef', 1, 1]] },
  chicken: { cn: '鸡', hp: 4, w: 0.5, h: 0.7, speed: 1.0, hostile: false, xp: 1, drops: [['raw_chicken', 1, 1], ['feather', 0, 2]] },
  zombie: { cn: '僵尸', hp: 20, w: 0.62, h: 1.9, speed: 1.45, hostile: true, damage: 3, xp: 5, burn: true, drops: [['rotten_flesh', 0, 2]] },
  skeleton: { cn: '骷髅', hp: 20, w: 0.62, h: 1.9, speed: 1.35, hostile: true, ranged: true, damage: 3, xp: 5, burn: true, drops: [['bone', 0, 2], ['arrow', 0, 2]] },
  creeper: { cn: '苦力怕', hp: 20, w: 0.64, h: 1.7, speed: 1.3, hostile: true, explode: true, xp: 5, drops: [['gunpowder', 0, 2]] },
  spider: { cn: '蜘蛛', hp: 16, w: 1.2, h: 0.8, speed: 1.9, hostile: true, damage: 2, jump: true, xp: 5, drops: [['string', 0, 2]] },
  enderman: {
    cn: '末影人', hp: 40, w: 0.6, h: 2.9, speed: 1.75, hostile: true, damage: 4, xp: 5,
    drops: [['ender_pearl', 0, 1]], teleport: true, eyeHeight: 2.5,
  },
  blaze: {
    cn: '烈焰人', hp: 20, w: 0.62, h: 1.8, speed: 1.7, hostile: true, damage: 0, xp: 10,
    drops: [['blaze_rod', 0, 1]], flying: true, hoverY: 1.6, ranged: true, fireball: 'small', fireProof: true,
  },
  ghast: {
    cn: '恶魂', hp: 12, w: 3.4, h: 3.4, speed: 1.1, hostile: true, xp: 5,
    drops: [['gunpowder', 0, 2]], flying: true, hoverY: 6, ranged: true, fireball: 'big', fireProof: true,
  },
  zombie_pigman: {
    cn: '僵尸猪灵', hp: 20, w: 0.64, h: 1.9, speed: 1.4, hostile: false, damage: 3, xp: 5,
    drops: [['rotten_flesh', 0, 1], ['gold_ingot', 0, 1]], neutral: true, fireProof: true,
  },
  magma_cube: {
    cn: '岩浆怪', hp: 16, w: 1.0, h: 1.0, speed: 1.3, hostile: true, damage: 3, xp: 4,
    drops: [['magma_block', 0, 1]], fireProof: true, jumpy: true,
  },
  shulker: {
    cn: '潜影贝', hp: 30, w: 1.0, h: 1.0, speed: 0, hostile: true, xp: 5,
    drops: [['shulker_shell', 0, 1]], fireProof: true, stationary: true, flying: true, shulker: true, armorHalf: 0.6,
  },
};

/* ---------- 体素风格模型 ---------- */
function mobBox(w, h, d, color, x, y, z, opts = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshLambertMaterial({ color });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.userData.baseColor = new THREE.Color(color);
  return m;
}
function buildMobModel(type) {
  const g = new THREE.Group();
  const parts = { legs: [], head: null, body: null };
  const add = (m) => { g.add(m); return m; };
  if (type === 'pig') {
    parts.body = add(mobBox(0.8, 0.55, 1.1, 0xeaa0a0, 0, 0.45, 0));
    parts.head = add(mobBox(0.55, 0.5, 0.5, 0xeaa0a0, 0, 0.6, -0.75));
    add(mobBox(0.3, 0.22, 0.14, 0xc07070, 0, 0.55, -1.02));
    [-0.26, 0.26].forEach(x => [-0.35, 0.35].forEach(z => parts.legs.push(add(mobBox(0.18, 0.36, 0.18, 0xd08080, x, 0.18, z)))));
  } else if (type === 'cow') {
    parts.body = add(mobBox(0.82, 0.72, 1.25, 0x4a3225, 0, 0.82, 0));
    parts.head = add(mobBox(0.6, 0.55, 0.55, 0x3a2618, 0, 0.95, -0.85));
    add(mobBox(0.42, 0.2, 0.16, 0xe8e0d8, 0, 0.85, -1.12));
    add(mobBox(0.12, 0.16, 0.12, 0xe8e8e0, -0.2, 1.22, -0.9));
    add(mobBox(0.12, 0.16, 0.12, 0xe8e8e0, 0.2, 1.22, -0.9));
    add(mobBox(0.9, 0.34, 0.4, 0xe8e0d8, 0, 0.62, 0.2));
    [-0.28, 0.28].forEach(x => [-0.42, 0.42].forEach(z => parts.legs.push(add(mobBox(0.2, 0.5, 0.2, 0x3a2618, x, 0.25, z)))));
  } else if (type === 'sheep') {
    parts.body = add(mobBox(0.95, 0.85, 1.3, 0xecece4, 0, 0.9, 0));
    parts.head = add(mobBox(0.5, 0.5, 0.5, 0xd8c0a0, 0, 1.05, -0.85));
    add(mobBox(0.6, 0.5, 0.55, 0xe4e4dc, 0, 1.25, -0.55));
    [-0.28, 0.28].forEach(x => [-0.45, 0.45].forEach(z => parts.legs.push(add(mobBox(0.18, 0.5, 0.18, 0xd8c0a0, x, 0.25, z)))));
  } else if (type === 'chicken') {
    parts.body = add(mobBox(0.42, 0.45, 0.55, 0xf4f4f4, 0, 0.42, 0));
    parts.head = add(mobBox(0.3, 0.3, 0.3, 0xf4f4f4, 0, 0.75, -0.3));
    add(mobBox(0.12, 0.1, 0.16, 0xf0c040, 0, 0.72, -0.48));
    add(mobBox(0.14, 0.14, 0.1, 0xd04040, 0, 0.92, -0.34));
    add(mobBox(0.12, 0.22, 0.36, 0xf4f4f4, -0.2, 0.45, 0));
    add(mobBox(0.12, 0.22, 0.36, 0xf4f4f4, 0.2, 0.45, 0));
    [-0.12, 0.12].forEach(x => parts.legs.push(add(mobBox(0.1, 0.2, 0.1, 0xf0c040, x, 0.1, 0))));
  } else if (type === 'zombie') {
    parts.body = add(mobBox(0.6, 0.75, 0.32, 0x2f5a8a, 0, 1.25, 0));
    parts.head = add(mobBox(0.5, 0.5, 0.5, 0x4a8a3a, 0, 1.9, 0));
    add(mobBox(0.12, 0.06, 0.06, 0x101010, -0.13, 1.94, -0.26));
    add(mobBox(0.12, 0.06, 0.06, 0x101010, 0.13, 1.94, -0.26));
    parts.arms = [add(mobBox(0.22, 0.7, 0.22, 0x4a8a3a, -0.42, 1.35, -0.22)), add(mobBox(0.22, 0.7, 0.22, 0x4a8a3a, 0.42, 1.35, -0.22))];
    parts.legs.push(add(mobBox(0.24, 0.8, 0.24, 0x2a3a6a, -0.16, 0.4, 0)), add(mobBox(0.24, 0.8, 0.24, 0x2a3a6a, 0.16, 0.4, 0)));
  } else if (type === 'skeleton') {
    parts.body = add(mobBox(0.55, 0.7, 0.28, 0xdcdcdc, 0, 1.25, 0));
    parts.head = add(mobBox(0.5, 0.5, 0.5, 0xeaeaea, 0, 1.9, 0));
    add(mobBox(0.12, 0.12, 0.06, 0x202020, -0.12, 1.93, -0.26));
    add(mobBox(0.12, 0.12, 0.06, 0x202020, 0.12, 1.93, -0.26));
    parts.arms = [add(mobBox(0.18, 0.68, 0.18, 0xe0e0e0, -0.36, 1.35, -0.1)), add(mobBox(0.18, 0.68, 0.18, 0xe0e0e0, 0.36, 1.35, -0.1))];
    parts.legs.push(add(mobBox(0.2, 0.82, 0.2, 0xe0e0e0, -0.14, 0.4, 0)), add(mobBox(0.2, 0.82, 0.2, 0xe0e0e0, 0.14, 0.4, 0)));
    const bow = add(mobBox(0.1, 0.7, 0.1, 0x8a6537, 0.4, 1.4, -0.3));
    bow.rotation.z = 0.3;
  } else if (type === 'creeper') {
    parts.body = add(mobBox(0.6, 1.0, 0.32, 0x4caf50, 0, 0.85, 0));
    parts.head = add(mobBox(0.55, 0.55, 0.55, 0x4caf50, 0, 1.6, 0));
    add(mobBox(0.16, 0.14, 0.06, 0x0a2a0a, -0.14, 1.68, -0.3));
    add(mobBox(0.16, 0.14, 0.06, 0x0a2a0a, 0.14, 1.68, -0.3));
    add(mobBox(0.2, 0.24, 0.06, 0x0a2a0a, 0, 1.45, -0.3));
    [-0.17, 0.17].forEach(x => [-0.12, 0.12].forEach(z => parts.legs.push(add(mobBox(0.2, 0.35, 0.2, 0x3f9346, x, 0.17, z)))));
  } else if (type === 'spider') {
    parts.body = add(mobBox(0.8, 0.45, 1.0, 0x2a2a2a, 0, 0.5, 0.1));
    parts.head = add(mobBox(0.45, 0.4, 0.4, 0x1e1e1e, 0, 0.55, -0.5));
    add(mobBox(0.1, 0.1, 0.06, 0xd02020, -0.12, 0.62, -0.7));
    add(mobBox(0.1, 0.1, 0.06, 0xd02020, 0.12, 0.62, -0.7));
    for (let i = 0; i < 4; i++) {
      const z = -0.3 + i * 0.25;
      parts.legs.push(add(mobBox(0.5, 0.08, 0.08, 0x1a1a1a, -0.55, 0.35, z)));
      parts.legs.push(add(mobBox(0.5, 0.08, 0.08, 0x1a1a1a, 0.55, 0.35, z)));
    }
  } else if (type === 'enderman') {
    parts.body = add(mobBox(0.5, 1.0, 0.28, 0x14141c, 0, 1.55, 0));
    parts.head = add(mobBox(0.5, 0.5, 0.5, 0x14141c, 0, 2.35, 0));
    add(mobBox(0.14, 0.07, 0.06, 0xc06aff, -0.13, 2.4, -0.26));
    add(mobBox(0.14, 0.07, 0.06, 0xc06aff, 0.13, 2.4, -0.26));
    parts.arms = [add(mobBox(0.16, 1.15, 0.16, 0x1b1b24, -0.33, 1.5, 0)), add(mobBox(0.16, 1.15, 0.16, 0x1b1b24, 0.33, 1.5, 0))];
    parts.legs.push(add(mobBox(0.18, 1.0, 0.18, 0x1b1b24, -0.13, 0.5, 0)), add(mobBox(0.18, 1.0, 0.18, 0x1b1b24, 0.13, 0.5, 0)));
  } else if (type === 'blaze') {
    parts.body = add(mobBox(0.5, 0.7, 0.5, 0xf0b429, 0, 1.0, 0));
    parts.head = add(mobBox(0.44, 0.44, 0.44, 0xf6c945, 0, 0.42, 0));
    add(mobBox(0.12, 0.12, 0.06, 0x201000, -0.11, 0.44, -0.22));
    add(mobBox(0.12, 0.12, 0.06, 0x201000, 0.11, 0.44, -0.22));
    const rodCols = [0xffd766, 0xff9a1f, 0xffe9a8];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      add(mobBox(0.12, 0.7, 0.12, rodCols[i % 3], Math.cos(a) * 0.42, 1.15, Math.sin(a) * 0.42));
    }
    parts.legs.push(add(mobBox(0.14, 0.4, 0.14, 0xffb02e, -0.16, 0.5, 0)), add(mobBox(0.14, 0.4, 0.14, 0xffb02e, 0.16, 0.5, 0)));
  } else if (type === 'ghast') {
    parts.body = add(mobBox(3.0, 3.0, 3.0, 0xe8e8e8, 0, 2.2, 0));
    parts.head = add(mobBox(1.6, 1.4, 1.2, 0xf2f2f2, 0, 2.5, -1.7));
    add(mobBox(0.3, 0.3, 0.16, 0x2a1010, -0.42, 2.7, -2.3));
    add(mobBox(0.3, 0.3, 0.16, 0x2a1010, 0.42, 2.7, -2.3));
    add(mobBox(1.0, 0.2, 0.2, 0x8a1010, 0, 2.0, -2.2));
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      parts.legs.push(add(mobBox(0.28, 1.6, 0.28, 0xdcdcdc, Math.cos(a) * 0.8, 1.4, Math.sin(a) * 0.8)));
    }
  } else if (type === 'zombie_pigman') {
    parts.body = add(mobBox(0.6, 0.75, 0.32, 0x3fa37a, 0, 1.25, 0));
    parts.head = add(mobBox(0.5, 0.5, 0.5, 0xd88a94, 0, 1.9, 0));
    add(mobBox(0.26, 0.16, 0.12, 0xc0707a, 0, 1.82, -0.3));
    add(mobBox(0.12, 0.06, 0.06, 0x101010, -0.13, 1.98, -0.26));
    add(mobBox(0.12, 0.06, 0.06, 0x101010, 0.13, 1.98, -0.26));
    parts.arms = [add(mobBox(0.2, 0.7, 0.2, 0xd88a94, -0.4, 1.35, -0.15)), add(mobBox(0.2, 0.7, 0.2, 0xd88a94, 0.4, 1.35, -0.15))];
    parts.legs.push(add(mobBox(0.22, 0.8, 0.22, 0x2f5a4a, -0.15, 0.4, 0)), add(mobBox(0.22, 0.8, 0.22, 0x2f5a4a, 0.15, 0.4, 0)));
  } else if (type === 'magma_cube') {
    parts.body = add(mobBox(0.9, 0.9, 0.9, 0x3a1d12, 0, 0.5, 0));
    parts.head = add(mobBox(0.7, 0.35, 0.7, 0x2c1409, 0, 1.05, 0));
    add(mobBox(0.14, 0.12, 0.06, 0xffb02e, -0.18, 0.62, -0.46));
    add(mobBox(0.14, 0.12, 0.06, 0xffb02e, 0.18, 0.62, -0.46));
    parts.legs.push(add(mobBox(0.24, 0.24, 0.24, 0xff8a1f, -0.3, 0.12, 0.3)), add(mobBox(0.24, 0.24, 0.24, 0xff8a1f, 0.3, 0.12, 0.3)));
  } else if (type === 'ender_dragon') {
    const body = add(mobBox(3.2, 2.4, 6.0, 0x14141c, 0, 4.2, 0));
    parts.body = body;
    parts.head = add(mobBox(2.2, 1.8, 3.0, 0x14141c, 0, 5.0, -4.6));
    add(mobBox(0.5, 0.4, 0.3, 0xd060ff, -0.6, 5.3, -6.1));
    add(mobBox(0.5, 0.4, 0.3, 0xd060ff, 0.6, 5.3, -6.1));
    // 翅膀
    parts.arms = [];
    for (const s of [-1, 1]) {
      const wing = add(mobBox(7.5, 0.3, 3.4, 0x22222e, s * 4.6, 5.2, 0.8));
      wing.userData.side = s;
      parts.arms.push(wing);
    }
    // 尾
    for (let i = 0; i < 4; i++) add(mobBox(1.8 - i * 0.3, 1.2 - i * 0.15, 2.2, 0x1b1b26, 0, 4.2 - i * 0.1, 3.6 + i * 1.8));
  } else if (type === 'shulker') {
    parts.body = add(mobBox(0.95, 0.62, 0.95, 0x8a4fa8, 0, 0.32, 0));
    parts.shell = add(mobBox(1.0, 0.24, 1.0, 0xa86cc6, 0, 0.78, 0));
    parts.head = add(mobBox(0.55, 0.5, 0.55, 0xd8b0ec, 0, 0.5, 0));
    add(mobBox(0.16, 0.16, 0.06, 0x50405a, -0.14, 0.56, -0.3));
    add(mobBox(0.16, 0.16, 0.06, 0x50405a, 0.14, 0.56, -0.3));
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.material.flatShading = true; } });
  return { group: g, parts };
}

/* ---------- 生物 ---------- */
class Mob {
  constructor(world, type, x, y, z) {
    const t = MOB_TYPES[type];
    this.world = world; this.type = type; this.t = t;
    this.pos = { x, y, z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = Math.random() * TAU;
    this.hp = t.hp; this.maxHp = t.hp;
    this.width = t.w; this.height = t.h;
    this.onGround = false;
    this.aiTimer = Math.random() * 2;
    this.state = 'idle';
    this.wanderDir = { x: 0, z: 0 };
    this.attackCD = 0;
    this.hurtTimer = 0;
    this.dead = false;
    this.deathTimer = 0;
    this.fuse = -1;
    this.walkPhase = Math.random() * 10;
    this.jumpCD = 0;
    this.spawnTick = 0;
    const model = buildMobModel(type);
    this.model = model.group; this.parts = model.parts;
    world.scene.add(this.model);
    this.updateModel();
  }
  get box() { return new Box(this.pos.x - this.width / 2, this.pos.y, this.pos.z - this.width / 2, this.pos.x + this.width / 2, this.pos.y + this.height, this.pos.z + this.width / 2); }
  updateModel() {
    this.model.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.model.rotation.y = -this.yaw + Math.PI;
    if (this.dead) this.model.rotation.z = Math.min(Math.PI / 2, this.deathTimer * 4);
  }
  hurt(amount, kb, source) {
    if (this.dead) return;
    // 潜影贝缩壳时减伤
    if (this.t.shulker && this.shellClosed) amount *= (1 - this.t.armorHalf);
    this.hp -= amount;
    this.hurtTimer = 0.35;
    if (this.t.shulker) { this.shellClosed = true; this.shellTimer = 2.5; }
    if (kb) {
      this.vel.x += kb.x * 4; this.vel.z += kb.z * 4;
      if (this.onGround) this.vel.y = 4;
    }
    if (source && source.pos) { this.lastHitX = source.pos.x; this.lastHitZ = source.pos.z; }
    if (!this.t.hostile) this.state = 'flee';
    else if (source && source.pos) this.chaseTarget = source;
    if (this.t.neutral) this.hostileNow = true;
    if (this.t.teleport && !this.dead) this.teleportAway();
    this.aiTimer = 0;
    MC.sound.play(this.type === 'skeleton' ? 'skeleton_hurt' : 'hurt_mob', this.pos.x, this.pos.y, this.pos.z);
    if (this.hp <= 0) this.die(source);
  }
  die(killer) {
    this.dead = true;
    this.deathTimer = 0;
    const t = this.t;
    if (t.xp) {
      if (killer && killer.addXP) killer.addXP(t.xp + randInt(3));
    }
    for (const [id, min, max] of t.drops) {
      const c = min + randInt(max - min + 1);
      if (c > 0) this.world.spawnItem(this.pos.x, this.pos.y + this.height * 0.5, this.pos.z, id, c);
    }
    if (this.type === 'zombie' && killer && killer.isPlayer) { MC.ui.unlock('zombie'); MC.ach.killedZombie++; }
    if (this.type === 'creeper' && killer && killer.isPlayer) MC.ui.unlock('creeper');
    if (this.type === 'shulker' && killer && killer.isPlayer) MC.ui.unlock('shulker');
    if (this.t.hostile && killer && killer.isPlayer && killer.arrowRecently && performance.now() - killer.arrowRecently < 400) MC.ui.unlock('bow');
    if (!this.t.hostile && killer && killer.isPlayer) { MC.ach.killedAnimal++; MC.ui.unlock('hunt'); MC.ach.farm = MC.ach.farm || false; }
    MC.sound.play('death_mob', this.pos.x, this.pos.y, this.pos.z);
  }
  tick(dt, player) {
    if (this.dead) {
      this.deathTimer += dt;
      if (this.deathTimer > 1.2) this.remove = true;
      this.updateModel();
      return;
    }
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.attackCD = Math.max(0, this.attackCD - dt);
    this.jumpCD = Math.max(0, this.jumpCD - dt);
    if (this.t.shulker) return this.tickShulker(dt, player);
    const t = this.t;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const dy = player.pos.y - this.pos.y;
    let speed = t.speed;
    let moveX = 0, moveZ = 0;

    // 白天燃烧（仅主世界，且不怕火的生物免疫）
    if (t.burn && !t.fireProof && this.world.hasSky() && this.world.isDay() && this.world.getSkyLight(Math.floor(this.pos.x), Math.floor(this.pos.y + 1), Math.floor(this.pos.z)) > 12) {
      this.burnTimer = (this.burnTimer || 0) + dt;
      if (Math.random() < dt * 6) MC.particles.smoke(this.pos.x, this.pos.y + 1, this.pos.z);
      if (this.burnTimer > 1) { this.burnTimer = 0; this.hurt(1, null, null); }
      if (this.hp <= 0) return;
    }
    // 昼夜行为
    const hostileActive = (t.hostile || this.hostileNow) && (MC.difficulty > 0);
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.aiTimer = 1 + Math.random() * 3;
      if (this.state !== 'chase' && this.state !== 'flee') {
        if (Math.random() < 0.55) {
          const a = Math.random() * TAU;
          this.wanderDir = { x: Math.cos(a), z: Math.sin(a) };
          this.state = 'wander';
        } else this.state = 'idle';
      }
      if (this.state === 'flee' && this.aiTimer < 1) this.state = 'idle';
    }

    if (hostileActive && this.state !== 'flee' && dist < 20 && MC.player.alive && !MC.player.creative) {
      this.state = 'chase';
      if (t.explode) {
        if (dist < 3.2) {
          if (this.fuse < 0) { this.fuse = 1.5; MC.sound.play('fuse', this.pos.x, this.pos.y, this.pos.z); }
          this.fuse -= dt;
          if (Math.random() < dt * 10) MC.particles.smoke(this.pos.x, this.pos.y + 1.4, this.pos.z);
          if (this.fuse <= 0) {
            this.world.explode(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.5), Math.floor(this.pos.z), 3.4, this);
            this.remove = true;
            return;
          }
          moveX = 0; moveZ = 0;
        } else { this.fuse = -1; moveX = dx / dist; moveZ = dz / dist; }
      } else if (t.ranged) {
        if (dist < 8) { moveX = -dx / dist; moveZ = -dz / dist; }
        else if (dist > 14) { moveX = dx / dist; moveZ = dz / dist; }
        if (this.attackCD <= 0 && dist < 16 && Math.abs(dy) < 6) {
          this.attackCD = 1.8 + Math.random();
          this.shoot(player);
        }
      } else {
        moveX = dx / dist; moveZ = dz / dist;
        const reach = t.flying ? 2.2 : 1.4;
        if (dist < reach && Math.abs(dy) < 2.6 && this.attackCD <= 0) {
          this.attackCD = 1;
          MC.player.hurt(t.damage, { x: dx / dist, z: dz / dist }, t.cn);
        }
      }
    } else if (this.state === 'flee') {
      const fdx = this.pos.x - (this.lastHitX || player.pos.x), fdz = this.pos.z - (this.lastHitZ || player.pos.z);
      const fl = Math.hypot(fdx, fdz) || 1;
      moveX = fdx / fl; moveZ = fdz / fl; speed *= 1.6;
    } else if (this.state === 'wander') {
      moveX = this.wanderDir.x; moveZ = this.wanderDir.z; speed *= 0.5;
    }

    if (moveX || moveZ) {
      const l = Math.hypot(moveX, moveZ);
      moveX /= l; moveZ /= l;
      this.yaw = angLerp(this.yaw, Math.atan2(moveX, moveZ), Math.min(1, dt * 8));
      this.vel.x = moveX * speed;
      this.vel.z = moveZ * speed;
      this.walkPhase += dt * speed * 7;
    } else {
      this.vel.x *= 0.6; this.vel.z *= 0.6;
    }
    // 物理：飞行生物无重力，悬浮追击
    if (t.flying) {
      const targetY = this.state === 'chase' ? player.pos.y + (t.hoverY || 2) : this.pos.y;
      const dyv = (targetY - this.pos.y) * 1.6;
      this.vel.y = clamp(dyv, -3, 3) + Math.sin(performance.now() / 700 + this.walkPhase) * 0.25;
      const e2 = { x: this.pos.x, y: this.pos.y, z: this.pos.z, height: this.height, onGround: false };
      this.world.moveEntity(e2, this.pos.x + this.vel.x * dt, this.pos.y + this.vel.y * dt, this.pos.z + this.vel.z * dt, this.width, 0);
      this.pos.x = e2.x; this.pos.y = e2.y; this.pos.z = e2.z;
      this.onGround = false;
      this.walkPhase += dt * 6;
      this.updateAnim(dt);
      this.updateModel();
      if (dist > 90) this.remove = true;
      return;
    }
    this.vel.y -= 26 * dt;
    if (this.vel.y < -30) this.vel.y = -30;
    const e = { x: this.pos.x, y: this.pos.y, z: this.pos.z, height: this.height, vx: 0, vy: 0, vz: 0 };
    const res = this.world.moveEntity(e, this.pos.x + this.vel.x * dt, this.pos.y + this.vel.y * dt, this.pos.z + this.vel.z * dt, this.width, 0.6);
    this.pos.x = e.x; this.pos.y = e.y; this.pos.z = e.z;
    this.onGround = !!e.onGround;
    if (this.onGround && this.jumpCD <= 0 && (this.vel.x !== 0 || this.vel.z !== 0) && this.blockedAhead()) {
      this.vel.y = this.t.jump ? 7.4 : 6.6;
      this.jumpCD = 0.4;
    }
    // 水/岩浆/火
    const inBlock = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z));
    if (inBlock === B.water) { this.vel.y = Math.max(this.vel.y, 1.2); }
    if (inBlock === B.lava && !t.fireProof) this.hurt(4 * dt, null, null);
    if (inBlock === B.fire && !t.fireProof) this.hurt(1.2 * dt, null, null);
    // 仙人掌伤害
    const near = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z));
    if (near === B.cactus) this.hurt(1 * dt, null, null);
    if (near === B.magma_block && !t.fireProof) this.hurt(0.8 * dt, null, null);

    this.updateAnim(dt);
    this.updateModel();
    // 距离过远消失
    if (dist > 90) this.remove = true;
  }
  updateAnim(dt) {
    const swing = Math.sin(this.walkPhase) * 0.5;
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.1;
    this.parts.legs.forEach((leg, i) => { leg.rotation.x = moving ? swing * (i % 2 ? -1 : 1) : 0; });
    if (this.parts.arms) {
      this.parts.arms.forEach((arm, i) => {
        if (this.type === 'ender_dragon') { arm.rotation.z = Math.sin(performance.now() / 260 + i * Math.PI) * 0.45; }
        else arm.rotation.x = this.state === 'chase' ? -1.4 : (moving ? swing * (i ? -1 : 1) : 0);
      });
    }
    if (this.parts.head) this.parts.head.rotation.y = moving ? 0 : Math.sin(performance.now() / 900 + this.walkPhase) * 0.3;
    if (this.hurtTimer > 0) {
      this.model.traverse(o => { if (o.isMesh) o.material.color.setRGB(1, 0.35, 0.35); });
    } else {
      this.model.traverse(o => { if (o.isMesh && o.userData.baseColor) o.material.color.copy(o.userData.baseColor); });
    }
  }
  blockedAhead() {
    const fx = this.pos.x + Math.sin(this.yaw) * 0.6, fz = this.pos.z + Math.cos(this.yaw) * 0.6;
    for (let dy = 0; dy < this.height; dy += 0.5) {
      const d = this.world.getBlockDef(Math.floor(fx), Math.floor(this.pos.y + dy), Math.floor(fz));
      if (d.solid && !d.noCollide) return true;
    }
    return false;
  }
  /* 末影人瞬移 */
  /* 潜影贝：固定在原地悬浮，靠近的玩家会被追踪弹攻击 */
  tickShulker(dt, player) {
    this.age = (this.age || 0) + dt;
    this.shellTimer = Math.max(0, (this.shellTimer || 0) - dt);
    this.shellClosed = this.shellTimer > 0;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz, player.pos.y - this.pos.y);
    if (this.parts.shell) {
      const t = this.shellClosed ? 0.12 : 0.34;
      this.parts.shell.position.y = 0.78 - t;
      this.parts.body.scale.y = this.shellClosed ? 0.75 : 1;
    }
    // 缓慢转向玩家并微微浮动
    if (dist < 20) this.yaw = angLerp(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * 2));
    this.pos.y += Math.sin(this.age * 1.5) * 0.0025;
    const opened = !this.shellClosed && dist < 16 && MC.difficulty > 0 && MC.player.alive && !MC.player.creative;
    if (opened && this.attackCD <= 0) {
      this.attackCD = 2.2 + Math.random() * 0.8;
      const sx = this.pos.x, sy = this.pos.y + 0.6, sz = this.pos.z;
      const tx = player.pos.x, ty = player.pos.y + 1.2, tz = player.pos.z;
      const d = Math.hypot(tx - sx, ty - sy, tz - sz) || 1;
      const speed = 9;
      this.world.arrows.push(new ShulkerBullet(this.world, sx, sy, sz, (tx - sx) / d * speed, (ty - sy) / d * speed, (tz - sz) / d * speed, this));
      MC.sound.play('shulker_shoot', this.pos.x, this.pos.y, this.pos.z);
    }
    this.updateAnim(dt);
    this.updateModel();
  }

  teleportAway() {
    const w = this.world;
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * TAU, d = 6 + Math.random() * 12;
      const x = Math.floor(this.pos.x + Math.cos(a) * d), z = Math.floor(this.pos.z + Math.sin(a) * d);
      for (let dy = 6; dy >= -6; dy--) {
        const y = Math.floor(this.pos.y) + dy;
        if (y < 1 || y > WORLD_H - 4) continue;
        const below = w.getBlockDef(x, y - 1, z);
        if (!below.solid) continue;
        if (w.getBlockDef(x, y, z).solid || w.getBlockDef(x, y + 1, z).solid || w.getBlockDef(x, y + 2, z).solid) continue;
        MC.particles.hit(this.pos.x, this.pos.y + 1.4, this.pos.z, 0xc06aff, 14);
        this.pos = { x: x + 0.5, y: y, z: z + 0.5 };
        this.vel = { x: 0, y: 0, z: 0 };
        MC.particles.hit(this.pos.x, this.pos.y + 1.4, this.pos.z, 0xc06aff, 14);
        MC.sound.play('teleport', this.pos.x, this.pos.y, this.pos.z);
        this.updateModel();
        return true;
      }
    }
    return false;
  }
  shoot(player) {
    const t = this.t;
    if (t.ranged && t.fireball) {
      const sx = this.pos.x, sy = this.pos.y + this.height * 0.6, sz = this.pos.z;
      const tx = player.pos.x, ty = player.pos.y + 1.2, tz = player.pos.z;
      const dx = tx - sx, dy = ty - sy, dz = tz - sz;
      const d = Math.hypot(dx, dy, dz) || 1;
      const speed = t.fireball === 'big' ? 16 : 22;
      const fb = new Fireball(this.world, sx, sy + 0.6, sz, dx / d * speed, (dy / d) * speed + d * 0.04, dz / d * speed, this, t.fireball === 'big');
      this.world.arrows.push(fb);
      MC.sound.play('fireball', sx, sy, sz);
      return;
    }
    const sx = this.pos.x, sy = this.pos.y + this.height * 0.85, sz = this.pos.z;
    const tx = player.pos.x, ty = player.pos.y + 1.4, tz = player.pos.z;
    const dx = tx - sx, dy = ty - sy, dz = tz - sz;
    const d = Math.hypot(dx, dy, dz) || 1;
    const speed = 22;
    const arrow = new Arrow(this.world, sx, sy, sz, dx / d * speed, dy / d * speed + d * 0.09, dz / d * speed, this);
    this.world.arrows.push(arrow);
    MC.sound.play('bow', sx, sy, sz);
  }
  removeFromWorld() {
    this.world.scene.remove(this.model);
    this.model.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
}

/* ---------- 箭矢 ---------- */
class Arrow {
  constructor(world, x, y, z, vx, vy, vz, owner) {
    this.world = world;
    this.x = x; this.y = y; this.z = z;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.owner = owner;
    this.age = 0;
    this.stuck = false;
    const geo = new THREE.BoxGeometry(0.08, 0.08, 0.6);
    const mat = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
    this.mesh = new THREE.Mesh(geo, mat);
    world.scene.add(this.mesh);
    this.updateMesh();
  }
  updateMesh() {
    this.mesh.position.set(this.x, this.y, this.z);
    const d = Math.hypot(this.vx, this.vy, this.vz) || 1;
    this.mesh.lookAt(this.x + this.vx / d, this.y + this.vy / d, this.z + this.vz / d);
  }
  tick(dt) {
    if (this.stuck) { this.age += dt; return; }
    this.age += dt;
    this.vy -= 18 * dt;
    const steps = 3;
    for (let s = 0; s < steps; s++) {
      const nx = this.x + this.vx * dt / steps, ny = this.y + this.vy * dt / steps, nz = this.z + this.vz * dt / steps;
      // 命中方块
      const def = this.world.getBlockDef(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      if (def.solid && !def.noCollide) {
        this.x = nx; this.y = ny; this.z = nz;
        this.stuck = true; this.vx = this.vy = this.vz = 0;
        this.updateMesh();
        MC.sound.play('arrow_hit', this.x, this.y, this.z);
        return;
      }
      // 命中生物
      if (this.owner !== MC.player) {
        const pb = MC.player.box;
        if (pb.contains(nx, ny, nz) || (Math.abs(nx - MC.player.pos.x) < 0.45 && ny > MC.player.pos.y && ny < MC.player.pos.y + 1.8 && Math.abs(nz - MC.player.pos.z) < 0.45)) {
          const dmg = 4;
          MC.player.hurt(dmg, { x: this.vx / 20, z: this.vz / 20 }, '骷髅');
          this.remove = true;
          return;
        }
      }
      for (const mob of this.world.mobs) {
        if (mob === this.owner || mob.dead) continue;
        const b = mob.box;
        if (nx > b.x0 && nx < b.x1 && ny > b.y0 && ny < b.y1 && nz > b.z0 && nz < b.z1) {
          mob.hurt(4, { x: this.vx / 20, z: this.vz / 20 }, MC.player);
          MC.player.arrowRecently = performance.now();
          this.remove = true;
          return;
        }
      }
      this.x = nx; this.y = ny; this.z = nz;
    }
    this.updateMesh();
    if (this.age > 30) this.remove = true;
  }
  dispose() { this.world.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

/* ---------- 火球（烈焰人 / 恶魂） ---------- */
class Fireball {
  constructor(world, x, y, z, vx, vy, vz, owner, big) {
    this.world = world;
    this.x = x; this.y = y; this.z = z;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.owner = owner; this.big = big;
    this.age = 0;
    const size = big ? 0.9 : 0.42;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshBasicMaterial({ color: big ? 0xd8a0ff : 0xffb02e });
    this.mesh = new THREE.Mesh(geo, mat);
    this.core = new THREE.Mesh(new THREE.BoxGeometry(size * 0.55, size * 0.55, size * 0.55), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.mesh.add(this.core);
    world.scene.add(this.mesh);
    this.updateMesh();
  }
  updateMesh() { this.mesh.position.set(this.x, this.y, this.z); this.mesh.rotation.y += 0.2; this.mesh.rotation.x += 0.15; }
  tick(dt) {
    this.age += dt;
    const steps = 3;
    for (let s = 0; s < steps; s++) {
      const nx = this.x + this.vx * dt / steps, ny = this.y + this.vy * dt / steps, nz = this.z + this.vz * dt / steps;
      const def = this.world.getBlockDef(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      if (def.solid && !def.noCollide) { this.hit(nx, ny - this.vy * dt * 0.05, nz); return; }
      const pb = MC.player.box;
      if (pb.contains(nx, ny, nz)) { this.hit(nx, ny, nz, true); return; }
      this.x = nx; this.y = ny; this.z = nz;
    }
    this.updateMesh();
    if (this.age > 12) { this.explode(); return; }
    if (Math.random() < dt * 20) MC.particles.smoke(this.x, this.y, this.z);
  }
  hit(x, y, z, onPlayer) {
    if (this.big) {
      this.world.explode(Math.floor(x), Math.floor(y), Math.floor(z), 2.6, this.owner);
    } else {
      MC.particles.explosion(x, y, z, 0.6);
      MC.sound.play('fireball_hit', x, y, z);
      if (onPlayer) MC.player.hurt(5, { x: this.vx / 20, z: this.vz / 20 }, '烈焰人');
      const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
      if (this.world.getBlock(bx, by, bz) === 0 && this.world.getBlockDef(bx, by - 1, bz).solid) this.world.setBlock(bx, by, bz, B.fire, {});
    }
    this.remove = true;
  }
  explode() { if (this.big) this.world.explode(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z), 2.6, this.owner); this.remove = true; }
  dispose() { this.world.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

/* ---------- 末影水晶（治疗末影龙，被击碎时爆炸） ---------- */
/* ---------- 潜影贝追踪弹 ---------- */
class ShulkerBullet {
  constructor(world, x, y, z, vx, vy, vz, owner) {
    this.world = world;
    this.x = x; this.y = y; this.z = z;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.owner = owner;
    this.age = 0;
    const geo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
    const mat = new THREE.MeshBasicMaterial({ color: 0xd8b0ec });
    this.mesh = new THREE.Mesh(geo, mat);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.mesh.add(core);
    world.scene.add(this.mesh);
  }
  tick(dt) {
    this.age += dt;
    const p = MC.player;
    const tx = p.pos.x, ty = p.pos.y + 1.2, tz = p.pos.z;
    const dx = tx - this.x, dy = ty - this.y, dz = tz - this.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const speed = 9;
    // 追踪：朝玩家转向
    this.vx += (dx / d * speed - this.vx) * Math.min(1, dt * 3.2);
    this.vy += (dy / d * speed - this.vy) * Math.min(1, dt * 3.2);
    this.vz += (dz / d * speed - this.vz) * Math.min(1, dt * 3.2);
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y += dt * 6; this.mesh.rotation.x += dt * 4;
    if (Math.random() < dt * 20) MC.particles.hit(this.x, this.y, this.z, 0xd8b0ec, 1);
    const def = this.world.getBlockDef(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
    if (def.solid && !def.noCollide) { this.remove = true; return; }
    if (Math.abs(this.x - p.pos.x) < 0.6 && this.y > p.pos.y && this.y < p.pos.y + 1.9 && Math.abs(this.z - p.pos.z) < 0.6) {
      p.hurt(4, { x: this.vx / 12, z: this.vz / 12 }, '潜影贝');
      this.remove = true;
      return;
    }
    if (this.age > 9) this.remove = true;
  }
  dispose() { this.world.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

class EndCrystal {
  constructor(world, x, y, z) {
    this.world = world; this.x = x; this.y = y; this.z = z;
    this.hp = 1; this.dead = false; this.age = Math.random() * 6;
    this.t = { cn: '末影水晶', hostile: false };
    const g = new THREE.Group();
    const base = mobBox(1.0, 0.3, 1.0, 0x2a2a34, 0, -0.15, 0);
    this.core = mobBox(0.7, 0.9, 0.7, 0xd8a0ff, 0, 0.5, 0);
    this.inner = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.42), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.inner.position.set(0, 0.5, 0);
    g.add(base, this.core, this.inner);
    g.position.set(x, y, z);
    world.scene.add(g);
    this.model = g;
  }
  get pos() { return { x: this.x, y: this.y, z: this.z }; }
  get height() { return 1.2; }
  update(dt) {
    this.age += dt;
    this.core.rotation.y += dt * 1.2;
    this.inner.rotation.y -= dt * 1.6;
    this.model.position.y = this.y + Math.sin(this.age * 1.6) * 0.12;
    for (const e of this.world.mobs) {
      if (e.type !== 'ender_dragon' || e.dead) continue;
      const d = Math.hypot(e.pos.x - this.x, e.pos.z - this.z);
      if (d < 42 && e.hp < e.maxHp) {
        e.hp = Math.min(e.maxHp, e.hp + dt * 1.6);
        if (MC.ui) MC.ui.setBossBar('末影龙', e.hp / e.maxHp, true);
      }
    }
  }
  hurt() {
    if (this.dead) return;
    this.dead = true;
    if (MC.ui) MC.ui.unlock('crystal');
    MC.particles.explosion(this.x, this.y + 0.5, this.z, 1.6);
    MC.sound.play('explode', this.x, this.y, this.z);
    for (const e of this.world.mobs) {
      if (e.type === 'ender_dragon' && !e.dead) {
        const d = Math.hypot(e.pos.x - this.x, e.pos.z - this.z);
        if (d < 22) e.hurt(12, null, MC.player);
      }
    }
    this.remove = true;
  }
  dispose() { this.world.scene.remove(this.model); this.model.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); }
}

/* ---------- 末影龙（Boss） ---------- */
class EnderDragon {
  constructor(world) {
    this.world = world;
    this.type = 'ender_dragon';
    this.t = { cn: '末影龙', hostile: true, damage: 6, xp: 200, drops: [], flying: true, fireProof: true };
    this.pos = { x: 0, y: 76, z: -26 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.pitch = 0;
    this.hp = 200; this.maxHp = 200;
    this.width = 4;
    this.dead = false; this.remove = false;
    this.angle = 0; this.radius = 30;
    this.state = 'circle';
    this.stateTimer = 0;
    this.attackCD = 3;
    this.hurtTimer = 0;
    this.diveTarget = null;
    const model = buildMobModel('ender_dragon');
    this.model = model.group; this.parts = model.parts;
    world.scene.add(this.model);
    this.updateModel();
  }
  get box() { return new Box(this.pos.x - 2.6, this.pos.y - 1.8, this.pos.z - 2.6, this.pos.x + 2.6, this.pos.y + 2.2, this.pos.z + 2.6); }
  get isPlayer() { return false; }
  get height() { return 3.6; }
  updateModel() {
    this.model.position.set(this.pos.x, this.pos.y - 2.6, this.pos.z);
    this.model.rotation.y = -this.yaw + Math.PI;
    this.model.rotation.z = this.pitch * 0.4;
  }
  hurt(amount, kb, source) {
    if (this.dead) return;
    this.hp -= amount;
    this.hurtTimer = 0.3;
    MC.sound.play('dragon_hurt', this.pos.x, this.pos.y, this.pos.z);
    if (MC.ui) MC.ui.setBossBar('末影龙', Math.max(0, this.hp / this.maxHp), true);
    if (this.hp <= 0) this.die();
  }
  die() {
    this.dead = true;
    MC.sound.play('dragon_death', this.pos.x, this.pos.y, this.pos.z);
    for (let i = 0; i < 8; i++) MC.particles.explosion(this.pos.x + (Math.random() - 0.5) * 8, this.pos.y + Math.random() * 4, this.pos.z + (Math.random() - 0.5) * 8, 1.5);
    const y = 64;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (this.world.getBlock(dx, y, dz) === 0) this.world.setBlock(dx, y, dz, B.end_portal, { noSupport: true });
    }
    this.world.setBlock(0, y + 1, 0, B.dragon_egg, { noSupport: true });
    if (MC.player) MC.player.addXP(2000);
    MC.ui.setBossBar('', 0, false);
    MC.ui.unlock('dragon');
    MC.onDragonDefeated();
  }
  tick(dt, player) {
    if (this.dead) { this.remove = true; return; }
    if (!MC.ui.bossVisible) MC.ui.setBossBar('末影龙', this.hp / this.maxHp, true);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.stateTimer -= dt;
    this.attackCD -= dt;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (this.state === 'circle') {
      this.angle += dt * 0.28;
      const tx = Math.cos(this.angle) * this.radius, tz = Math.sin(this.angle) * this.radius;
      const ty = 74 + Math.sin(this.angle * 2) * 5;
      this.moveToward(tx, ty, tz, dt, 9);
      this.yaw = angLerp(this.yaw, Math.atan2(tx - this.pos.x, tz - this.pos.z), Math.min(1, dt * 3));
      if (this.attackCD <= 0 && dist < 44) {
        this.state = 'dive';
        this.stateTimer = 2.6;
        this.attackCD = 5 + Math.random() * 3;
        this.diveTarget = { x: player.pos.x, y: player.pos.y + 1, z: player.pos.z };
        MC.sound.play('dragon_roar', this.pos.x, this.pos.y, this.pos.z);
      }
    } else if (this.state === 'dive') {
      const tgt = this.diveTarget || { x: player.pos.x, y: player.pos.y + 1, z: player.pos.z };
      this.moveToward(tgt.x, tgt.y, tgt.z, dt, 22);
      this.yaw = angLerp(this.yaw, Math.atan2(tgt.x - this.pos.x, tgt.z - this.pos.z), Math.min(1, dt * 5));
      const pd = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      if (pd < 5 && Math.abs(player.pos.y - this.pos.y) < 5) {
        player.hurt(6, { x: (player.pos.x - this.pos.x) / (pd + 0.1), z: (player.pos.z - this.pos.z) / (pd + 0.1) }, '末影龙');
      }
      if (this.stateTimer <= 0 || this.pos.y < 46) { this.state = 'circle'; this.diveTarget = null; }
    }
    this.pitch = clamp((this.pos.y - 74) * -0.02, -0.4, 0.4);
    if (this.hurtTimer > 0) this.model.traverse(o => { if (o.isMesh) o.material.color.setRGB(1, 0.4, 0.5); });
    else this.model.traverse(o => { if (o.isMesh && o.userData.baseColor) o.material.color.copy(o.userData.baseColor); });
    if (this.parts.arms) this.parts.arms.forEach((w, i) => { w.rotation.z = Math.sin(performance.now() / 240 + i * Math.PI) * 0.5; });
    this.updateModel();
    if (Math.random() < dt * 3) MC.particles.smoke(this.pos.x, this.pos.y, this.pos.z);
  }
  moveToward(tx, ty, tz, dt, speed) {
    const dx = tx - this.pos.x, dy = ty - this.pos.y, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    this.vel.x = dx / d * speed; this.vel.y = dy / d * speed; this.vel.z = dz / d * speed;
    this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt; this.pos.z += this.vel.z * dt;
  }
  removeFromWorld() { this.world.scene.remove(this.model); this.model.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); }
}

/* ---------- 粒子 ---------- */
/* ---------- 末影之眼（飞行寻找要塞） ---------- */
class EyeProjectile {
  constructor(world, x, y, z, dx, dz) {
    this.world = world; this.x = x; this.y = y; this.z = z;
    const l = Math.hypot(dx, dz) || 1;
    this.vx = dx / l * 13; this.vz = dz / l * 13; this.vy = 4.2;
    this.age = 0;
    const geo = new THREE.BoxGeometry(0.36, 0.36, 0.36);
    const mat = new THREE.MeshBasicMaterial({ color: 0x8fe070 });
    this.mesh = new THREE.Mesh(geo, mat);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.mesh.add(core);
    world.scene.add(this.mesh);
    this.updateMesh();
  }
  updateMesh() { this.mesh.position.set(this.x, this.y, this.z); this.mesh.rotation.y += 0.3; this.mesh.rotation.x += 0.2; }
  tick(dt) {
    this.age += dt;
    this.vy -= 7.5 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    this.updateMesh();
    if (Math.random() < dt * 30) MC.particles.smoke(this.x, this.y, this.z);
    if (this.age > 2.6 || this.vy < -8) {
      this.world.spawnItem(this.x, this.y, this.z, 'eye_of_ender', 1);
      this.remove = true;
    }
  }
  dispose() { this.world.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

class Particles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.pool = [];
    this.geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    this.mats = new Map();
  }
  mat(color) {
    if (!this.mats.has(color)) this.mats.set(color, new THREE.MeshBasicMaterial({ color }));
    return this.mats.get(color);
  }
  spawn(x, y, z, vx, vy, vz, color, life, size) {
    if (this.list.length > 400) return;
    let m = this.pool.pop();
    if (!m) m = new THREE.Mesh(this.geo, this.mat(color));
    else m.material = this.mat(color);
    m.scale.setScalar((size || 1));
    m.position.set(x, y, z);
    this.scene.add(m);
    this.list.push({ m, x, y, z, vx, vy, vz, life, maxLife: life, color, size: size || 1 });
  }
  blockBreak(x, y, z, def, count = 14) {
    const tile = this.avgColor(def);
    for (let i = 0; i < count; i++) {
      this.spawn(x + Math.random(), y + Math.random(), z + Math.random(),
        (Math.random() - 0.5) * 3, Math.random() * 2.4, (Math.random() - 0.5) * 3,
        tile[randInt(tile.length)], 0.6 + Math.random() * 0.5, 0.6 + Math.random() * 0.7);
    }
  }
  hit(x, y, z, color, count = 8) {
    for (let i = 0; i < count; i++) {
      this.spawn(x, y, z, (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3, color, 0.5 + Math.random() * 0.4, 0.7);
    }
  }
  explosion(x, y, z, power) {
    const cols = [0xffcc55, 0xff8822, 0x888888, 0x333333];
    const n = Math.min(160, 40 + power * 18);
    for (let i = 0; i < n; i++) {
      const s = 3 + Math.random() * 6;
      this.spawn(x, y, z, (Math.random() - 0.5) * s, Math.random() * s * 0.8, (Math.random() - 0.5) * s,
        cols[randInt(cols.length)], 0.7 + Math.random() * 0.9, 0.8 + Math.random() * 2);
    }
  }
  smoke(x, y, z) {
    this.spawn(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, 0, 1.2, 0, 0x555555, 1.1, 0.8);
  }
  splash(x, y, z, count = 10) {
    for (let i = 0; i < count; i++) this.spawn(x, y, z, (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3, 0x5b93ff, 0.6, 0.6);
  }
  avgColor(def) {
    const key = def.id;
    if (this._avgCache && this._avgCache[key]) return this._avgCache[key];
    this._avgCache = this._avgCache || {};
    const tileIdx = def.tex ? (def.tex.side ?? def.tex.all ?? def.tex.top) : T.STONE;
    const c = MC.atlas.tileCanvas(tileIdx);
    let r = 0, g = 0, b = 0, n = 0;
    try {
      const data = c.getContext('2d').getImageData(0, 0, 16, 16).data;
      for (let i = 0; i < data.length; i += 4) { if (data[i + 3] < 40) continue; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
    } catch (e) { n = 0; }
    if (!n) return [0x999999];
    const hex = rgbHex(r / n, g / n, b / n);
    const out = [hex, shade(hex, 0.8), shade(hex, 1.2), shade(hex, 0.65)];
    this._avgCache[key] = out;
    return out;
  }
  tick(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.m); this.pool.push(p.m);
        this.list.splice(i, 1); continue;
      }
      p.vy -= 14 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const def = MC.world.getBlockDef(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
      if (def.solid && !def.noCollide) { p.y = Math.floor(p.y) + 1.01; p.vy = 0; p.vx *= 0.6; p.vz *= 0.6; }
      const s = Math.max(0.05, p.life / p.maxLife);
      p.m.position.set(p.x, p.y, p.z);
      p.m.scale.setScalar(s * p.size);
      p.m.rotation.x += dt * 5; p.m.rotation.y += dt * 3;
    }
  }
  clear() {
    for (const p of this.list) { this.scene.remove(p.m); this.pool.push(p.m); }
    this.list.length = 0;
  }
}

/* ---------- 生物管理器 ---------- */
class EntityManager {
  constructor(world) { this.world = world; this.spawnTimer = 3; this.passiveTimer = 5; }
  update(dt, player) {
    const w = this.world;
    for (let i = w.mobs.length - 1; i >= 0; i--) {
      const m = w.mobs[i];
      if (Math.abs(m.pos.x - player.pos.x) > 120) m.remove = true;
      m.tick(dt, player);
      if (m.remove) { m.removeFromWorld(); w.mobs.splice(i, 1); }
    }
    for (let i = w.arrows.length - 1; i >= 0; i--) {
      const a = w.arrows[i];
      a.tick(dt);
      if (a.remove || a.age > 60) { a.dispose(); w.arrows.splice(i, 1); }
    }
    // 末影水晶
    if (w.crystals.length) {
      for (let i = w.crystals.length - 1; i >= 0; i--) {
        const c = w.crystals[i];
        c.update(dt);
        if (c.remove) { c.dispose(); w.crystals.splice(i, 1); }
      }
    }
    this.spawnTimer -= dt; this.passiveTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnTimer = 2.5; this.trySpawnHostile(player); }
    if (this.passiveTimer <= 0) { this.passiveTimer = 4; this.trySpawnPassive(player); }
  }
  randomSpawnPos(player, minD, maxD) {
    const a = Math.random() * TAU, d = minD + Math.random() * (maxD - minD);
    const x = Math.floor(player.pos.x + Math.cos(a) * d), z = Math.floor(player.pos.z + Math.sin(a) * d);
    const c = this.world.getChunkAt(x, z);
    if (!c) return null;
    const h = c.heightmap[(z - c.z * CHUNK_W) * CHUNK_W + (x - c.x * CHUNK_W)];
    if (h <= SEA_LEVEL) return null;
    // 需要上方两格空气
    for (let y = h + 1; y <= h + 2; y++) {
      const d2 = this.world.getBlockDef(x, y, z);
      if (d2.solid && !d2.noCollide) return null;
    }
    return { x: x + 0.5, y: h + 1.02, z: z + 0.5 };
  }
  countHostile() { return this.world.mobs.filter(m => m.t.hostile && !m.dead).length; }
  countPassive() { return this.world.mobs.filter(m => !m.t.hostile && !m.dead).length; }
  trySpawnHostile(player) {
    if (MC.difficulty === 0 || MC.player.creative) return;
    if (this.countHostile() >= 20) return;
    const dim = this.world.dimConfig;
    const isNight = !dim.hasSun || !this.world.isDay();
    const tries = isNight ? 14 : 4;
    for (let i = 0; i < tries; i++) {
      const p = this.randomSpawnPos(player, 22, 46);
      if (!p) continue;
      const light = Math.max(
        this.world.getSkyLight(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z)) * (this.world.isDay() && dim.hasSun ? 1 : 0.25),
        this.world.getBlockLight(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z)));
      if (light > 6) continue;
      const table = dim.hostile && dim.hostile.length ? dim.hostile : ['zombie', 'skeleton'];
      const type = table[randInt(table.length)];
      const chance = dim.hasSun ? (isNight ? 0.5 : 0.18) : 0.75;
      if (Math.random() > chance) continue;
      const mob = new Mob(this.world, type, p.x, p.y, p.z);
      this.world.mobs.push(mob);
      return;
    }
  }
  trySpawnPassive(player) {
    if (this.countPassive() >= 22) return;
    const table = this.world.dimConfig.passive || [];
    if (!table.length) return;
    for (let i = 0; i < 6; i++) {
      const p = this.randomSpawnPos(player, 14, 38);
      if (!p) continue;
      const below = this.world.getBlockDef(Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z));
      if (below.id !== B.grass_block && below.id !== B.snow_grass) continue;
      const light = this.world.getSkyLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
      if (light < 7) continue;
      const type = choice(table);
      // 成群
      const n = 1 + randInt(3);
      for (let k = 0; k < n; k++) {
        const mob = new Mob(this.world, type, p.x + (Math.random() - 0.5) * 3, p.y, p.z + (Math.random() - 0.5) * 3);
        this.world.mobs.push(mob);
      }
      return;
    }
  }
  /* 玩家攻击：射线检测生物 */
  raycastMob(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = null, bestT = maxDist;
    for (const m of this.world.mobs) {
      if (m.dead) continue;
      const b = m.box;
      const t = rayBox(ox, oy, oz, dx, dy, dz, b);
      if (t !== null && t < bestT) { bestT = t; best = m; }
    }
    for (const c of this.world.crystals) {
      if (c.dead) continue;
      const b = new Box(c.x - 0.7, c.y - 0.4, c.z - 0.7, c.x + 0.7, c.y + 1.1, c.z + 0.7);
      const t = rayBox(ox, oy, oz, dx, dy, dz, b);
      if (t !== null && t < bestT) { bestT = t; best = c; }
    }
    return best ? { mob: best, dist: bestT } : null;
  }
}

function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = 1e9;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  const lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) { if (o[i] < lo[i] || o[i] > hi[i]) return null; continue; }
    let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
