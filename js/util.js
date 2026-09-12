/* ============================================================
   方块世界 3D — 基础工具函数
   ============================================================ */

// ---- 启动错误日志（无头测试时也会写入 DOM，方便排查） ----
const BOOT = { errors: [], logs: [] };
function bootLog(msg, isError) {
  const el = document.getElementById('bootlog');
  const rec = (isError ? 'ERR ' : '') + msg;
  if (isError) BOOT.errors.push(msg); else BOOT.logs.push(msg);
  if (el) el.textContent += rec + '\n';
}
window.addEventListener('error', (e) => {
  bootLog((e.message || 'error') + ' @' + (e.filename || '?') + ':' + (e.lineno || 0), true);
});
window.addEventListener('unhandledrejection', (e) => {
  bootLog('unhandled rejection: ' + (e.reason && e.reason.message ? e.reason.message : e.reason), true);
});
const _origError = console.error.bind(console);
console.error = function (...args) { bootLog(args.map(String).join(' '), true); _origError(...args); };

// ---- 数学 ----
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// 世界尺寸常量
const CHUNK_W = 16;          // 区块水平尺寸
const WORLD_H = 96;          // 世界高度
const SEA_LEVEL = 40;        // 海平面
const MAX_LIGHT = 15;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const sign = Math.sign;
const TAU = Math.PI * 2;
function mod(a, b) { return ((a % b) + b) % b; }
function randInt(n) { return Math.floor(Math.random() * n); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = randInt(i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
function angLerp(a, b, t) { let d = mod(b - a + Math.PI, TAU) - Math.PI; return a + d * t; }

// ---- 字符串种子 ----
function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// 确定性随机数发生器（mulberry32）
function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 位置哈希（用于矿石/植被散布）
function hash3(x, y, z, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2246822519) ^ Math.imul(seed | 0, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---- AABB ----
class Box {
  constructor(x0, y0, z0, x1, y1, z1) { this.x0 = x0; this.y0 = y0; this.z0 = z0; this.x1 = x1; this.y1 = y1; this.z1 = z1; }
  static fromCenter(cx, cy, cz, w, h) { return new Box(cx - w / 2, cy, cz - w / 2, cx + w / 2, cy + h, cz + w / 2); }
  static block(x, y, z, sx = 1, sy = 1, sz = 1, ox = 0, oy = 0, oz = 0) {
    return new Box(x + ox, y + oy, z + oz, x + ox + sx, y + oy + sy, z + oz + sz);
  }
  intersects(o) { return this.x0 < o.x1 && this.x1 > o.x0 && this.y0 < o.y1 && this.y1 > o.y0 && this.z0 < o.z1 && this.z1 > o.z0; }
  contains(x, y, z) { return x >= this.x0 && x < this.x1 && y >= this.y0 && y < this.y1 && z >= this.z0 && z < this.z1; }
}

// 简易射线-DDA：遍历体素
function raycastVoxel(ox, oy, oz, dx, dy, dz, maxDist, isBlocking) {
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);
  let tMaxX = dx === 0 ? Infinity : ((dx > 0 ? x + 1 - ox : ox - x) / Math.abs(dx));
  let tMaxY = dy === 0 ? Infinity : ((dy > 0 ? y + 1 - oy : oy - y) / Math.abs(dy));
  let tMaxZ = dz === 0 ? Infinity : ((dz > 0 ? z + 1 - oz : oz - z) / Math.abs(dz));
  let face = [0, 0, 0];
  let t = 0;
  if (isBlocking(x, y, z)) return { hit: true, x, y, z, face, nx: 0, ny: 0, nz: 0, dist: 0 };
  let guard = 0;
  while (t <= maxDist && guard++ < 512) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; face = [-stepX, 0, 0]; }
    else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; face = [0, -stepY, 0]; }
    else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ]; }
    if (t > maxDist) break;
    if (isBlocking(x, y, z)) return { hit: true, x, y, z, face, nx: face[0], ny: face[1], nz: face[2], dist: t };
  }
  return { hit: false, dist: maxDist };
}

// 颜色工具
function rgbHex(r, g, b) { return '#' + ((1 << 24) + (Math.round(clamp(r, 0, 255)) << 16) + (Math.round(clamp(g, 0, 255)) << 8) + Math.round(clamp(b, 0, 255))).toString(16).slice(1); }
function hexRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex, amount) { const [r, g, b] = hexRgb(hex); return rgbHex(r * amount, g * amount, b * amount); }
function mixHex(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return rgbHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }

// 序号化数组（去重收集）
class KeySet {
  constructor() { this.map = new Map(); }
  add(k) { this.map.set(k, 1); }
  has(k) { return this.map.has(k); }
  delete(k) { this.map.delete(k); }
  get size() { return this.map.size; }
  clear() { this.map.clear(); }
  forEach(fn) { this.map.forEach((v, k) => fn(k)); }
  values() { return this.map.keys(); }
}

function posKey(x, y, z) { return x + ',' + y + ',' + z; }
function chunkKey(cx, cz) { return cx + ',' + cz; }
function parsePosKey(k) { const p = k.split(','); return [+p[0], +p[1], +p[2]]; }
function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}
