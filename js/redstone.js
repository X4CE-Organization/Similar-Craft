/* ============================================================
   红石：拉杆/按钮/压力板 → 红石线（信号衰减）→ 红石灯/活塞/TNT/中继器
   ============================================================ */

class Redstone {
  constructor(world) {
    this.world = world;
    this.dirty = new Set();
    this.timer = 0;
    this.pending = [];
    this.updates = 0;
  }
  markDirty(x, y, z) { this.dirty.add(posKey(x, y, z)); }
  markDirtyAll() { this.dirty.add('*'); }

  isDust(id) { return id === B.redstone_dust; }
  isSourceBlock(id) { return id === B.lever || id === B.stone_button || id === B.pressure_plate; }

  onPlaced(x, y, z, blockId) {
    if (blockId === B.redstone_dust) this.world.setState(x, y, z, { power: 0 });
    if (blockId === B.lever) this.world.setState(x, y, z, { on: false });
    if (blockId === B.stone_button) this.world.setState(x, y, z, { on: false, timer: 0 });
    if (blockId === B.pressure_plate) this.world.setState(x, y, z, { on: false });
    if (blockId === B.repeater) this.world.setState(x, y, z, { powered: false, timer: 0 });
    if (blockId === B.redstone_lamp) this.world.setState(x, y, z, { lit: false });
    if (blockId === B.piston) {
      const dir = MC.player ? dirFromYaw(MC.player.yaw) : [0, 0, -1];
      this.world.setState(x, y, z, { extended: false, dir });
    }
    this.markDirty(x, y, z);
  }
  onRemoved(x, y, z, blockId) {
    if (blockId === B.piston) {
      const st = this.world.getState(x, y, z);
      if (st && st.extended) {
        const [dx, dy, dz] = st.dir;
        const fx = x + dx, fy = y + dy, fz = z + dz;
        if (this.world.getBlock(fx, fy, fz) === B.piston_head) this.world.setBlock(fx, fy, fz, 0, { noSupport: true });
      }
    }
    this.markDirty(x, y, z);
  }
  interact(x, y, z, def) {
    const st = this.world.getState(x, y, z) || {};
    if (def.id === B.lever) {
      st.on = !st.on;
      this.world.setState(x, y, z, st);
      MC.sound.play(st.on ? 'lever_on' : 'lever_off', x + 0.5, y + 0.5, z + 0.5);
    } else if (def.id === B.stone_button) {
      st.on = true; st.timer = 1.2;
      this.world.setState(x, y, z, st);
      MC.sound.play('button', x + 0.5, y + 0.5, z + 0.5);
    } else if (def.id === B.repeater) {
      st.delay = ((st.delay || 1) % 4) + 1;
      this.world.setState(x, y, z, st);
      MC.ui.toast('中继器延迟：' + st.delay + ' 刻', 'info');
    }
    this.markDirty(x, y, z);
    this.runNow(x, y, z);
  }

