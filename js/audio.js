/* ============================================================
   音效：全部用 WebAudio 实时合成（无外部素材）
   ============================================================ */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.enabled = true;
    this.musicTimer = 20 + Math.random() * 40;
  }
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = (MC.settings && MC.settings.volume !== undefined ? MC.settings.volume : 0.7);
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.0;
      this.musicGain.connect(this.master);
    } catch (e) { bootLog('音频初始化失败: ' + e.message, true); }
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(v) { if (this.master) this.master.gain.value = v; }

  pan(x, y, z) {
    if (!MC.player) return { vol: 1, pan: 0 };
    const p = MC.player;
    const dx = x - p.pos.x, dz = z - p.pos.z;
    const dist = Math.hypot(dx, dz, y - p.pos.y) || 1;
    const right = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
    const pan = clamp((dx * right.x + dz * right.z) / 6, -1, 1);
    const vol = clamp(1 - dist / 26, 0, 1);
    return { vol, pan };
  }

  /* ---------- 基础合成 ---------- */
  tone(freq, dur, opts = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime((opts.vol || 0.2), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (opts.pan !== undefined && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = opts.pan;
      g.connect(panner); panner.connect(this.master);
    } else g.connect(this.master);
    osc.connect(g);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  noise(dur, opts = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    if (opts.tonal) {
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.6 + Math.sin(i / opts.tonal * TAU) * 0.4;
    } else for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = opts.filter || 'bandpass';
    filt.frequency.setValueAtTime(opts.freq || 800, t);
    if (opts.freqTo) filt.frequency.exponentialRampToValueAtTime(Math.max(60, opts.freqTo), t + dur);
    filt.Q.value = opts.q === undefined ? 1.2 : opts.q;
    const g = this.ctx.createGain();
    const vol = opts.vol === undefined ? 0.3 : opts.vol;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (opts.pan !== undefined && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = opts.pan;
      g.connect(panner); panner.connect(this.master);
    } else g.connect(this.master);
    src.connect(filt); filt.connect(g);
    src.start(t); src.stop(t + dur + 0.02);
  }

  /* ---------- 具体音效 ---------- */
  play(name, x, y, z, volScale = 1) {
    if (!this.ctx) return;
    const pos = (x !== undefined) ? this.pan(x, y, z) : { vol: 1, pan: 0 };
    const vol = pos.vol * volScale;
    if (vol <= 0.01) return;
    const pan = pos.pan;
    const v = (k) => k * vol;
    switch (name) {
      case 'dig_stone': case 'dig_metal': this.noise(0.09, { freq: 1400, vol: v(0.25), pan, q: 1.6 }); break;
      case 'dig_wood': this.noise(0.1, { freq: 700, vol: v(0.28), pan, tonal: 90 }); break;
      case 'dig_grass': this.noise(0.12, { freq: 2200, vol: v(0.2), pan, filter: 'highpass' }); break;
      case 'dig_sand': case 'dig_gravel': this.noise(0.14, { freq: 1000, vol: v(0.22), pan }); break;
      case 'dig_glass': this.tone(1900, 0.08, { type: 'triangle', vol: v(0.18), to: 2600, pan }); break;
      case 'dig_wool': this.noise(0.12, { freq: 500, vol: v(0.16), pan, filter: 'lowpass' }); break;
      case 'dig_snow': this.noise(0.13, { freq: 3000, vol: v(0.16), pan, filter: 'highpass' }); break;
      case 'dig_water': this.noise(0.2, { freq: 700, vol: v(0.2), pan, freqTo: 300 }); break;
      case 'dig_lava': this.noise(0.35, { freq: 300, vol: v(0.24), pan, filter: 'lowpass', tonal: 60 }); break;
      case 'break_stone': case 'break_metal': this.noise(0.22, { freq: 900, vol: v(0.35), pan, q: 0.8 }); break;
      case 'break_wood': this.noise(0.24, { freq: 600, vol: v(0.35), pan, tonal: 80 }); break;
      case 'break_grass': this.noise(0.22, { freq: 1800, vol: v(0.3), pan, filter: 'highpass' }); break;
      case 'break_glass': this.noise(0.3, { freq: 2600, vol: v(0.32), pan, filter: 'highpass' }); this.tone(2400, 0.2, { vol: v(0.1), to: 1200, pan }); break;
      case 'break_wool': case 'break_snow': case 'break_gravel': case 'break_sand':
        this.noise(0.22, { freq: 900, vol: v(0.28), pan }); break;
      case 'step_stone': case 'step_metal': this.noise(0.07, { freq: 900, vol: v(0.14), pan, q: 2 }); break;
      case 'step_grass': this.noise(0.07, { freq: 2200, vol: v(0.1), pan, filter: 'highpass' }); break;
      case 'step_wood': this.noise(0.07, { freq: 600, vol: v(0.12), pan, tonal: 80 }); break;
      case 'step_sand': case 'step_gravel': this.noise(0.07, { freq: 1100, vol: v(0.1), pan }); break;
      case 'step_wool': case 'step_snow': this.noise(0.07, { freq: 500, vol: v(0.08), pan, filter: 'lowpass' }); break;
      case 'place_stone': case 'place_metal': this.tone(240, 0.09, { type: 'square', vol: v(0.16), to: 180, pan }); break;
      case 'place_wood': this.tone(320, 0.1, { vol: v(0.16), to: 220, pan }); break;
      case 'place_grass': case 'place_wool': case 'place_snow': this.noise(0.1, { freq: 1400, vol: v(0.14), pan }); break;
      case 'place_glass': this.tone(1400, 0.08, { type: 'triangle', vol: v(0.14), to: 1800, pan }); break;
      case 'place_sand': case 'place_gravel': this.noise(0.12, { freq: 900, vol: v(0.16), pan }); break;
      case 'place_water': case 'splash': this.noise(0.35, { freq: 900, vol: v(0.28), pan, freqTo: 300 }); break;
      case 'place_lava': this.noise(0.5, { freq: 400, vol: v(0.3), pan, filter: 'lowpass' }); break;
      case 'hurt': this.tone(220, 0.22, { type: 'sawtooth', vol: v(0.28), to: 90, pan }); break;
      case 'hurt_mob': this.tone(360, 0.18, { type: 'sawtooth', vol: v(0.22), to: 200, pan }); break;
      case 'skeleton_hurt': this.noise(0.14, { freq: 1500, vol: v(0.2), pan, filter: 'highpass' }); break;
      case 'hit_mob': this.noise(0.08, { freq: 700, vol: v(0.25), pan, tonal: 120 }); break;
      case 'death_mob': this.tone(300, 0.4, { type: 'sawtooth', vol: v(0.25), to: 80, pan }); break;
      case 'die': this.tone(300, 0.9, { type: 'sawtooth', vol: v(0.3), to: 60 }); break;
      case 'explode': this.noise(1.1, { freq: 400, vol: v(0.6), pan, filter: 'lowpass', freqTo: 60 }); this.tone(90, 0.7, { type: 'sawtooth', vol: v(0.3), to: 30 }); break;
      case 'fuse': this.noise(0.5, { freq: 4000, vol: v(0.12), pan, filter: 'highpass' }); break;
      case 'pop': this.tone(700, 0.08, { type: 'sine', vol: v(0.18), to: 1200, pan }); break;
      case 'levelup': this.tone(600, 0.15, { vol: v(0.2), to: 900 }); setTimeout(() => this.tone(900, 0.2, { vol: v(0.2), to: 1300 }), 110); break;
      case 'eat': this.noise(0.16, { freq: 600, vol: v(0.2), pan, tonal: 100 }); break;
      case 'bow': this.noise(0.16, { freq: 1800, vol: v(0.2), pan, filter: 'highpass' }); break;
      case 'arrow_hit': this.tone(500, 0.1, { vol: v(0.2), to: 200, pan }); break;
      case 'lever_on': this.tone(500, 0.09, { vol: v(0.22), to: 800 }); break;
      case 'lever_off': this.tone(700, 0.09, { vol: v(0.22), to: 420 }); break;
      case 'button': this.tone(900, 0.06, { vol: v(0.2), to: 600 }); break;
      case 'piston': this.noise(0.2, { freq: 500, vol: v(0.26), pan, filter: 'lowpass' }); break;
      case 'furnace': this.noise(0.6, { freq: 260, vol: v(0.1), pan, filter: 'lowpass', tonal: 40 }); break;
      case 'thunder': this.noise(1.6, { freq: 300, vol: v(0.5), filter: 'lowpass', freqTo: 50 }); break;
      case 'sleep': this.tone(400, 0.5, { type: 'sine', vol: v(0.15), to: 200 }); break;
      case 'craft': this.tone(600, 0.08, { vol: v(0.2) }); setTimeout(() => this.tone(900, 0.1, { vol: v(0.18) }), 80); break;
      case 'click': this.tone(1200, 0.04, { vol: v(0.12), type: 'sine' }); break;
      case 'break_item': this.noise(0.25, { freq: 1200, vol: v(0.28), filter: 'highpass' }); break;
      case 'fall': this.noise(0.2, { freq: 400, vol: v(0.24), pan }); break;
      case 'enchant': this.tone(500, 0.6, { type: 'sine', vol: v(0.2), to: 1400 }); break;
      default: break;
    }
  }

  /* ---------- 环境音乐（极简生成式） ---------- */
  tickMusic(dt) {
    if (!this.ctx || !MC.settings.music) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 45 + Math.random() * 90;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const base = 220 * Math.pow(2, randInt(2));
    const notes = 8 + randInt(8);
    const t0 = this.ctx.currentTime + 0.1;
    for (let i = 0; i < notes; i++) {
      const f = base * Math.pow(2, scale[randInt(scale.length)] / 12);
      const dur = 1.6 + Math.random() * 1.4;
      const t = t0 + i * (0.5 + Math.random() * 0.7);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = Math.random() < 0.5 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      osc.connect(g); g.connect(this.musicGain);
      osc.start(t); osc.stop(t + dur + 0.1);
    }
  }
}
