/* ============================================================
   UI：HUD、背包/工作台/熔炉/箱子/附魔界面、提示、聊天指令、小地图
   ============================================================ */

const QUESTS = [
  { id: 'q_wood', cn: '砍一棵树，获得原木', done: () => MC.ach.wood },
  { id: 'q_table', cn: '合成一个工作台', done: () => MC.ach.table },
  { id: 'q_pick', cn: '合成一把木镐', done: () => MC.ach.pick },
  { id: 'q_stone', cn: '挖到圆石', done: () => MC.ach.stone },
  { id: 'q_iron', cn: '熔炼出铁锭', done: () => MC.ach.ironIngot },
  { id: 'q_ironpick', cn: '合成铁镐', done: () => MC.ach.ironPick },
  { id: 'q_zombie', cn: '击杀一只僵尸', done: () => MC.ach.killedZombie > 0 },
  { id: 'q_farm', cn: '种下并收获小麦', done: () => MC.ach.farm },
  { id: 'q_light', cn: '用红石点亮红石灯', done: () => MC.ach.got.has('redstone') },
  { id: 'q_enchant', cn: '给装备附魔', done: () => MC.ach.got.has('enchant') },
];

class UI {
  constructor(game) {
    this.game = game;
    this.screenOpen = false;
    this.openKind = null;
    this.minimapSize = 160;
    this.miniTimer = 0;
    this.toastQueue = [];
    this.chatTimer = 0;
    this.shakeAmount = 0;
    this.highlight = null;
    this.breakProgress = 0;
    this.questCache = '';
    this.questsHidden = false;
    this.questSeenAt = performance.now();
    this.slotEls = [];
    this.el = {};
  }
  init() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'), hotbar: $('hotbar'), health: $('healthBar'), hunger: $('hungerBar'), armor: $('armorBar'), air: $('airBar'),
      xpFill: $('xpFill'), xpLevel: $('xpLevel'), itemName: $('itemName'), debug: $('debug'), toasts: $('toasts'),
      questPanel: $('questPanel'), screenWrap: $('screenWrap'), screenBody: $('screenBody'), screenTitle: $('screenTitle'),
      screenHint: $('screenHint'), cursorItem: $('cursorItem'), mini: $('miniCv'), breakArc: $('breakArc'), breakRing: $('breakRing'),
      achBar: $('achievementBar'), achTitle: $('achTitle'), achDesc: $('achDesc'), achIcon: $('achIcon'),
      chatLog: $('chatLog'), chatInput: $('chatInput'), death: $('death'), deathMsg: $('deathMsg'),
    };
    this.buildHotbar();
    this.buildSettings();
    this.buildAchievements();
    this.buildTooltip();
    // 受伤红屏
    this.flash = document.createElement('div');
    Object.assign(this.flash.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '15', opacity: '0', transition: 'opacity .35s', background: 'radial-gradient(circle, rgba(255,0,0,0) 40%, rgba(255,0,0,.55) 100%)' });
    document.body.appendChild(this.flash);
    document.addEventListener('mousemove', (e) => { this.mouse = { x: e.clientX, y: e.clientY }; this.moveCursorItem(); });
    this.el.chatInput.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') { const v = this.el.chatInput.value.trim(); if (v) MC.commands.exec(v); this.el.chatInput.value = ''; this.closeChat(); }
      if (e.code === 'Escape') { this.el.chatInput.value = ''; this.closeChat(); }
      e.stopPropagation();
    });
    this.initVirtualCursor();
    this.updateStats();
    this.renderQuests();
  }
  iconEl(stack, size = 44) {
    const def = stackDef(stack);
    return MC.icons.el({ id: stack.id, def, meta: stack.meta }, size);
  }
  /* ================= HUD ================= */
  buildHotbar() {
    this.el.hotbar.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      d.dataset.i = i;
      this.el.hotbar.appendChild(d);
    }
    this.updateHotbar();
  }
  updateHotbar() {
    const inv = MC.player.inv;
    for (let i = 0; i < 9; i++) {
      const d = this.el.hotbar.children[i];
      const s = inv.hotbar.get(i);
      d.className = 'slot' + (i === inv.selected ? ' sel' : '');
      d.innerHTML = '';
      if (s) {
        d.appendChild(this.iconEl(s, 44));
        if (s.count > 1) { const c = document.createElement('span'); c.className = 'cnt'; c.textContent = s.count; d.appendChild(c); }
        const def = stackDef(s);
        if (def.durability && s.meta && s.meta.dur !== undefined && s.meta.dur < def.durability) {
          const bar = document.createElement('div'); bar.className = 'dur';
          const i2 = document.createElement('i');
          const f = s.meta.dur / def.durability;
          i2.style.width = (f * 100) + '%';
          i2.style.background = f > 0.5 ? '#5bd25b' : f > 0.2 ? '#e0c060' : '#e05a4a';
          bar.appendChild(i2); d.appendChild(bar);
        }
      }
    }
    if (this.el.itemName && this.el.itemName.style.opacity === '1') this.placeItemName();
  }
  heldName(slotChanged) {
    const s = MC.player.inv.held;
    const el = this.el.itemName;
    el.classList.remove('hidden');                 // 防止被 display:none 吃掉（之前就是这里不显示）
    if (!s) { el.style.opacity = 0; el.innerHTML = ''; return; }
    const def = stackDef(s);
    const en = enchantName(s);
    const dur = (s.meta && s.meta.dur !== undefined && def.durability && s.meta.dur < def.durability)
      ? '<span class="nm-dur">' + s.meta.dur + '/' + def.durability + '</span>' : '';
    // 小标签：中文名 + 英文名（含附魔） + 耐久，贴在「对应那一格」的上方
    el.innerHTML = '<span class="nm">' + def.cn + '</span>' +
      '<span class="nm-en">' + (def.en || s.id) + (en ? ' · ' + en : '') + '</span>' + dur;
    this.placeItemName();
    el.style.opacity = 1;
    if (slotChanged) this._nameShownAt = performance.now();
    clearTimeout(this._nameTimer);
    // 切换物品时显示 2 秒（像原版），其他情况 1.2 秒
    this._nameTimer = setTimeout(() => { el.style.opacity = 0; }, slotChanged ? 2000 : 1200);
  }
  /* 把物品名小标签摆到「当前选中的那一格」正上方 */
  placeItemName() {
    const el = this.el.itemName;
    if (!el || !this.el.hotbar) return;
    const slot = this.el.hotbar.children[MC.player.inv.selected] || this.el.hotbar.children[0];
    if (!slot) return;
    const r = slot.getBoundingClientRect();
    const w = el.offsetWidth || 70, h = el.offsetHeight || 18;
    const left = Math.min(Math.max(r.left + r.width / 2, w / 2 + 4), window.innerWidth - w / 2 - 4);
    el.style.left = left + 'px';
    el.style.top = Math.max(4, r.top - h - 7) + 'px';
  }
  barIcons(el, count, max, glyph, cls) {
    if (!el) return;
    if (el.childElementCount !== max) {
      el.innerHTML = '';
      for (let i = 0; i < max; i++) {
        const c = document.createElement('canvas');
        c.width = 20; c.height = 20; c.className = 'icon';
        el.appendChild(c);
      }
    }
    const full = Math.ceil(count / 2);
    for (let i = 0; i < max; i++) {
      const cv = el.children[i];
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, 20, 20);
      const isFull = i < Math.floor(count / 2) || (i === Math.floor(count / 2) && count % 2 === 1);
      const empty = i >= full;
      drawGlyph(ctx, glyph, 20, empty ? 0.28 : 1, cls, count % 2 === 1 && i === Math.floor(count / 2));
    }
  }
  updateStats() {
    const p = MC.player;
    this.barIcons(this.el.health, Math.ceil(p.health), 10, 'heart');
    this.barIcons(this.el.hunger, Math.ceil((p.hunger || 0) * 2), 10, 'food');
    this.barIcons(this.el.armor, p.inv.defense(), 10, 'armor');
    this.el.armor.style.visibility = p.inv.defense() > 0 ? 'visible' : 'hidden';
    const airBubbles = p.air < 300 ? Math.ceil(p.air / 30) : 0;
    this.barIcons(this.el.air, airBubbles, 10, 'bubble');
    this.el.air.style.visibility = airBubbles > 0 ? 'visible' : 'hidden';
    const need = p.xpNeeded();
    this.el.xpFill.style.width = clamp(p.xp / need * 100, 0, 100) + '%';
    this.el.xpLevel.textContent = p.level > 0 ? p.level : '';
  }
  setBreakProgress(p) {
    p = clamp(p, 0, 1);
    if (Math.abs(p - this.breakProgress) < 0.01) return;
    this.breakProgress = p;
    this.el.breakRing.style.opacity = p > 0.02 ? 1 : 0;
    this.el.breakArc.style.strokeDashoffset = String(100.5 * (1 - p));
  }
  setHighlight(hit) { this.highlight = hit; }
  damageFlash() { this.flash.style.opacity = '0.85'; clearTimeout(this._flashT); this._flashT = setTimeout(() => { this.flash.style.opacity = '0'; }, 120); }
  shake(a) { this.shakeAmount = Math.max(this.shakeAmount, a); }

  toast(msg, type = 'info') {
    const d = document.createElement('div');
    d.className = 'toast ' + type;
    d.textContent = msg;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.remove(), 4200);
  }
  /* 消息流程：正常显示 → 保持 9 秒 → 淡出 1 秒 → 消失（打开聊天框时不淡出） */
  chat(msg, cls) {
    const wrap = this.el.chatLog;
    const d = document.createElement('div');
    d.className = 'line ' + (cls || '');
    d.innerHTML = msg;
    d.style.opacity = '1';
    d.style.transition = 'none';
    wrap.appendChild(d);
    while (wrap.childElementCount > 8) wrap.firstChild.remove();
    this.scheduleChatFade(d);
  }
  scheduleChatFade(d) {
    clearTimeout(d._hide);
    clearTimeout(d._remove);
    d.style.transition = 'none';
    d.style.opacity = '1';
    const hold = this.chatOpen() ? 60000 : 9000;    // 聊天框打开时一直保留
    d._hide = setTimeout(() => {
      if (this.chatOpen()) { this.scheduleChatFade(d); return; }
      d.style.transition = 'opacity 1s';
      d.style.opacity = '0';
      d._remove = setTimeout(() => d.remove(), 1100);
    }, hold);
  }
  /* 关闭聊天框时，把还留在屏幕上的消息重新计时 */
  refreshChatTimers() {
    for (const d of this.el.chatLog.children) this.scheduleChatFade(d);
  }
  /* 收起 / 展开新手目标面板 */
  toggleQuests(force) {
    this.questsHidden = (force === undefined) ? !this.questsHidden : !force;
    const p = this.el.questPanel;
    if (p) p.style.display = this.questsHidden ? 'none' : '';
    if (!this.questsHidden) this.questSeenAt = performance.now();
    if (this.screenOpen) { /* nothing */ }
    return !this.questsHidden;
  }
  openChat(prefix) {
    this.el.chatInput.classList.remove('hidden');
    this.el.chatInput.value = prefix || '';
    this.el.chatInput.focus();
    if (prefix) this.el.chatInput.setSelectionRange(prefix.length, prefix.length);
  }
  closeChat() { this.el.chatInput.classList.add('hidden'); this.el.chatInput.blur(); MC.player.keys = {}; this.refreshChatTimers(); }

  unlock(id) {
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (!a || MC.ach.got.has(id)) return;
    MC.ach.got.add(id);
    MC.sound.play('levelup');
    this.el.achTitle.textContent = '成就达成：' + a.cn;
    this.el.achDesc.textContent = a.desc;
    const ctx = this.el.achIcon.getContext('2d');
    ctx.clearRect(0, 0, 32, 32);
    ctx.font = '24px serif'; ctx.textAlign = 'center'; ctx.fillText(a.emoji, 16, 25);
    this.el.achBar.classList.remove('hidden');
    clearTimeout(this._achT);
    this._achT = setTimeout(() => this.el.achBar.classList.add('hidden'), 3600);
    this.buildAchievements();
    this.renderQuests();
    this.questSeenAt = performance.now();
  }
  onMine(id) {
    const def = BLOCKS[id];
    if (!def) return;
    if (id === B.oak_log || id === B.birch_log || id === B.spruce_log) this.unlock('wood');
    if (id === B.cobblestone) this.unlock('stone');
    if (id === B.diamond_ore) this.unlock('diamond');
  }
  onCraft(id) {
    if (id === 'crafting_table') this.unlock('table');
    if (id === 'wood_pickaxe' || id === 'stone_pickaxe') this.unlock('pick');
    if (id === 'diamond_pickaxe') this.unlock('diamond_pick');
    if (id === 'bread') this.unlock('bread');
    if (id === 'iron_pickaxe' || id === 'iron_axe' || id === 'iron_sword' || id === 'iron_shovel') MC.ach.ironPick = true, this.unlock('iron');
    if (id.endsWith('_helmet') || id.endsWith('_chestplate')) this.unlock('armor');
  }
  checkDay() { if (MC.world.dayCount >= 3) this.unlock('day3'); }

  /* ================= 虚拟光标（像原版：玩游戏时鼠标一直锁着，界面里用自绘光标） ================= */
  initVirtualCursor() {
    this.vcx = window.innerWidth / 2;
    this.vcy = window.innerHeight / 2;
    const el = document.createElement('div');
    el.id = 'vcursor';
    el.innerHTML = '<svg width="22" height="26" viewBox="0 0 20 24"><path d="M2 1 L2 19 L7 14.5 L10.5 22 L13.5 20.5 L10 13.5 L17 13 Z" fill="#ffffff" stroke="#000000" stroke-width="1.6"/></svg>';
    document.body.appendChild(el);
    this.vcursorEl = el;
    this.moveVirtualCursor(0, 0);
    const forward = (e) => {
      if (e._mcSynthetic) return;                 // 自己派发的事件不要再转发（否则会无限递归）
      if (!this.virtualCursorActive()) return;
      const target = document.elementFromPoint(this.vcx, this.vcy);
      if (!target || target === this.vcursorEl) return;
      e.preventDefault(); e.stopPropagation();
      const opts = { bubbles: true, cancelable: true, clientX: this.vcx, clientY: this.vcy, button: e.button || 0, buttons: e.buttons || 0, shiftKey: !!e.shiftKey, ctrlKey: !!e.ctrlKey, deltaY: e.deltaY || 0, deltaX: e.deltaX || 0 };
      const type = (e.type === 'wheel') ? 'wheel' : e.type;
      const ev = (type === 'wheel') ? new WheelEvent('wheel', opts) : new MouseEvent(type, opts);
      ev._mcSynthetic = true;
      target.dispatchEvent(ev);
      // 按钮/配方这类监听 click 的元素补一个 click
      if (e.type === 'mousedown') {
        const clk = new MouseEvent('click', opts);
        clk._mcSynthetic = true;
        target.dispatchEvent(clk);
      }
    };
    ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel'].forEach(t => document.addEventListener(t, forward, true));
  }
  virtualCursorActive() {
    // 只有在「有界面打开 + 鼠标是锁定状态」时才接管鼠标事件；
    // 正常游戏时绝对不能拦截，否则滚轮切换物品、点击挖掘都会失灵
    const locked = (MC.isMouseLocked && MC.isMouseLocked()) || MC.forceVirtualCursor === true;
    return MC.running && locked && MC.anyOverlayOpen();
  }
  moveVirtualCursor(dx, dy) {
    this.vcx = clamp(this.vcx + dx, 2, window.innerWidth - 3);
    this.vcy = clamp(this.vcy + dy, 2, window.innerHeight - 3);
    const el = this.vcursorEl;
    if (el) { el.style.left = this.vcx + 'px'; el.style.top = this.vcy + 'px'; }
    this.mouse = { x: this.vcx, y: this.vcy };
    this.moveCursorItem();
    const t = document.elementFromPoint(this.vcx, this.vcy);
    if (t !== this._hoverEl) {
      if (this._hoverEl && this._hoverEl.dispatchEvent) this._hoverEl.dispatchEvent(new MouseEvent('mouseleave'));
      if (t && t.dispatchEvent) {
        const o = { bubbles: false, clientX: this.vcx, clientY: this.vcy };
        t.dispatchEvent(new MouseEvent('mouseenter', o));
        t.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: this.vcx, clientY: this.vcy }));
      }
      this._hoverEl = t;
    }
  }
  centerVirtualCursor() { this.vcx = window.innerWidth / 2; this.vcy = window.innerHeight / 2; this.moveVirtualCursor(0, 0); }
  /* 每帧决定：玩游戏时隐藏系统光标并锁定；界面里显示虚拟光标 */
  updateCursorMode() {
    const wantVirtual = MC.running && MC.anyOverlayOpen && MC.anyOverlayOpen();
    if (wantVirtual !== this._vcVisible) { this._vcVisible = wantVirtual; if (this.vcursorEl) this.vcursorEl.style.display = wantVirtual ? 'block' : 'none'; if (wantVirtual) this.centerVirtualCursor(); }
    if (MC.running && !wantVirtual && MC.lockMouse) MC.lockMouse();
  }

  /* ================= 屏幕 ================= */
  openScreen(kind, data) {
    this.openKind = kind;
    this.screenData = data || {};
    this.screenOpen = true;
    this.el.screenWrap.classList.remove('hidden');
    this.centerVirtualCursor();
    this._vcVisible = true;
    if (this.vcursorEl) this.vcursorEl.style.display = 'block';
    this.renderScreen();
  }
  closeScreen(byEscape) {
    // 把合成栏物品还回背包
    const inv = MC.player.inv;
    for (let i = 0; i < 9; i++) {
      const s = inv.craft.get(i);
      if (s) { const left = inv.addItem(s.id, s.count, s.meta); if (left > 0) MC.world.spawnItem(MC.player.pos.x, MC.player.pos.y + 1, MC.player.pos.z, s.id, left, s.meta); inv.craft.set(i, null); }
    }
    if (inv.cursor) { const c = inv.cursor; const left = inv.addItem(c.id, c.count, c.meta); if (left > 0) MC.world.spawnItem(MC.player.pos.x, MC.player.pos.y + 1, MC.player.pos.z, c.id, left, c.meta); inv.cursor = null; }
    this.screenOpen = false;
    this.openKind = null;
    this.el.screenWrap.classList.add('hidden');
    this.el.cursorItem.classList.add('hidden');
    this.updateHotbar(); this.updateStats();
    this._vcVisible = false;
    if (this.vcursorEl) this.vcursorEl.style.display = 'none';
    // 鼠标本来就没松开过，这里只是兜底（比如刚进游戏还没锁上）
    if (MC.lockMouse) MC.lockMouse(true);
  }
  escPressed() {
    if (this.chatOpen()) { this.closeChat(); return; }
    if (this.screenOpen) { this.closeScreen(true); return; }   // Esc 关闭：交给下一次点击/按键锁定
    this.game.togglePause();
  }
  chatOpen() { return !this.el.chatInput.classList.contains('hidden'); }

  refreshOpenScreen() { if (this.screenOpen) this.renderScreen(); }

  renderScreen() {
    const b = this.el.screenBody;
    b.innerHTML = '';
    const kinds = { inventory: '背包', crafting: '工作台', furnace: '熔炉', chest: '箱子', shulker: this.screenData && this.screenData.label || '潜影盒', enchant: '附魔台', creative: '创造模式物品栏' };
    this.el.screenTitle.textContent = kinds[this.openKind] || '容器';
    this.el.screenHint.textContent = '左键取放 · 右键单个/分半 · Shift+左键快速移动';
    if (this.openKind === 'inventory') this.renderInventory(2);
    else if (this.openKind === 'crafting') this.renderInventory(3);
    else if (this.openKind === 'furnace') this.renderFurnace();
    else if (this.openKind === 'chest') this.renderChest();
    else if (this.openKind === 'shulker') this.renderShulker();
    else if (this.openKind === 'enchant') this.renderEnchant();
    else if (this.openKind === 'creative') this.renderCreative();
    this.updateCursorItem();
  }
  mkSlot(parent, size, get, set, opts = {}) {
    const d = document.createElement('div');
    d.className = 'slot' + (opts.cls ? ' ' + opts.cls : '');
    d.style.width = d.style.height = size + 'px';
    d.dataset.slot = '1';
    const render = () => {
      const s = get();
      d.innerHTML = '';
      if (s) {
        d.appendChild(this.iconEl(s, size - 8));
        if (s.count > 1) { const c = document.createElement('span'); c.className = 'cnt'; c.textContent = s.count; d.appendChild(c); }
      }
    };
    render();
    d.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (opts.readonly) {
        // 取出产物
        const s = get();
        if (!s) return;
        const cur = MC.player.inv.cursor;
        if (cur && !sameItem(cur, s)) return;
        const out = copyStack(s);
        if (cur) cur.count += out.count; else MC.player.inv.cursor = out;
        opts.onTake && opts.onTake();
        this.refreshOpenScreen();
        return;
      }
      if (opts.onClick) { opts.onClick(e); this.refreshOpenScreen(); return; }
      this.slotAction(get, set, e.button, e.shiftKey);
      this.refreshOpenScreen();
    });
    d.addEventListener('mouseenter', (e) => { const s = get(); if (s) this.showTooltip(s, e); });
    d.addEventListener('mousemove', (e) => this.moveTooltip(e));
    d.addEventListener('mouseleave', () => this.hideTooltip());
    parent.appendChild(d);
    return d;
  }
  slotAction(get, set, button, shift) {
    const inv = MC.player.inv;
    const cur = inv.cursor;
    const s = get();
    const refresh = () => { this.updateHotbar(); this.updateStats(); };
    if (shift && s) {
      // 快速移动
      const left = inv.addItem(s.id, s.count, s.meta);
      set(left > 0 ? makeStack(s.id, left, s.meta) : null);
      refresh(); return;
    }
    if (button === 0) {
      if (!cur) { inv.cursor = s ? copyStack(s) : null; set(null); }
      else if (!s) { set(copyStack(cur)); inv.cursor = null; }
      else if (sameItem(s, cur)) {
        const ms = maxStack(s.id);
        const add = Math.min(ms - s.count, cur.count);
        if (add > 0) { s.count += add; cur.count -= add; if (cur.count <= 0) inv.cursor = null; }
        else { set(copyStack(cur)); inv.cursor = s; }
      } else { set(copyStack(cur)); inv.cursor = s; }
    } else if (button === 2) {
      if (cur) {
        if (!s) { set(makeStack(cur.id, 1, cur.meta)); cur.count--; }
        else if (sameItem(s, cur) && s.count < maxStack(s.id)) { s.count++; cur.count--; }
        if (cur.count <= 0) inv.cursor = null;
      } else if (s) {
        const half = Math.ceil(s.count / 2);
        inv.cursor = makeStack(s.id, half, s.meta);
        s.count -= half;
        if (s.count <= 0) set(null);
      }
    }
    refresh();
  }
  renderInventory(craftSize) {
    const inv = MC.player.inv;
    const b = this.el.screenBody;
    const left = document.createElement('div'); left.className = 'col';
    // 装备格
    const armorRow = document.createElement('div'); armorRow.className = 'inv-cols';
    const at = document.createElement('div'); at.className = 'panel-title'; at.textContent = '装备'; armorRow.appendChild(at);
    const ag = document.createElement('div'); ag.className = 'grid two';
    for (let i = 0; i < 4; i++) this.mkSlot(ag, 52, () => inv.armor.get(i), (s) => inv.armor.set(i, s));
    armorRow.appendChild(ag);
    left.appendChild(armorRow);
    if (craftSize === 2) {
      const t = document.createElement('div'); t.className = 'panel-title'; t.textContent = '2×2 合成'; left.appendChild(t);
      const g = document.createElement('div'); g.className = 'grid two';
      for (let i = 0; i < 4; i++) {
        const r = Math.floor(i / 2), c = i % 2;
        this.mkSlot(g, 52, () => inv.craft.get(r * 3 + c), (s) => inv.craft.set(r * 3 + c, s));
      }
      left.appendChild(g);
    } else {
      const t = document.createElement('div'); t.className = 'panel-title'; t.textContent = '3×3 合成'; left.appendChild(t);
      const g = document.createElement('div'); g.className = 'grid three';
      for (let i = 0; i < 9; i++) this.mkSlot(g, 52, () => inv.craft.get(i), (s) => inv.craft.set(i, s));
      left.appendChild(g);
    }
    const arrow = document.createElement('div'); arrow.className = 'arrow'; arrow.textContent = '➜';
    const outGrid = document.createElement('div'); outGrid.className = 'grid two';
    const size = craftSize;
    const grid = recipeGridFor(inv, size);
    const recipe = matchRecipe(grid.slots, size);
    const outStack = recipe ? makeStack(recipe.out, recipe.count) : null;
    this.mkSlot(outGrid, 52, () => outStack, null, {
      readonly: true, cls: 'out',
      onTake: () => {
        if (!recipe) return;
        consumeGrid(inv.craft, 3);
        MC.ach.crafted[recipe.out] = true;
        MC.sound.play('craft');
        this.onCraft(recipe.out);
      },
    });
    const mid = document.createElement('div'); mid.className = 'col';
    const row = document.createElement('div'); row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '10px';
    row.appendChild(left); row.appendChild(arrow); row.appendChild(outGrid);
    mid.appendChild(row);
    // 背包主体
    const mt = document.createElement('div'); mt.className = 'panel-title'; mt.textContent = '背包'; mid.appendChild(mt);
    const mg = document.createElement('div'); mg.className = 'grid nine';
    for (let i = 0; i < 27; i++) this.mkSlot(mg, 52, () => inv.main.get(i), (s) => inv.main.set(i, s));
    mid.appendChild(mg);
    const ht = document.createElement('div'); ht.className = 'panel-title'; ht.textContent = '快捷栏'; mid.appendChild(ht);
    const hg = document.createElement('div'); hg.className = 'grid nine';
    for (let i = 0; i < 9; i++) this.mkSlot(hg, 52, () => inv.hotbar.get(i), (s) => inv.hotbar.set(i, s));
    mid.appendChild(hg);
    b.appendChild(mid);
    // 配方书
    const right = document.createElement('div'); right.className = 'col';
    const rt = document.createElement('div'); rt.className = 'panel-title'; rt.textContent = '配方书（点击一键合成）';
    right.appendChild(rt);
    const list = document.createElement('div'); list.className = 'recipe-list';
    const recipes = recipeListFor(inv, 3, false);
    if (!recipes.length) { const n = document.createElement('div'); n.className = 'emptynote'; n.textContent = '暂无配方'; list.appendChild(n); }
    for (const r of recipes) {
      const can = !!planCraft(inv, r);
      const d = document.createElement('div');
      d.className = 'recipe' + (can ? '' : ' locked');
      const st = makeStack(r.out, r.count);
      if (st) d.appendChild(this.iconEl(st, 38));
      if (r.count > 1) { const n = document.createElement('span'); n.className = 'n'; n.textContent = r.count; d.appendChild(n); }
      d.title = itemName(r.out);
      d.addEventListener('click', () => {
        if (!can) { this.toast('材料不足：' + itemName(r.out), 'bad'); return; }
        const made = craftFromInventory(inv, r, 1);
        if (made) { MC.sound.play('craft'); this.toast('合成：' + itemName(r.out), 'good'); }
        this.refreshOpenScreen();
      });
      d.addEventListener('mouseenter', (e) => this.showRecipeTooltip(r, e));
      d.addEventListener('mousemove', (e) => this.moveTooltip(e));
      d.addEventListener('mouseleave', () => this.hideTooltip());
      list.appendChild(d);
    }
    right.appendChild(list);
    const hint = document.createElement('div'); hint.className = 'hint';
    hint.textContent = '提示：把材料放进左侧格子也能手动合成（支持 2×2 与 3×3 摆放）。';
    right.appendChild(hint);
    b.appendChild(right);
  }
  renderFurnace() {
    const d = this.screenData;
    let st = MC.world.getState(d.x, d.y, d.z);
    if (!st) {
      st = { inv: [null, null, null], burn: 0, burnMax: 0, cook: 0 };
      MC.world.setState(d.x, d.y, d.z, st);
    }
    const inv = st.inv;
    const b = this.el.screenBody;
    const left = document.createElement('div'); left.className = 'col';
    const g = document.createElement('div'); g.className = 'grid two';
    this.mkSlot(g, 52, () => inv[0], (s) => inv[0] = s);
    this.mkSlot(g, 52, () => inv[1], (s) => inv[1] = s);
    const g2 = document.createElement('div'); g2.className = 'grid two';
    this.mkSlot(g2, 52, () => inv[2], (s) => inv[2] = s);
    const labels = document.createElement('div'); labels.className = 'hint';
    labels.innerHTML = '上：原料（矿石/生肉/沙子） 左下：燃料（煤炭/木板） 右下：产物';
    const burn = document.createElement('div'); burn.className = 'meter';
    const bi = document.createElement('i');
    bi.style.width = st.burnMax ? clamp(st.burn / st.burnMax * 100, 0, 100) + '%' : '0%';
    burn.appendChild(bi);
    const cook = document.createElement('div'); cook.className = 'meter';
    const ci = document.createElement('i'); ci.style.width = clamp((st.cook || 0) / 8 * 100, 0, 100) + '%'; ci.style.background = 'linear-gradient(#7fd269,#3f9a2c)';
    cook.appendChild(ci);
    const info = document.createElement('div'); info.className = 'hint';
    info.textContent = '燃料剩余：' + Math.ceil(st.burn || 0) + 's　熔炼进度：' + Math.floor((st.cook || 0) / 8 * 100) + '%';
    left.appendChild(g); left.appendChild(g2); left.appendChild(labels); left.appendChild(burn); left.appendChild(cook); left.appendChild(info);
    b.appendChild(left);
    const mid = document.createElement('div'); mid.className = 'col';
    const mt = document.createElement('div'); mt.className = 'panel-title'; mt.textContent = '背包'; mid.appendChild(mt);
    const mg = document.createElement('div'); mg.className = 'grid nine';
    for (let i = 0; i < 27; i++) this.mkSlot(mg, 52, () => MC.player.inv.main.get(i), (s) => MC.player.inv.main.set(i, s));
    mid.appendChild(mg);
    const hg = document.createElement('div'); hg.className = 'grid nine';
    for (let i = 0; i < 9; i++) this.mkSlot(hg, 52, () => MC.player.inv.hotbar.get(i), (s) => MC.player.inv.hotbar.set(i, s));
    mid.appendChild(hg);
    b.appendChild(mid);
  }
  renderChest() {
    const d = this.screenData;
    let st = MC.world.getState(d.x, d.y, d.z);
    if (!st) { st = { inv: new Array(27).fill(null) }; MC.world.setState(d.x, d.y, d.z, st); }
    this.renderContainer(st, '箱子');
  }
  /* 潜影盒（方块或随身）：与箱子一致的 27 格界面 */
  openShulker(holder, label) {
    this.openScreen('shulker', { holder, label: label || '潜影盒' });
  }
  /* ===== 方块交互入口（工作台 / 熔炉 / 箱子 / 附魔台） ===== */
  openCrafting() { this.openScreen('crafting'); }
  openFurnace(x, y, z) { this.openScreen('furnace', { x, y, z }); }
  openChest(x, y, z) { this.openScreen('chest', { x, y, z }); }
  openEnchant() { this.openScreen('enchant', { stack: null }); }
  renderShulker() {
    const h = this.screenData.holder;
    if (!h.inv) h.inv = new Array(27).fill(null);
    this.renderContainer(h, this.screenData.label || '潜影盒');
  }
  /* 熔炉：首次打开时初始化内部格子 */
  renderFurnaceScreen() { this.renderFurnace(); }
  renderContainer(st, title) {
    const b = this.el.screenBody;
    const left = document.createElement('div'); left.className = 'col';
    const t = document.createElement('div'); t.className = 'panel-title'; t.textContent = title; left.appendChild(t);
    const g = document.createElement('div'); g.className = 'grid nine';
    for (let i = 0; i < 27; i++) this.mkSlot(g, 52, () => st.inv[i], (s) => st.inv[i] = s);
    left.appendChild(g);
    b.appendChild(left);
    const mid = document.createElement('div'); mid.className = 'col';
    const mt = document.createElement('div'); mt.className = 'panel-title'; mt.textContent = '背包'; mid.appendChild(mt);
    const mg = document.createElement('div'); mg.className = 'grid nine';
    for (let i = 0; i < 27; i++) this.mkSlot(mg, 52, () => MC.player.inv.main.get(i), (s) => MC.player.inv.main.set(i, s));
    mid.appendChild(mg);
    const hg = document.createElement('div'); hg.className = 'grid nine';
    for (let i = 0; i < 9; i++) this.mkSlot(hg, 52, () => MC.player.inv.hotbar.get(i), (s) => MC.player.inv.hotbar.set(i, s));
    mid.appendChild(hg);
    b.appendChild(mid);
  }
  renderEnchant() {
    const b = this.el.screenBody;
    if (!this.screenData.stack) this.screenData.stack = null;
    const left = document.createElement('div'); left.className = 'col';
    const t = document.createElement('div'); t.className = 'panel-title'; t.textContent = '放入要附魔的物品'; left.appendChild(t);
    const g = document.createElement('div'); g.className = 'grid two';
    this.mkSlot(g, 52, () => this.screenData.stack, (s) => this.screenData.stack = s);
    left.appendChild(g);
    const info = document.createElement('div'); info.className = 'hint';
    info.textContent = '消耗经验等级随机获得附魔（效率/时运/锋利/耐久/保护/力量/击退）';
    left.appendChild(info);
    b.appendChild(left);
    const right = document.createElement('div'); right.className = 'col';
    const rt = document.createElement('div'); rt.className = 'panel-title'; rt.textContent = '附魔选项'; right.appendChild(rt);
    const stack = this.screenData.stack;
    if (!stack) { const n = document.createElement('div'); n.className = 'emptynote'; n.textContent = '请先放入物品'; right.appendChild(n); }
    else if (!enchantOptions(stack, MC.player.level).length) { const n = document.createElement('div'); n.className = 'emptynote'; n.textContent = '该物品无法附魔'; right.appendChild(n); }
    else {
      const opts = enchantOptions(stack, MC.player.level);
      opts.forEach((o, i) => {
        const e = ENCHANTS[o.type];
        const btn = document.createElement('button');
        btn.className = 'btn-sm';
        btn.style.margin = '4px 0';
        btn.textContent = `${e.cn} ${'I'.repeat(o.lv)} — 消耗 ${o.cost} 级（${e.desc}）`;
        btn.disabled = MC.player.level < o.cost;
        btn.addEventListener('click', () => {
          if (MC.player.level < o.cost) return;
          MC.player.level -= o.cost;
          MC.player.xp = 0;
          applyEnchant(stack, o);
          MC.sound.play('enchant');
          this.unlock('enchant');
          this.toast('附魔成功：' + e.cn + ' ' + 'I'.repeat(o.lv), 'good');
          this.refreshOpenScreen(); this.updateStats();
        });
        right.appendChild(btn);
      });
    }
    const mid = document.createElement('div'); mid.className = 'col';
    const mt = document.createElement('div'); mt.className = 'panel-title'; mt.textContent = '背包'; mid.appendChild(mt);
    const mg = document.createElement('div'); mg.className = 'grid nine';
    for (let i = 0; i < 27; i++) this.mkSlot(mg, 52, () => MC.player.inv.main.get(i), (s) => MC.player.inv.main.set(i, s));
    mid.appendChild(mg);
    const hg = document.createElement('div'); hg.className = 'grid nine';
    for (let i = 0; i < 9; i++) this.mkSlot(hg, 52, () => MC.player.inv.hotbar.get(i), (s) => MC.player.inv.hotbar.set(i, s));
    mid.appendChild(hg);
    b.appendChild(mid);
  }
  renderCreative() {
    const b = this.el.screenBody;
    if (!this.screenData.tab) this.screenData.tab = 0;
    const left = document.createElement('div'); left.className = 'col';
    const tabs = document.createElement('div'); tabs.className = 'col';
    CREATIVE_TABS.forEach((t, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn-sm' + (i === this.screenData.tab ? ' primary' : '');
      btn.textContent = t.name;
      btn.addEventListener('click', () => { this.screenData.tab = i; this.refreshOpenScreen(); });
      tabs.appendChild(btn);
    });
    left.appendChild(tabs);
    const clear = document.createElement('button');
    clear.className = 'btn-sm danger'; clear.textContent = '清空背包';
    clear.addEventListener('click', () => { MC.player.inv.hotbar.clear(); MC.player.inv.main.clear(); this.refreshOpenScreen(); this.updateHotbar(); });
    left.appendChild(clear);
    const info = document.createElement('div'); info.className = 'hint';
    info.innerHTML = '点击物品放入手中<br>创造模式：中键可复制方块';
    left.appendChild(info);
    b.appendChild(left);
    const right = document.createElement('div'); right.className = 'col';
    const list = document.createElement('div');
    list.className = 'recipe-list';
    list.style.width = 'min(560px,54vw)';
    const items = CREATIVE_TABS[this.screenData.tab].items;
    items.forEach((id) => {
      const st = makeStack(id, id.endsWith('_bucket') || stackDef({ id }) && (stackDef({ id }).stack === 1) ? 1 : 64);
      const d = document.createElement('div');
      d.className = 'recipe';
      d.appendChild(this.iconEl(st, 38));
      d.addEventListener('click', () => {
        const cur = MC.player.inv.cursor;
        if (cur && sameItem(cur, st)) cur.count = Math.min(64, cur.count + st.count);
        else MC.player.inv.cursor = copyStack(st);
        MC.sound.play('click');
        this.updateCursorItem();
      });
      d.addEventListener('mouseenter', (e) => this.showTooltip(st, e));
      d.addEventListener('mousemove', (e) => this.moveTooltip(e));
      d.addEventListener('mouseleave', () => this.hideTooltip());
      list.appendChild(d);
    });
    right.appendChild(list);
    b.appendChild(right);
  }
  updateCursorItem() {
    const cur = MC.player.inv.cursor;
    if (!cur) { this.el.cursorItem.classList.add('hidden'); return; }
    this.el.cursorItem.classList.remove('hidden');
    const cv = this.el.cursorItem.querySelector('canvas');
    const icon = MC.icons.forItem({ id: cur.id, def: stackDef(cur), meta: cur.meta }, 32);
    const ctx = cv.getContext('2d');
    cv.width = 32; cv.height = 32; ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 32, 32); ctx.drawImage(icon, 0, 0, 32, 32);
    const span = this.el.cursorItem.querySelector('span');
    span.textContent = cur.count > 1 ? cur.count : '';
    this.moveCursorItem();
  }
  moveCursorItem() {
    if (!this.mouse) return;
    this.el.cursorItem.style.left = (this.mouse.x - 16) + 'px';
    this.el.cursorItem.style.top = (this.mouse.y - 16) + 'px';
  }

  /* ================= 提示气泡 ================= */
  buildTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip hidden';
    document.body.appendChild(this.tooltip);
  }
  showTooltip(stack, e) {
    const def = stackDef(stack);
    if (!def) return;
    const en = enchantName(stack);
    let html = `<div class="t">${def.cn}${en ? ' <span style="color:#b48cff">[' + en + ']</span>' : ''}</div>`;
    const lines = [];
    if (def.block !== undefined) lines.push('可放置方块');
    if (def.toolType) lines.push(`工具：${def.toolType}　速度 ${def.speed}　伤害 ${def.damage}`);
    if (def.defense) lines.push(`护甲：+${def.defense} 防御`);
    if (def.food) lines.push(`食物：恢复 ${def.food} 饥饿`);
    if (def.fuel) lines.push(`燃料：可熔炼 ${def.fuel} 个物品`);
    if (def.durability && stack.meta && stack.meta.dur !== undefined) lines.push(`耐久：${stack.meta.dur}/${def.durability}`);
    if (def.ranged) lines.push('右键射箭（需要箭）');
    if (def.id === 'flint_and_steel') lines.push('右键点燃 TNT');
    lines.push('英文名：' + (def.en || def.id));
    html += '<div class="d">' + lines.join('<br>') + '</div>';
    this.tooltip.innerHTML = html;
    this.tooltip.classList.remove('hidden');
    this.moveTooltip(e);
  }
  showRecipeTooltip(recipe, e) {
    const st = makeStack(recipe.out, recipe.count);
    this.showTooltip(st, e);
    let extra = '<div class="d" style="margin-top:4px">材料：';
    const need = {};
    if (recipe.type === 'shapeless') for (const id of recipe.ing) need[id] = (need[id] || 0) + 1;
    else for (const row of recipe.pattern) for (const ch of row) { if (isPatternEmpty(ch)) continue; const a = recipe.key[ch]; need[a[0]] = (need[a[0]] || 0) + 1; }
    extra += Object.keys(need).map(id => `${itemName(id)}×${need[id]}`).join('、') + '</div>';
    this.tooltip.innerHTML += extra;
  }
  moveTooltip(e) {
    if (this.tooltip.classList.contains('hidden')) return;
    const x = Math.min(window.innerWidth - 300, e.clientX + 14);
    const y = Math.min(window.innerHeight - 120, e.clientY + 14);
    this.tooltip.style.left = x + 'px';
    this.tooltip.style.top = y + 'px';
  }
  hideTooltip() { this.tooltip.classList.add('hidden'); }

  /* ================= 设置 / 成就 / 死亡 ================= */
  buildSettings() {
    const g = document.getElementById('settingsGrid');
    g.innerHTML = '';
    const S = MC.settings;
    const add = (labelTxt, node) => {
      const d = document.createElement('div'); d.className = 'setting';
      const l = document.createElement('label'); l.textContent = labelTxt;
      d.appendChild(l); d.appendChild(node); g.appendChild(d);
    };
    const slider = (key, min, max, step, onChange) => {
      const wrap = document.createElement('div');
      const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = S[key];
      const v = document.createElement('span'); v.textContent = S[key]; v.style.marginLeft = '8px';
      r.addEventListener('input', () => { S[key] = parseFloat(r.value); v.textContent = r.value; onChange && onChange(); MC.saveSettings(); });
      wrap.appendChild(r); wrap.appendChild(v);
      return wrap;
    };
    add('视野距离（区块）', slider('renderDistance', 3, 12, 1, () => { MC.world.renderDistance = S.renderDistance; }));
    add('视场角 FOV', slider('fov', 50, 110, 1, () => { }));
    const sensWrap = slider('sensitivity', 10, 300, 5);
    const sensLabel = document.createElement('span');
    sensLabel.style.cssText = 'font-size:12px;opacity:.7;margin-left:6px';
    const upd = () => { sensLabel.textContent = '≈ 每 100 像素转 ' + (MC.player ? MC.player.lookDegreesPer100px().toFixed(0) : '?') + '°'; };
    sensWrap.querySelector('input').addEventListener('input', upd);
    upd();
    sensWrap.appendChild(sensLabel);
    add('鼠标灵敏度（视角转速）', sensWrap);
    add('音量', slider('volume', 0, 1, 0.05, () => MC.sound.setVolume(S.volume)));
    add('一天时长（秒）', slider('dayLength', 240, 2400, 60));
    const music = document.createElement('select');
    [['开', true], ['关', false]].forEach(([t, v]) => { const o = document.createElement('option'); o.value = v ? '1' : '0'; o.textContent = t; music.appendChild(o); });
    music.value = S.music ? '1' : '0';
    music.addEventListener('change', () => { S.music = music.value === '1'; MC.sound.musicGain.gain.value = S.music ? 0.9 : 0; MC.saveSettings(); });
    add('背景音乐', music);
    const gm = document.createElement('select');
    [['生存', 'survival'], ['创造', 'creative']].forEach(([t, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; gm.appendChild(o); });
    gm.value = MC.player.creative ? 'creative' : 'survival';
    gm.addEventListener('change', () => MC.setGamemode(gm.value));
    add('游戏模式', gm);
    const diff = document.createElement('select');
    [['和平', 0], ['普通', 1], ['困难', 2]].forEach(([t, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; diff.appendChild(o); });
    diff.value = String(MC.difficulty);
    diff.addEventListener('change', () => { MC.difficulty = +diff.value; });
    add('难度', diff);
    const fs = document.createElement('button');
    fs.className = 'btn-sm'; fs.textContent = '切换全屏';
    fs.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); });
    add('显示', fs);
    const save = document.createElement('button');
    save.className = 'btn-sm'; save.textContent = '立即保存存档';
    save.addEventListener('click', () => { MC.saveWorld(); this.toast('已保存到浏览器本地存储', 'good'); });
    add('存档', save);
    const del = document.createElement('button');
    del.className = 'btn-sm danger'; del.textContent = '删除存档';
    del.addEventListener('click', () => { try { localStorage.removeItem('blockworld3d_save'); } catch (e) { } this.toast('存档已删除', 'bad'); });
    add('危险操作', del);
  }
  buildAchievements() {
    const list = document.getElementById('achList');
    if (!list) return;
    list.innerHTML = '';
    const got = MC.ach.got;
    ACHIEVEMENTS.forEach(a => {
      const d = document.createElement('div');
      d.className = 'ach-item' + (got.has(a.id) ? ' got' : '');
      d.innerHTML = `<span class="ach-emoji">${got.has(a.id) ? a.emoji : '❔'}</span><div><b>${a.cn}</b><span>${a.desc}</span></div>`;
      list.appendChild(d);
    });
    const c = document.getElementById('achCount');
    if (c) c.textContent = `${got.size}/${ACHIEVEMENTS.length}`;
  }
  showDeath(reason) {
    this.el.death.classList.remove('hidden');
    this.el.deathMsg.textContent = '死因：' + reason;
    this.centerVirtualCursor();
  }
  hideDeath() {
    this.el.death.classList.add('hidden');
    if (MC.lockMouse) MC.lockMouse();
  }

  renderQuests() {
    const p = this.el.questPanel;
    if (!p) return;
    let html = '<b>新手目标</b><br>';
    let doneCount = 0;
    for (const q of QUESTS) {
      const d = q.done();
      if (d) doneCount++;
      html += `<span class="${d ? 'done' : ''}">${d ? '✔' : '◻'} ${q.cn}</span><br>`;
    }
    html += `<span style="opacity:.6">进度 ${doneCount}/${QUESTS.length}</span>`;
    if (html !== this.questCache) { p.innerHTML = html; this.questCache = html; }
  }

  /* ================= 每帧 ================= */
  tick(dt) {
    this.updateCursorMode();
    // 物品栏内容一变就立刻刷新快捷栏（拾取、合成、吃东西、工具磨损…）
    const inv = MC.player && MC.player.inv;
    if (inv) {
      let sig = '';
      for (let i = 0; i < 9; i++) { const s = inv.hotbar.get(i); sig += (s ? s.id + s.count + (s.meta && s.meta.dur !== undefined ? '.' + (s.meta.dur | 0) : '') : '-') + ','; }
      for (let i = 0; i < 4; i++) { const s = inv.armor.get(i); sig += (s ? s.id : '-') + ','; }
      if (sig !== this._invSig) {
        const heldId = inv.held ? inv.held.id : null;
        const heldChanged = heldId !== this._lastHeldId;
        this._lastHeldId = heldId;
        this._invSig = sig;
        this.updateHotbar();
        this.updateStats();
        if (heldChanged && heldId) this.heldName(true);      // 捡到/换成新物品也弹名字
        if (this.screenOpen) this.refreshOpenScreen();
      }
    }
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2);
    // 消息的淡出/删除由 scheduleChatFade 负责，这里不再强制改透明度
    this.miniTimer -= dt;
    if (this.miniTimer <= 0) { this.miniTimer = 0.2; this.drawMinimap(); }
    this.questTimer = (this.questTimer || 0) - dt;
    if (this.questTimer <= 0) { this.questTimer = 1; this.renderQuests(); }
    // 20 秒没操作就把新手目标淡下去，按 J 或完成目标会再亮起来
    if (this.el.questPanel && !this.questsHidden) {
      const idle = performance.now() - (this.questSeenAt || performance.now());
      this.el.questPanel.style.transition = 'opacity 1s';
      this.el.questPanel.style.opacity = idle > 20000 ? '0.22' : '1';
    }
    if (!this.el.debug.classList.contains('hidden')) this.updateDebug();
  }
  drawMinimap() {
    const cv = this.el.mini;
    if (!cv || cv.offsetParent === null) return;
    const ctx = cv.getContext('2d');
    const size = 160;
    const range = 40;    // 覆盖 ±40 格
    const scale = size / (range * 2);
    const px = Math.floor(MC.player.pos.x), pz = Math.floor(MC.player.pos.z);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#101318'; ctx.fillRect(0, 0, size, size);
    for (let dz = -range; dz < range; dz += 2) {
      for (let dx = -range; dx < range; dx += 2) {
        const x = px + dx, z = pz + dz;
        const c = MC.world.getChunkAt(x, z);
        if (!c) continue;
        const lx = x - c.x * CHUNK_W, lz = z - c.z * CHUNK_W;
        const h = c.heightmap[lz * CHUNK_W + lx];
        const biome = c.biome[lz * CHUNK_W + lx];
        let col;
        if (h < SEA_LEVEL) col = '#2b5fb8';
        else {
          const pal = BIOME_COLORS[biome] || BIOME_COLORS[0];
          const top = c.get(lx, h, lz);
          const base = top === B.sand ? [0.85, 0.8, 0.55] : top === B.snow_grass || top === B.snow_block ? [0.95, 0.97, 1] : pal.grass;
          const shade2 = 0.75 + (h - SEA_LEVEL) / 60;
          col = rgbHex(base[0] * 255 * shade2, base[1] * 255 * shade2, base[2] * 255 * shade2);
        }
        ctx.fillStyle = col;
        ctx.fillRect((dx + range) * scale, (dz + range) * scale, scale * 2 + 0.5, scale * 2 + 0.5);
      }
    }
    // 生物与玩家
    for (const m of MC.world.mobs) {
      const dx = m.pos.x - px, dz = m.pos.z - pz;
      if (Math.abs(dx) > range || Math.abs(dz) > range) continue;
      ctx.fillStyle = m.t.hostile ? '#e34a4a' : '#f0e0a0';
      ctx.fillRect((dx + range) * scale - 1.5, (dz + range) * scale - 1.5, 3, 3);
    }
    for (const it of MC.world.itemEntities) {
      const dx = it.x - px, dz = it.z - pz;
      if (Math.abs(dx) > range || Math.abs(dz) > range) continue;
      ctx.fillStyle = '#7fd269';
      ctx.fillRect((dx + range) * scale - 1, (dz + range) * scale - 1, 2, 2);
    }
    // 玩家箭头
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-MC.player.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(0, 2); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(mod(-MC.player.yaw, TAU) / (TAU / 8)) % 8;
    document.getElementById('miniDir').textContent = dirs[idx];
  }
  /* 进食进度（手持食物按住右键时显示） */
  setEatProgress(p) {
    let bar = document.getElementById('eatBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'eatBar';
      bar.innerHTML = '<i></i><span>进食中…</span>';
      const host = document.getElementById('bottomHud');
      if (host) host.appendChild(bar);
    }
    const fill = bar.querySelector('i');
    if (p <= 0.01) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    fill.style.width = clamp(p * 100, 0, 100) + '%';
  }
  toggleDebug() { this.el.debug.classList.toggle('hidden'); }
  /* ---------- 维度 / Boss / 传送门 UI ---------- */
  setDimensionLabel(name) {
    const el = document.getElementById('dimLabel');
    if (el) el.textContent = '维度：' + name;
  }
  setBossBar(name, ratio, visible) {
    const bar = document.getElementById('bossBar');
    if (!bar) return;
    this.bossVisible = !!visible;
    bar.classList.toggle('hidden', !visible);
    if (!visible) return;
    document.getElementById('bossName').textContent = name;
    const f = document.getElementById('bossFill');
    f.style.width = clamp(ratio * 100, 0, 100) + '%';
  }
  setPortalProgress(p) {
    const bar = document.getElementById('portalBar');
    if (!bar) return;
    const ov = document.getElementById('portalOverlay');
    if (p <= 0) { ov.classList.add('hidden'); bar.style.width = '0%'; return; }
    ov.classList.remove('hidden');
    this.el.portalTitle = this.el.portalTitle || document.getElementById('portalTitle');
    this.el.portalTip = this.el.portalTip || document.getElementById('portalTip');
    this.el.portalTitle.textContent = '正在传送…';
    this.el.portalTip.textContent = '站在传送门中 ' + Math.round(p * 100) + '%';
    bar.style.width = (p * 100) + '%';
  }
  showPortalOverlay(target) {
    const ov = document.getElementById('portalOverlay');
    ov.classList.remove('hidden');
    const t = document.getElementById('portalTitle');
    const tip = document.getElementById('portalTip');
    if (t) t.textContent = '前往' + (MC.DIM_NAMES[target] || target);
    if (tip) tip.textContent = '构建传送门中…';
    const bar = document.getElementById('portalBar');
    if (bar) bar.style.width = '100%';
  }
  hidePortalOverlay() {
    const ov = document.getElementById('portalOverlay');
    if (ov) ov.classList.add('hidden');
  }
  showCredits() {
    const c = document.getElementById('credits');
    if (!c) return;
    c.classList.remove('hidden');
    this.centerVirtualCursor();
  }
  hideCredits() {
    const c = document.getElementById('credits');
    if (c) c.classList.add('hidden');
  }
  updateDebug() {
    const p = MC.player, w = MC.world;
    const biome = w.gen.biomeAt(Math.floor(p.pos.x), Math.floor(p.pos.z));
    const feet = w.getBlockDef(Math.floor(p.pos.x), Math.floor(p.pos.y + 0.1), Math.floor(p.pos.z));
    const sky = w.getSkyLight(Math.floor(p.pos.x), Math.floor(p.pos.y + 1), Math.floor(p.pos.z));
    const blk = w.getBlockLight(Math.floor(p.pos.x), Math.floor(p.pos.y + 1), Math.floor(p.pos.z));
    const t = w.time;
    const hh = Math.floor(mod(t * 24, 24)), mm = Math.floor(mod(t * 24 * 60, 60));
    this.el.debug.textContent =
      `FPS ${this.game.fps}　区块 ${w.chunks.size}　实体 ${w.mobs.length}/${w.itemEntities.length}\n` +
      `XYZ ${p.pos.x.toFixed(2)} / ${p.pos.y.toFixed(2)} / ${p.pos.z.toFixed(2)}\n` +
      `区块 ${Math.floor(p.pos.x / 16)},${Math.floor(p.pos.z / 16)}　朝向 ${(mod(-p.yaw, TAU) * 180 / Math.PI).toFixed(0)}°\n` +
      `生物群系 ${BIOME_COLORS[biome] ? BIOME_COLORS[biome].name : '-'}　脚下 ${feet.cn}\n` +
      `光照 天${sky}/15 方块${blk}/15　时间 ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} 第${w.dayCount}天\n` +
      `模式 ${p.creative ? '创造' : '生存'}　难度 ${['和平', '普通', '困难'][MC.difficulty]}　速度 ${Math.hypot(p.vel.x, p.vel.z).toFixed(2)}\n` +
      `维度 ${w.dimConfig.name}　种子 ${w.seed}　天气 ${w.weather.rain ? '下雨' : '晴'}　${p.inv.held ? itemName(p.inv.held.id) : '空手'}\n` +
      `流体 ${w.fluids.activeSize} 格待更新　末影水晶 ${w.crystals.length}`;
  }
}