  tick(dt) {
    // 按钮计时
    for (const [k, st] of this.world.states) {
      if (st.timer > 0) {
        st.timer -= dt;
        if (st.timer <= 0 && st.on) { st.on = false; const [x, y, z] = parsePosKey(k); this.markDirty(x, y, z); }
      }
    }
    // 压力板检测
    if (MC.player && MC.player.alive) {
      const px = Math.floor(MC.player.pos.x), pz = Math.floor(MC.player.pos.z);
      for (let x = px - 1; x <= px + 1; x++) for (let z = pz - 1; z <= pz + 1; z++) {
        for (let y = Math.floor(MC.player.pos.y) - 1; y <= Math.floor(MC.player.pos.y) + 1; y++) {
          if (this.world.getBlock(x, y, z) !== B.pressure_plate) continue;
          const st = this.world.getState(x, y, z) || {};
          const pressed = Math.abs(MC.player.pos.x - (x + 0.5)) < 0.8 && Math.abs(MC.player.pos.z - (z + 0.5)) < 0.8 && Math.abs(MC.player.pos.y - (y + 0.06)) < 0.3;
          if (pressed !== !!st.on) { st.on = pressed; this.world.setState(x, y, z, st); this.markDirty(x, y, z); this.runNow(x, y, z); }
        }
      }
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.12;
    if (!this.dirty.size) return;
    const jobs = [];
    this.dirty.forEach(k => {
      if (k === '*') jobs.push(null); else jobs.push(parsePosKey(k));
    });
    this.dirty.clear();
    for (const j of jobs.slice(0, 3)) {
      if (!j) { if (MC.player) this.updateRegion(Math.floor(MC.player.pos.x), Math.floor(MC.player.pos.y), Math.floor(MC.player.pos.z), 20); }
      else this.updateRegion(j[0], j[1], j[2], 14);
    }
  }
  runNow(x, y, z) { this.updateRegion(x, y, z, 14); }

  /* 计算区域内红石网络 */
  updateRegion(cx, cy, cz, r) {
    const w = this.world;
    const dust = new Map();        // key -> power
    const components = [];         // {x,y,z,id,state}
    const sources = [];
    const x0 = cx - r, x1 = cx + r, y0 = Math.max(0, cy - r), y1 = Math.min(WORLD_H - 1, cy + r), z0 = cz - r, z1 = cz + r;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) {
      const id = w.getBlock(x, y, z);
      if (id === 0) continue;
      if (id === B.redstone_dust) { dust.set(posKey(x, y, z), 0); }
      else if (this.isSourceBlock(id) || id === B.repeater || id === B.redstone_lamp || id === B.piston || id === B.tnt) {
        components.push({ x, y, z, id, st: w.getState(x, y, z) || {} });
      }
    }
    // 电源
    const pushPower = (x, y, z, power) => sources.push({ x, y, z, power });
    for (const c of components) {
      if (c.id === B.lever && c.st.on) pushPower(c.x, c.y, c.z, 15);
      else if (c.id === B.stone_button && c.st.on) pushPower(c.x, c.y, c.z, 15);
      else if (c.id === B.pressure_plate && c.st.on) pushPower(c.x, c.y, c.z, 15);
      else if (c.id === B.repeater && c.st.powered) pushPower(c.x, c.y, c.z, 15);
    }
    // 中继器：读取相邻信号（不含自身），带延迟
    let repeaterChanged = false;
    const inputAt = (x, y, z, exclude) => {
      let best = 0;
      for (const d of DIRS) {
        const nx = x + d[0], ny = y + d[1], nz = z + d[2];
        if (exclude && nx === exclude.x && ny === exclude.y && nz === exclude.z) continue;
        const k = posKey(nx, ny, nz);
        if (dust.has(k)) best = Math.max(best, dust.get(k));
        const id = w.getBlock(nx, ny, nz);
        if (id === B.lever || id === B.stone_button || id === B.pressure_plate) {
          const st = w.getState(nx, ny, nz);
          if (st && st.on) best = Math.max(best, 15);
        }
        if (id === B.repeater) {
          const st = w.getState(nx, ny, nz);
          if (st && st.powered) best = Math.max(best, 15);
        }
      }
      return best;
    };
    for (const c of components) {
      if (c.id !== B.repeater) continue;
      const st = c.st;
      if (!st.on) continue;
      const input = inputAt(c.x, c.y, c.z, null);
      const delay = (st.delay || 1) * 0.2;
      if (input > 0) {
        st.timer = (st.timer || 0) + 0.2;
        if (st.timer >= delay && !st.powered) { st.powered = true; repeaterChanged = true; }
      } else {
        st.timer = Math.max(0, (st.timer || 0) - 0.2);
        if (st.powered && st.timer <= 0) { st.powered = false; repeaterChanged = true; }
      }
      w.setState(c.x, c.y, c.z, st);
    }
    if (repeaterChanged) {
      for (const c of components) if (c.id === B.repeater && c.st.powered) sources.push({ x: c.x, y: c.y, z: c.z, power: 15 });
    }
    // 洪泛：从电源沿红石线扩散
    const queue = [];
    for (const s of sources) {
      for (const d of DIRS) {
        const nx = s.x + d[0], ny = s.y + d[1], nz = s.z + d[2];
        const k = posKey(nx, ny, nz);
        if (dust.has(k) && dust.get(k) < s.power - 1) { dust.set(k, s.power - 1); queue.push([nx, ny, nz]); }
      }
    }
    let guard = 0;
    while (queue.length && guard++ < 20000) {
      const [x, y, z] = queue.shift();
      const p = dust.get(posKey(x, y, z));
      if (p <= 1) continue;
      for (const d of DIRS) {
        const nx = x + d[0], ny = y + d[1], nz = z + d[2];
        const k = posKey(nx, ny, nz);
        if (!dust.has(k)) continue;
        // 上下传播需要两侧支撑（简化：允许直接上下）
        if (dust.get(k) < p - 1) { dust.set(k, p - 1); queue.push([nx, ny, nz]); }
      }
    }
    // 写回红石线状态
    let changed = false;
    dust.forEach((power, k) => {
      const [x, y, z] = parsePosKey(k);
      const st = w.getState(x, y, z) || {};
      if ((st.power | 0) !== power) {
        st.power = power;
        w.setState(x, y, z, st);
        w.light.markDirtyAt(x, y, z);
        changed = true;
      }
    });
    // 计算元件输入
    const powerAt = (x, y, z) => {
      let best = 0;
      for (const d of DIRS) {
        const nx = x + d[0], ny = y + d[1], nz = z + d[2];
        const k = posKey(nx, ny, nz);
        if (dust.has(k)) best = Math.max(best, dust.get(k));
        const id = w.getBlock(nx, ny, nz);
        if (id === B.lever || id === B.stone_button || id === B.pressure_plate) {
          const st = w.getState(nx, ny, nz); if (st && st.on) best = Math.max(best, 15);
        }
        if (id === B.repeater) { const st = w.getState(nx, ny, nz); if (st && st.powered) best = Math.max(best, 15); }
      }
      return best;
    };
    for (const c of components) {
      if (c.id === B.redstone_lamp) {
        const power = powerAt(c.x, c.y, c.z);
        const lit = power > 0;
        if (!!c.st.lit !== lit) {
          c.st.lit = lit;
          w.setState(c.x, c.y, c.z, c.st);
          w.light.requestRelight(c.x, c.y, c.z, 16);
          w.light.markDirtyAt(c.x, c.y, c.z);
          if (lit) MC.ui.unlock('redstone');
        }
      } else if (c.id === B.piston) {
        const power = powerAt(c.x, c.y, c.z);
        const shouldExtend = power > 0;
        if (shouldExtend && !c.st.extended) { this.extendPiston(c); }
        else if (!shouldExtend && c.st.extended) { this.retractPiston(c); }
      } else if (c.id === B.tnt) {
        const power = powerAt(c.x, c.y, c.z);
        if (power > 0) w.igniteTNT(c.x, c.y, c.z, 1.8);
      }
    }
    this.updates++;
  }
  extendPiston(c) {
    const w = this.world;
    const [dx, dy, dz] = c.st.dir;
    const fx = c.x + dx, fy = c.y + dy, fz = c.z + dz;
    const front = w.getBlockDef(fx, fy, fz);
    if (front.id !== 0 && !front.replaceable && front.shape !== 'cross' && front.shape !== 'flat') {
      // 尝试推动一格
      const bx = fx + dx, by = fy + dy, bz = fz + dz;
      const behind = w.getBlockDef(bx, by, bz);
      if (behind.id !== 0 && !behind.replaceable) return;   // 推不动
      if (front.blast > 300) return;
      w.setBlock(bx, by, bz, front.id, { noSupport: true });
    }
    w.setBlock(fx, fy, fz, B.piston_head, { noSupport: true });
    c.st.extended = true;
    w.setState(c.x, c.y, c.z, c.st);
    MC.sound.play('piston', c.x + 0.5, c.y + 0.5, c.z + 0.5);
  }
  retractPiston(c) {
    const w = this.world;
    const [dx, dy, dz] = c.st.dir;
    const fx = c.x + dx, fy = c.y + dy, fz = c.z + dz;
    if (w.getBlock(fx, fy, fz) === B.piston_head) w.setBlock(fx, fy, fz, 0, { noSupport: true });
    c.st.extended = false;
    w.setState(c.x, c.y, c.z, c.st);
    MC.sound.play('piston', c.x + 0.5, c.y + 0.5, c.z + 0.5);
  }
}

function dirFromYaw(yaw) {
  const x = -Math.sin(yaw), z = -Math.cos(yaw);
  if (Math.abs(x) > Math.abs(z)) return [x > 0 ? 1 : -1, 0, 0];
  return [0, 0, z > 0 ? 1 : -1];
}
