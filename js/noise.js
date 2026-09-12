/* ============================================================
   程序化噪声（Perlin 2D/3D + 分形叠加），用于地形、洞穴、矿脉、天气
   ============================================================ */
class Noise {
  constructor(seed) {
    const rng = makeRng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { this.perm[i] = p[i & 255]; }
  }
  static fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  static grad2(hash, x, y) {
    switch (hash & 3) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; default: return -x - y;
    }
  }
  static grad3(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  // 输出大致 -1..1
  perlin2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = Noise.fade(xf), v = Noise.fade(yf);
    const p = this.perm;
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const x1 = lerp(Noise.grad2(aa, xf, yf), Noise.grad2(ba, xf - 1, yf), u);
    const x2 = lerp(Noise.grad2(ab, xf, yf - 1), Noise.grad2(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  }
  perlin3(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y), zf = z - Math.floor(z);
    const u = Noise.fade(xf), v = Noise.fade(yf), w = Noise.fade(zf);
    const p = this.perm;
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    const x1 = lerp(Noise.grad3(p[AA], xf, yf, zf), Noise.grad3(p[BA], xf - 1, yf, zf), u);
    const x2 = lerp(Noise.grad3(p[AB], xf, yf - 1, zf), Noise.grad3(p[BB], xf - 1, yf - 1, zf), u);
    const y1 = lerp(x1, x2, v);
    const x3 = lerp(Noise.grad3(p[AA + 1], xf, yf, zf - 1), Noise.grad3(p[BA + 1], xf - 1, yf, zf - 1), u);
    const x4 = lerp(Noise.grad3(p[AB + 1], xf, yf - 1, zf - 1), Noise.grad3(p[BB + 1], xf - 1, yf - 1, zf - 1), u);
    const y2 = lerp(x3, x4, v);
    return lerp(y1, y2, w);
  }
  fbm2(x, y, oct = 4, lac = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += amp * this.perlin2(x * freq, y * freq); norm += amp; amp *= gain; freq *= lac; }
    return sum / norm;
  }
  fbm3(x, y, z, oct = 3, lac = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += amp * this.perlin3(x * freq, y * freq, z * freq); norm += amp; amp *= gain; freq *= lac; }
    return sum / norm;
  }
}