/* ---------- 血条小图标 ---------- */
function drawGlyph(ctx, glyph, size, alpha, cls, half) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.scale(size / 10, size / 10);
  const P = 0.9;
  if (glyph === 'heart') {
    ctx.fillStyle = '#e34a4a';
    const px = (x, y, w, h) => ctx.fillRect(x, y, w, h);
    px(1, 2, 3, 3); px(6, 2, 3, 3); px(0.5, 3, 9, 3); px(2, 6, 6, 2); px(3, 8, 4, 1);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(2, 3, 2, 1);
    if (half) { ctx.clearRect(4.5, 0, 5, 10); }
  } else if (glyph === 'food') {
    ctx.fillStyle = '#c98a45';
    ctx.beginPath(); ctx.ellipse(5, 6, 3.4, 3.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e0c060'; ctx.fillRect(4, 3, 2, 2);
    ctx.fillStyle = '#8a6537'; ctx.fillRect(5, 1.4, 1, 2);
    if (half) { ctx.clearRect(5, 0, 5, 10); }
  } else if (glyph === 'armor') {
    ctx.fillStyle = '#cfd6e0';
    ctx.beginPath(); ctx.moveTo(5, 0.6); ctx.lineTo(9.4, 2.4); ctx.lineTo(9.4, 5); ctx.quadraticCurveTo(9.4, 8.6, 5, 9.6);
    ctx.quadraticCurveTo(0.6, 8.6, 0.6, 5); ctx.lineTo(0.6, 2.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9aa6b8'; ctx.fillRect(4.4, 2.6, 1.2, 5.5);
  } else if (glyph === 'bubble') {
    ctx.strokeStyle = '#bfe8ff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(5, 5, 3.6, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(200,240,255,.35)'; ctx.beginPath(); ctx.arc(5, 5, 3.2, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
