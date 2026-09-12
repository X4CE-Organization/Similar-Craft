/* ============================================================
   方块 / 物品 / 配方 注册表
   ============================================================ */

const BLOCKS = [];
const B = {};
function block(name, def) {
  const id = BLOCKS.length;
  def = Object.assign({
    id, name, cn: name, en: name, solid: true, opaque: true, hardness: 1, tool: null, minLevel: 0,
    light: 0, shape: 'cube', liquid: false, tint: null, sound: 'stone', replaceable: false,
    stack: 64, transparent: false, climb: false, drops: null, burn: 0, interactive: null, blast: 1, noCollide: false,
  }, def);
  BLOCKS.push(def); B[name] = id;
  return id;
}

block('air', { cn: '空气', solid: false, opaque: false, transparent: true, replaceable: true, noCollide: true, hardness: 0, drops: [] });
block('bedrock', { cn: '基岩', en: 'Bedrock', tex: { all: T.BEDROCK }, hardness: Infinity, drops: [], blast: 1e9 });
block('stone', { cn: '石头', en: 'Stone', tex: { all: T.STONE }, hardness: 1.5, tool: 'pickaxe', minLevel: 1, drops: ['cobblestone'], sound: 'stone' });
block('cobblestone', { cn: '圆石', en: 'Cobblestone', tex: { all: T.COBBLE }, hardness: 2, tool: 'pickaxe', minLevel: 1, sound: 'stone' });
block('mossy_cobblestone', { cn: '苔石', en: 'Mossy Cobblestone', tex: { all: T.MOSSY_COBBLE }, hardness: 2, tool: 'pickaxe', minLevel: 1, sound: 'stone' });
block('stone_brick', { cn: '石砖', en: 'Stone Bricks', tex: { all: T.STONE_BRICK }, hardness: 1.5, tool: 'pickaxe', minLevel: 1, sound: 'stone' });
block('brick_block', { cn: '砖块', en: 'Bricks', tex: { all: T.BRICK }, hardness: 2, tool: 'pickaxe', minLevel: 1, sound: 'stone' });
block('grass_block', { cn: '草方块', en: 'Grass Block', tex: { top: T.GRASS_TOP, side: T.GRASS_SIDE, bottom: T.DIRT }, hardness: 0.6, tool: 'shovel', tint: 'grass', drops: ['dirt'], sound: 'grass' });
block('dirt', { cn: '泥土', en: 'Dirt', tex: { all: T.DIRT }, hardness: 0.5, tool: 'shovel', sound: 'gravel' });
block('farmland', { cn: '耕地', en: 'Farmland', tex: { top: T.FARMLAND, side: T.DIRT, bottom: T.DIRT }, hardness: 0.6, tool: 'shovel', drops: ['dirt'], sound: 'gravel' });
block('sand', { cn: '沙子', en: 'Sand', tex: { all: T.SAND }, hardness: 0.5, tool: 'shovel', sound: 'sand' });
block('sandstone', { cn: '砂岩', en: 'Sandstone', tex: { top: T.SANDSTONE_TOP, side: T.SANDSTONE_SIDE, bottom: T.SANDSTONE_TOP }, hardness: 0.8, tool: 'pickaxe', minLevel: 1, sound: 'stone' });
block('gravel', { cn: '砂砾', en: 'Gravel', tex: { all: T.GRAVEL }, hardness: 0.6, tool: 'shovel', drops: ['gravel', 'flint'], dropChance: [1, 0.16], sound: 'gravel' });
block('clay', { cn: '粘土', en: 'Clay', tex: { all: T.CLAY }, hardness: 0.6, tool: 'shovel', drops: ['clay_ball'], dropCount: 4, sound: 'gravel' });
block('snow_block', { cn: '雪块', en: 'Snow Block', tex: { all: T.SNOW }, hardness: 0.2, tool: 'shovel', sound: 'snow' });
block('snow_grass', { cn: '雪覆草地', en: 'Snowy Grass', tex: { top: T.SNOW, side: T.SNOW_SIDE, bottom: T.DIRT }, hardness: 0.6, tool: 'shovel', drops: ['dirt'], sound: 'snow' });
block('ice', { cn: '冰', en: 'Ice', tex: { all: T.ICE }, hardness: 0.5, tool: 'pickaxe', transparent: true, opaque: false, drops: [], sound: 'glass', lightAtten: 1, slippery: true });
block('packed_ice', { cn: '浮冰', en: 'Packed Ice', tex: { all: T.ICE }, hardness: 1, tool: 'pickaxe', sound: 'glass' });
block('water', {
  cn: '水', en: 'Water', tex: { all: T.WATER }, liquid: true, solid: false, opaque: false, transparent: true, replaceable: true,
  hardness: Infinity, drops: [], shape: 'liquid', sound: 'water', lightAtten: 1, tintWater: true,
});
block('lava', {
  cn: '岩浆', en: 'Lava', tex: { all: T.LAVA }, liquid: true, solid: false, opaque: false, transparent: false,
  hardness: Infinity, drops: [], light: 15, shape: 'liquid', sound: 'lava', damage: 4,
});
block('obsidian', { cn: '黑曜石', en: 'Obsidian', tex: { all: T.OBSIDIAN }, hardness: 50, tool: 'pickaxe', minLevel: 4, blast: 1200 });
block('glowstone', { cn: '荧石', en: 'Glowstone', tex: { all: T.GLOWSTONE }, hardness: 0.3, light: 15, sound: 'glass' });
block('coal_ore', { cn: '煤矿石', en: 'Coal Ore', tex: { all: T.COAL_ORE }, hardness: 3, tool: 'pickaxe', minLevel: 1, drops: ['coal'], xp: 1, sound: 'stone' });
block('iron_ore', { cn: '铁矿石', en: 'Iron Ore', tex: { all: T.IRON_ORE }, hardness: 3, tool: 'pickaxe', minLevel: 2, drops: ['raw_iron'], xp: 1, sound: 'stone' });
block('gold_ore', { cn: '金矿石', en: 'Gold Ore', tex: { all: T.GOLD_ORE }, hardness: 3, tool: 'pickaxe', minLevel: 3, drops: ['raw_gold'], xp: 1, sound: 'stone' });
block('diamond_ore', { cn: '钻石矿石', en: 'Diamond Ore', tex: { all: T.DIAMOND_ORE }, hardness: 3, tool: 'pickaxe', minLevel: 3, drops: ['diamond'], xp: 4, sound: 'stone' });
block('redstone_ore', { cn: '红石矿石', en: 'Redstone Ore', tex: { all: T.REDSTONE_ORE }, hardness: 3, tool: 'pickaxe', minLevel: 3, drops: ['redstone'], dropCount: 4, xp: 2, sound: 'stone' });
block('emerald_ore', { cn: '绿宝石矿石', en: 'Emerald Ore', tex: { all: T.EMERALD_ORE }, hardness: 3, tool: 'pickaxe', minLevel: 3, drops: ['emerald'], xp: 5, sound: 'stone' });
block('coal_block', { cn: '煤炭块', en: 'Coal Block', tex: { all: T.COAL_BLOCK }, hardness: 5, tool: 'pickaxe', minLevel: 1, sound: 'stone' });
block('iron_block', { cn: '铁块', en: 'Iron Block', tex: { all: T.IRON_BLOCK }, hardness: 5, tool: 'pickaxe', minLevel: 2, sound: 'metal' });
block('gold_block', { cn: '金块', en: 'Gold Block', tex: { all: T.GOLD_BLOCK }, hardness: 3, tool: 'pickaxe', minLevel: 3, sound: 'metal' });
block('diamond_block', { cn: '钻石块', en: 'Diamond Block', tex: { all: T.DIAMOND_BLOCK }, hardness: 5, tool: 'pickaxe', minLevel: 3, sound: 'metal' });
block('oak_log', { cn: '橡木原木', en: 'Oak Log', tex: { top: T.LOG_TOP, side: T.LOG_SIDE, bottom: T.LOG_TOP }, hardness: 2, tool: 'axe', burn: 1, sound: 'wood' });
block('birch_log', { cn: '白桦原木', en: 'Birch Log', tex: { top: T.BIRCH_LOG_TOP, side: T.BIRCH_LOG_SIDE, bottom: T.BIRCH_LOG_TOP }, hardness: 2, tool: 'axe', burn: 1, sound: 'wood' });
block('spruce_log', { cn: '云杉原木', en: 'Spruce Log', tex: { top: T.SPRUCE_LOG_TOP, side: T.SPRUCE_LOG_SIDE, bottom: T.SPRUCE_LOG_TOP }, hardness: 2, tool: 'axe', burn: 1, sound: 'wood' });
block('oak_planks', { cn: '橡木木板', en: 'Oak Planks', tex: { all: T.PLANKS }, hardness: 2, tool: 'axe', burn: 1, sound: 'wood' });
block('birch_planks', { cn: '白桦木板', en: 'Birch Planks', tex: { all: T.BIRCH_PLANKS }, hardness: 2, tool: 'axe', burn: 1, sound: 'wood' });
block('spruce_planks', { cn: '云杉木板', en: 'Spruce Planks', tex: { all: T.SPRUCE_PLANKS }, hardness: 2, tool: 'axe', burn: 1, sound: 'wood' });
block('oak_leaves', { cn: '橡木树叶', en: 'Oak Leaves', tex: { all: T.LEAVES }, hardness: 0.2, transparent: true, opaque: false, lightAtten: 1, drops: [], dropChance: [], burn: 1, sound: 'grass', tint: 'foliage_grass' });
block('birch_leaves', { cn: '白桦树叶', en: 'Birch Leaves', tex: { all: T.BIRCH_LEAVES }, hardness: 0.2, transparent: true, opaque: false, lightAtten: 1, drops: [], burn: 1, sound: 'grass', tint: 'foliage' });
block('spruce_leaves', { cn: '云杉树叶', en: 'Spruce Leaves', tex: { all: T.SPRUCE_LEAVES }, hardness: 0.2, transparent: true, opaque: false, lightAtten: 1, drops: [], burn: 1, sound: 'grass', tint: 'spruce' });
block('glass', { cn: '玻璃', en: 'Glass', tex: { all: T.GLASS }, hardness: 0.3, transparent: true, opaque: false, drops: [], sound: 'glass' });
block('crafting_table', { cn: '工作台', en: 'Crafting Table', tex: { top: T.CRAFT_TOP, side: T.CRAFT_SIDE, bottom: T.PLANKS }, hardness: 2.5, tool: 'axe', burn: 1, interactive: 'crafting', sound: 'wood' });
block('furnace', { cn: '熔炉', en: 'Furnace', tex: { top: T.FURNACE_TOP, side: T.FURNACE_SIDE, bottom: T.FURNACE_TOP }, hardness: 3.5, tool: 'pickaxe', minLevel: 1, interactive: 'furnace', sound: 'stone', hasState: true });
block('chest', { cn: '箱子', en: 'Chest', tex: { top: T.CHEST_TOP, side: T.CHEST_SIDE, bottom: T.CHEST_SIDE }, hardness: 2.5, tool: 'axe', burn: 1, interactive: 'chest', sound: 'wood', hasState: true });
block('enchanting_table', { cn: '附魔台', en: 'Enchanting Table', tex: { top: T.ENCHANT_TOP, side: T.ENCHANT_SIDE, bottom: T.OBSIDIAN }, hardness: 5, tool: 'pickaxe', minLevel: 1, interactive: 'enchant', light: 7, sound: 'stone' });
block('bookshelf', { cn: '书架', en: 'Bookshelf', tex: { top: T.PLANKS, side: T.BOOKSHELF, bottom: T.PLANKS }, hardness: 1.5, tool: 'axe', burn: 1, sound: 'wood' });
block('torch', { cn: '火把', en: 'Torch', tex: { all: T.TORCH }, hardness: 0, shape: 'torch', solid: false, opaque: false, transparent: true, light: 14, sound: 'wood', washable: true });
block('tnt', { cn: 'TNT', en: 'TNT', tex: { top: T.TNT_TOP, side: T.TNT_SIDE, bottom: T.TNT_SIDE }, hardness: 0, sound: 'grass', hasState: true, interactive: 'ignite' });
block('redstone_dust', {
  cn: '红石粉线', en: 'Redstone Dust', tex: { all: T.DUST_OFF }, hardness: 0, shape: 'flat', solid: false, opaque: false,
  transparent: true, sound: 'stone', drops: ['redstone'], hasState: true, interactive: 'redstone', redstone: 'dust', washable: true,
});
block('lever', { cn: '拉杆', en: 'Lever', tex: { all: T.LEVER }, hardness: 0.5, shape: 'flat', solid: false, opaque: false, transparent: true, sound: 'stone', hasState: true, interactive: 'redstone', redstone: 'source', washable: true });
block('stone_button', { cn: '石按钮', en: 'Button', tex: { all: T.BUTTON }, hardness: 0.5, shape: 'flat', solid: false, opaque: false, transparent: true, sound: 'stone', hasState: true, interactive: 'redstone', redstone: 'source', washable: true });
block('pressure_plate', { cn: '压力板', en: 'Pressure Plate', tex: { all: T.PLATE }, hardness: 0.5, shape: 'flat', solid: false, opaque: false, transparent: true, sound: 'stone', hasState: true, redstone: 'source', washable: true });
block('repeater', { cn: '红石中继器', en: 'Repeater', tex: { all: T.REPEATER_OFF }, hardness: 0.5, shape: 'flat', solid: false, opaque: false, transparent: true, sound: 'stone', hasState: true, interactive: 'redstone', redstone: 'repeater', washable: true });
block('redstone_lamp', { cn: '红石灯', en: 'Redstone Lamp', tex: { all: T.LAMP_OFF }, hardness: 0.3, sound: 'glass', hasState: true, redstone: 'consumer' });
block('piston', { cn: '活塞', en: 'Piston', tex: { top: T.PISTON_TOP, side: T.PISTON_SIDE, bottom: T.PISTON_TOP }, hardness: 1.5, tool: 'pickaxe', sound: 'stone', hasState: true, redstone: 'consumer' });
block('piston_head', { cn: '活塞臂', en: 'Piston Head', tex: { top: T.PISTON_FACE, side: T.PISTON_FACE, bottom: T.PISTON_TOP }, hardness: 1.5, tool: 'pickaxe', sound: 'stone', drops: [] });
block('farmland_seed', { cn: '小麦', en: 'Wheat Crop', tex: { all: T.WHEAT0 }, hardness: 0, shape: 'crop', solid: false, opaque: false, transparent: true, sound: 'grass', hasState: true, drops: ['seeds'], interactive: 'harvest', washable: true });
block('flower_red', { cn: '虞美人', en: 'Poppy', tex: { all: T.FLOWER_RED }, hardness: 0, shape: 'cross', solid: false, opaque: false, transparent: true, sound: 'grass', washable: true, drops: [] });
block('flower_yellow', { cn: '蒲公英', en: 'Dandelion', tex: { all: T.FLOWER_YELLOW }, hardness: 0, shape: 'cross', solid: false, opaque: false, transparent: true, sound: 'grass', washable: true, drops: [] });
block('tall_grass', { cn: '草', en: 'Grass', tex: { all: T.TALL_GRASS }, hardness: 0, shape: 'cross', solid: false, opaque: false, transparent: true, sound: 'grass', drops: ['seeds'], dropChance: [0.4], tint: 'grass', washable: true });
block('dead_bush', { cn: '枯木丛', en: 'Dead Bush', tex: { all: T.DEAD_BUSH }, hardness: 0, shape: 'cross', solid: false, opaque: false, transparent: true, sound: 'grass', drops: ['stick'], dropChance: [0.5], washable: true });
block('cactus', { cn: '仙人掌', en: 'Cactus', tex: { top: T.CACTUS_TOP, side: T.CACTUS_SIDE, bottom: T.CACTUS_TOP }, hardness: 0.4, sound: 'grass', damage: 1, shape: 'cactus' });
block('wool_white', { cn: '白色羊毛', en: 'White Wool', tex: { all: T.WOOL_WHITE }, hardness: 0.8, sound: 'wool', burn: 1 });
block('wool_red', { cn: '红色羊毛', en: 'Red Wool', tex: { all: T.WOOL_RED }, hardness: 0.8, sound: 'wool', burn: 1 });
block('wool_yellow', { cn: '黄色羊毛', en: 'Yellow Wool', tex: { all: T.WOOL_YELLOW }, hardness: 0.8, sound: 'wool', burn: 1 });
block('wool_green', { cn: '绿色羊毛', en: 'Green Wool', tex: { all: T.WOOL_GREEN }, hardness: 0.8, sound: 'wool', burn: 1 });
block('wool_blue', { cn: '蓝色羊毛', en: 'Blue Wool', tex: { all: T.WOOL_BLUE }, hardness: 0.8, sound: 'wool', burn: 1 });
block('wool_black', { cn: '黑色羊毛', en: 'Black Wool', tex: { all: T.WOOL_BLACK }, hardness: 0.8, sound: 'wool', burn: 1 });
block('bed', { cn: '床', en: 'Bed', tex: { top: T.BED_TOP, side: T.BED_SIDE, bottom: T.PLANKS }, hardness: 0.2, shape: 'bed', sound: 'wool', interactive: 'sleep' });

/* ---------- 下界方块 ---------- */
block('netherrack', { cn: '下界岩', en: 'Netherrack', tex: { all: T.NETHERRACK }, hardness: 0.4, tool: 'pickaxe', minLevel: 1, sound: 'stone' });
block('soul_sand', { cn: '灵魂沙', en: 'Soul Sand', tex: { all: T.SOUL_SAND }, hardness: 0.5, tool: 'shovel', sound: 'sand' });
block('magma_block', { cn: '岩浆块', en: 'Magma Block', tex: { all: T.MAGMA_BLOCK }, hardness: 0.5, tool: 'pickaxe', minLevel: 1, light: 3, damage: 1, sound: 'stone' });
block('nether_bricks', { cn: '下界砖块', en: 'Nether Bricks', tex: { all: T.NETHER_BRICKS }, hardness: 2, tool: 'pickaxe', minLevel: 1, sound: 'stone' });
block('nether_quartz_ore', { cn: '下界石英矿石', en: 'Nether Quartz Ore', tex: { all: T.NETHER_QUARTZ_ORE }, hardness: 3, tool: 'pickaxe', minLevel: 1, drops: ['quartz'], xp: 1, sound: 'stone' });
block('fire', {
  cn: '火', en: 'Fire', tex: { all: T.FIRE }, shape: 'cross', solid: false, opaque: false, transparent: true,
  hardness: 0, light: 15, damage: 1.2, drops: [], sound: 'grass', replaceable: false, washable: true,
});
block('crying_obsidian', { cn: '哭泣的黑曜石', en: 'Crying Obsidian', tex: { all: T.CRYING_OBSIDIAN }, hardness: 50, tool: 'pickaxe', minLevel: 4, blast: 1200, light: 10 });
block('nether_portal', {
  cn: '下界传送门', en: 'Nether Portal', tex: { all: T.NETHER_PORTAL }, shape: 'portal', solid: false, opaque: false,
  transparent: true, hardness: Infinity, drops: [], light: 11, sound: 'glass', noCollide: true,
});

/* ---------- 末地方块 ---------- */
block('end_stone', { cn: '末地石', en: 'End Stone', tex: { all: T.END_STONE }, hardness: 3, tool: 'pickaxe', minLevel: 1, sound: 'stone' });
block('end_portal_frame', {
  cn: '末地传送门框架', en: 'End Portal Frame', tex: { top: T.END_PORTAL_FRAME_TOP, side: T.END_PORTAL_FRAME_SIDE, bottom: T.END_PORTAL_FRAME_SIDE },
  hardness: 5, tool: 'pickaxe', minLevel: 3, drops: [], sound: 'stone', hasState: true, interactive: 'end_frame',
});
block('end_portal', {
  cn: '末地传送门', en: 'End Portal', tex: { all: T.END_PORTAL }, shape: 'portal', solid: false, opaque: false,
  transparent: true, hardness: Infinity, drops: [], light: 15, sound: 'glass', noCollide: true,
});
block('dragon_egg', { cn: '龙蛋', en: 'Dragon Egg', tex: { all: T.DRAGON_EGG }, hardness: 3, light: 3, sound: 'stone' });

/* ---------- 末地城方块 ---------- */
block('purpur_block', { cn: '紫珀块', en: 'Purpur Block', tex: { all: T.PURPUR_BLOCK }, hardness: 1.5, tool: 'pickaxe', minLevel: 1, sound: 'stone' });
block('purpur_pillar', { cn: '紫珀柱', en: 'Purpur Pillar', tex: { top: T.PURPUR_PILLAR_TOP, side: T.PURPUR_PILLAR_SIDE, bottom: T.PURPUR_PILLAR_TOP }, hardness: 1.5, tool: 'pickaxe', minLevel: 1, sound: 'stone' });
block('end_stone_bricks', { cn: '末地石砖', en: 'End Stone Bricks', tex: { all: T.END_STONE_BRICKS }, hardness: 3, tool: 'pickaxe', minLevel: 1, sound: 'stone' });
block('end_rod', { cn: '末地烛', en: 'End Rod', tex: { all: T.END_ROD }, shape: 'torch', solid: false, opaque: false, transparent: true, hardness: 0, light: 14, sound: 'wood', washable: true });
block('shulker_box', {
  cn: '潜影盒', en: 'Shulker Box', tex: { top: T.SHULKER_SHELL_TOP, side: T.SHULKER_BOX, bottom: T.SHULKER_BOX },
  hardness: 2, tool: 'pickaxe', sound: 'wool', interactive: 'shulker', hasState: true, drops: [], portableContainer: 27,
});

/* ============================================================
   物品定义（非方块）
   ============================================================ */
const ITEMS = {};
function item(id, def) { ITEMS[id] = Object.assign({ id, cn: id, stack: 64 }, def); return ITEMS[id]; }

const TOOL_MATS = {
  wood: { cn: '木', speed: 2, dur: 60, dmg: 1, level: 1, art: 'wood' },
  stone: { cn: '石', speed: 4, dur: 132, dmg: 2, level: 2, art: 'stone' },
  iron: { cn: '铁', speed: 6, dur: 251, dmg: 3, level: 3, art: 'iron' },
  diamond: { cn: '钻石', speed: 8, dur: 1562, dmg: 4, level: 4, art: 'diamond' },
  gold: { cn: '金', speed: 12, dur: 33, dmg: 1, level: 1, art: 'gold' },
};
const TOOL_MAT_ITEM = { wood: 'oak_planks', stone: 'cobblestone', iron: 'iron_ingot', diamond: 'diamond', gold: 'gold_ingot' };
const TOOL_KINDS = {
  pickaxe: { cn: '镐', type: 'pickaxe', dmg: 2 },
  axe: { cn: '斧', type: 'axe', dmg: 3 },
  shovel: { cn: '锹', type: 'shovel', dmg: 1.5 },
  hoe: { cn: '锄', type: 'hoe', dmg: 1 },
  sword: { cn: '剑', type: 'sword', dmg: 4, damage: { wood: 4, stone: 5, iron: 6, diamond: 7, gold: 4 } },
};
for (const mk in TOOL_MATS) {
  const m = TOOL_MATS[mk];
  for (const tk in TOOL_KINDS) {
    const k = TOOL_KINDS[kindSafe(tk)];
    item(mk + '_' + tk, {
      cn: m.cn + k.cn, en: mk + ' ' + tk, stack: 1, toolArt: tk, mat: mk, tier: m.level,
      speed: m.speed, durability: m.dur, damage: (k.damage ? k.damage[mk] : k.dmg) + 1,
      toolType: k.type,
    });
  }
}
function kindSafe(k) { return k; }

const ARMOR_MATS = {
  leather: { cn: '皮革', def: [1, 3, 2, 1], dur: 80, art: '#a87d45' },
  iron: { cn: '铁', def: [2, 6, 5, 2], dur: 240, art: 'iron' },
  diamond: { cn: '钻石', def: [3, 8, 6, 3], dur: 528, art: 'diamond' },
};
const ARMOR_SLOTS = [['helmet', '头盔', 0.15], ['chestplate', '胸甲', 0.25], ['leggings', '护腿', 0.22], ['boots', '靴子', 0.1]];
const ARMOR_MAT_ITEM = { leather: 'leather', iron: 'iron_ingot', diamond: 'diamond' };
for (const mk in ARMOR_MATS) {
  const m = ARMOR_MATS[mk];
  ARMOR_SLOTS.forEach(([slot, cn, durMul], i) => {
    item(mk + '_' + slot, {
      cn: m.cn + cn, en: mk + ' ' + slot, stack: 1, armorArt: slot, mat: mk, slot: i,
      defense: m.def[i], durability: Math.round(m.dur * durMul * 4), armor: true,
    });
  });
}

item('stick', { cn: '木棍', en: 'Stick', fuel: 0.5 });
item('coal', { cn: '煤炭', en: 'Coal', fuel: 8 });
item('charcoal', { cn: '木炭', en: 'Charcoal', fuel: 8 });
item('raw_iron', { cn: '粗铁', en: 'Raw Iron' });
item('iron_ingot', { cn: '铁锭', en: 'Iron Ingot' });
item('raw_gold', { cn: '粗金', en: 'Raw Gold' });
item('gold_ingot', { cn: '金锭', en: 'Gold Ingot' });
item('diamond', { cn: '钻石', en: 'Diamond' });
item('emerald', { cn: '绿宝石', en: 'Emerald' });
item('redstone', { cn: '红石', en: 'Redstone' });
item('flint', { cn: '燧石', en: 'Flint' });
item('clay_ball', { cn: '粘土球', en: 'Clay Ball' });
item('brick', { cn: '红砖', en: 'Brick' });
item('string', { cn: '线', en: 'String' });
item('bone', { cn: '骨头', en: 'Bone' });
item('gunpowder', { cn: '火药', en: 'Gunpowder' });
item('feather', { cn: '羽毛', en: 'Feather' });
item('leather', { cn: '皮革', en: 'Leather' });
item('egg', { cn: '鸡蛋', en: 'Egg', stack: 16 });
item('arrow', { cn: '箭', en: 'Arrow' });
item('bow', { cn: '弓', en: 'Bow', stack: 1, durability: 384, toolArt: 'bow', ranged: true });
item('flint_and_steel', { cn: '打火石', en: 'Flint and Steel', stack: 1, durability: 64, use: 'ignite' });
item('seeds', { cn: '小麦种子', en: 'Wheat Seeds' });
item('wheat', { cn: '小麦', en: 'Wheat' });
item('bread', { cn: '面包', en: 'Bread', food: 5, heal: 0 });
item('apple', { cn: '苹果', en: 'Apple', food: 4 });
item('raw_porkchop', { cn: '生猪排', en: 'Raw Porkchop', food: 3 });
item('cooked_porkchop', { cn: '熟猪排', en: 'Cooked Porkchop', food: 8 });
item('raw_beef', { cn: '生牛肉', en: 'Raw Beef', food: 3 });
item('steak', { cn: '牛排', en: 'Steak', food: 8 });
item('raw_chicken', { cn: '生鸡肉', en: 'Raw Chicken', food: 2 });
item('cooked_chicken', { cn: '熟鸡肉', en: 'Cooked Chicken', food: 6 });
item('rotten_flesh', { cn: '腐肉', en: 'Rotten Flesh', food: 4, poison: true });
item('bucket', { cn: '桶', en: 'Bucket', stack: 1 });
item('water_bucket', { cn: '水桶', en: 'Water Bucket', stack: 1, placeLiquid: 'water' });
item('lava_bucket', { cn: '岩浆桶', en: 'Lava Bucket', stack: 1, placeLiquid: 'lava', fuel: 100 });
item('quartz', { cn: '下界石英', en: 'Nether Quartz' });
item('ender_pearl', { cn: '末影珍珠', en: 'Ender Pearl', stack: 16, throwTeleport: true });
item('blaze_rod', { cn: '烈焰棒', en: 'Blaze Rod' });
item('blaze_powder', { cn: '烈焰粉', en: 'Blaze Powder' });
item('eye_of_ender', { cn: '末影之眼', en: 'Eye of Ender', stack: 16, use: 'eye' });
item('shulker_shell', { cn: '潜影壳', en: 'Shulker Shell' });
item('elytra', { cn: '鞘翅', en: 'Elytra', stack: 1, durability: 432, elytra: true, slot: 1, armor: true, defense: 0, glide: true });

/* ---------- 方块 → 物品 映射 ---------- */
function itemDef(id) {
  if (ITEMS[id]) return ITEMS[id];
  if (B[id] !== undefined && id !== 'air') {
    const bd = BLOCKS[B[id]];
    return { id, cn: bd.cn, en: bd.en, block: B[id], stack: bd.stack || 64 };
  }
  return null;
}
function itemName(id) { const d = itemDef(id); return d ? d.cn : id; }
function isBlockItem(id) { return B[id] !== undefined && id !== 'air'; }

/* 创造模式物品栏 */
const CREATIVE_TABS = [
  { name: '建筑', items: ['grass_block', 'dirt', 'stone', 'cobblestone', 'stone_brick', 'brick_block', 'sandstone', 'sand', 'gravel', 'clay', 'oak_log', 'oak_planks', 'birch_planks', 'spruce_planks', 'glass', 'obsidian', 'wool_white', 'wool_red', 'wool_yellow', 'wool_green', 'wool_blue', 'wool_black', 'bookshelf', 'ice', 'snow_block', 'glowstone'] },
  { name: '自然', items: ['grass_block', 'oak_leaves', 'birch_leaves', 'spruce_leaves', 'cactus', 'tall_grass', 'flower_red', 'flower_yellow', 'water', 'lava', 'bedrock', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'redstone_ore', 'emerald_ore'] },
  { name: '下界', items: ['netherrack', 'soul_sand', 'magma_block', 'nether_bricks', 'nether_quartz_ore', 'glowstone', 'fire', 'obsidian', 'crying_obsidian', 'nether_portal', 'quartz', 'blaze_rod', 'blaze_powder'] },
  { name: '末地', items: ['end_stone', 'end_portal_frame', 'end_portal', 'dragon_egg', 'ender_pearl', 'eye_of_ender', 'obsidian'] },
  { name: '红石', items: ['redstone_dust', 'redstone_lamp', 'repeater', 'lever', 'stone_button', 'pressure_plate', 'piston', 'tnt', 'redstone', 'torch'] },
  { name: '功能', items: ['crafting_table', 'furnace', 'chest', 'enchanting_table', 'bed', 'bucket', 'water_bucket', 'lava_bucket'] },
  { name: '工具', items: ['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'gold_pickaxe', 'iron_axe', 'diamond_axe', 'iron_shovel', 'diamond_shovel', 'iron_hoe', 'diamond_hoe', 'iron_sword', 'diamond_sword', 'bow', 'arrow', 'flint_and_steel'] },
  { name: '材料', items: ['stick', 'coal', 'charcoal', 'raw_iron', 'iron_ingot', 'raw_gold', 'gold_ingot', 'diamond', 'emerald', 'redstone', 'flint', 'clay_ball', 'brick', 'string', 'bone', 'gunpowder', 'feather', 'leather'] },
  { name: '盔甲食物', items: ['leather_helmet', 'leather_chestplate', 'leather_leggings', 'leather_boots', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots', 'diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots', 'bread', 'apple', 'cooked_porkchop', 'steak', 'cooked_chicken'] },
];

/* ============================================================
   合成配方
   ============================================================ */
const RECIPES = [];
function shaped(out, count, pattern, key) { RECIPES.push({ type: 'shaped', out, count, pattern, key }); }
function shapeless(out, count, ing) { RECIPES.push({ type: 'shapeless', out, count, ing }); }

// 基础
shapeless('oak_planks', 4, ['oak_log']);
shapeless('birch_planks', 4, ['birch_log']);
shapeless('spruce_planks', 4, ['spruce_log']);
shapeless('stick', 4, ['oak_planks', 'oak_planks']);
shaped('crafting_table', 1, ['PP', 'PP'], { P: ['oak_planks', 'birch_planks', 'spruce_planks'] });
shaped('furnace', 1, ['CCC', 'C.C', 'CCC'], { C: ['cobblestone', 'mossy_cobblestone'] });
shaped('chest', 1, ['PPP', 'P.P', 'PPP'], { P: ['oak_planks', 'birch_planks', 'spruce_planks'] });
shaped('torch', 4, ['C', 'S'], { C: ['coal', 'charcoal'], S: ['stick'] });
shapeless('tall_grass_seed_dummy', 1, ['__never__']);
shapeless('seeds', 3, ['tall_grass']);
shapeless('wool_white', 1, ['string', 'string', 'string', 'string']);
shapeless('flint_and_steel', 1, ['iron_ingot', 'flint']);
shapeless('stone_brick', 4, ['stone', 'stone', 'stone', 'stone']);
shapeless('brick_block', 4, ['brick', 'brick', 'brick', 'brick']);
shapeless('coal_block', 1, ['coal', 'coal', 'coal', 'coal', 'coal', 'coal', 'coal', 'coal', 'coal']);
shapeless('iron_block', 1, ['iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot']);
shapeless('gold_block', 1, ['gold_ingot', 'gold_ingot', 'gold_ingot', 'gold_ingot', 'gold_ingot', 'gold_ingot', 'gold_ingot', 'gold_ingot', 'gold_ingot']);
shapeless('diamond_block', 1, ['diamond', 'diamond', 'diamond', 'diamond', 'diamond', 'diamond', 'diamond', 'diamond', 'diamond']);
shapeless('iron_ingot', 9, ['iron_block']);
shapeless('gold_ingot', 9, ['gold_block']);
shapeless('diamond', 9, ['diamond_block']);
shapeless('coal', 9, ['coal_block']);
shapeless('bread', 1, ['wheat', 'wheat', 'wheat']);
shapeless('redstone', 9, ['redstone_block_dummy']);
// 红石
shapeless('lever', 1, ['stick', 'cobblestone']);
shapeless('stone_button', 1, ['stone']);
shapeless('pressure_plate', 1, ['stone', 'stone']);
shapeless('repeater', 1, ['stone', 'stone', 'stone', 'redstone', 'redstone']);
shapeless('redstone_lamp', 1, ['redstone', 'redstone', 'redstone', 'redstone', 'glowstone']);
shaped('piston', 1, ['PPP', 'CIC', 'CRC'], { P: ['oak_planks', 'birch_planks', 'spruce_planks'], C: ['cobblestone'], I: ['iron_ingot'], R: ['redstone'] });
shapeless('tnt', 1, ['gunpowder', 'gunpowder', 'gunpowder', 'gunpowder', 'gunpowder', 'sand', 'sand', 'sand', 'sand']);
shapeless('redstone', 9, ['redstone_block_dummy']);
shapeless('enchanting_table', 1, ['obsidian', 'obsidian', 'obsidian', 'obsidian', 'diamond', 'diamond', 'oak_planks']);
shapeless('bookshelf', 1, ['oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'leather', 'leather', 'leather']);
shaped('bed', 1, ['WWW', 'PPP'], { W: ['wool_white', 'wool_red', 'wool_yellow', 'wool_green', 'wool_blue', 'wool_black'], P: ['oak_planks', 'birch_planks', 'spruce_planks'] });
// 染色羊毛
shapeless('wool_red', 1, ['wool_white', 'flower_red']);
shapeless('wool_yellow', 1, ['wool_white', 'flower_yellow']);
shapeless('wool_green', 1, ['wool_white', 'tall_grass']);
shapeless('wool_blue', 1, ['wool_white', 'emerald']);
// 羊毛 → 线
shapeless('string', 4, ['wool_white']);
// 弓与箭
shaped('bow', 1, [' ST', 'S T', ' ST'], { S: ['stick'], T: ['string'] });
shapeless('arrow', 4, ['flint', 'stick', 'feather']);
// 工具
const TOOL_PATTERNS = {
  pickaxe: [['MMM', '.S.', '.S.'], 3],
  axe: [['MM', 'MS', '.S'], 2],
  shovel: [['.M.', '.S.', '.S.'], 3],
  hoe: [['MM', '.S', '.S'], 2],
  sword: [['M', 'M', 'S'], 1],
};
for (const mk in TOOL_MATS) {
  for (const tk in TOOL_PATTERNS) {
    const [pat, w] = TOOL_PATTERNS[tk];
    shaped(mk + '_' + tk, 1, pat, { M: [TOOL_MAT_ITEM[mk]], S: ['stick'] });
  }
}
// 盔甲
const ARMOR_PATTERNS = {
  helmet: ['MMM', 'M.M'],
  chestplate: ['M.M', 'MMM', 'MMM'],
  leggings: ['MMM', 'M.M', 'M.M'],
  boots: ['M.M', 'M.M'],
};
for (const mk in ARMOR_MATS) {
  for (const slot in ARMOR_PATTERNS) shaped(mk + '_' + slot, 1, ARMOR_PATTERNS[slot], { M: [ARMOR_MAT_ITEM[mk]] });
}
// 清理占位配方
for (let i = RECIPES.length - 1; i >= 0; i--) {
  const r = RECIPES[i];
  const bad = (r.type === 'shapeless' && r.ing.some(x => x.startsWith('__') || x.endsWith('_dummy')));
  if (bad) RECIPES.splice(i, 1);
}

/* ---------- 下界 / 末地相关配方 ---------- */
shapeless('blaze_powder', 2, ['blaze_rod']);
shapeless('eye_of_ender', 1, ['ender_pearl', 'blaze_powder']);
shapeless('nether_bricks', 1, ['netherrack', 'netherrack', 'netherrack', 'netherrack', 'quartz']);
/* 末地城相关 */
shapeless('end_stone_bricks', 4, ['end_stone', 'end_stone', 'end_stone', 'end_stone']);
shapeless('purpur_block', 1, ['quartz', 'quartz', 'quartz', 'quartz', 'ender_pearl']);
shapeless('end_rod', 1, ['blaze_rod', 'quartz', 'quartz']);
shapeless('shulker_box', 1, ['shulker_shell', 'shulker_shell', 'chest']);

// 熔炼配方
const SMELT = {
  raw_iron: { out: 'iron_ingot', xp: 0.7 },
  raw_gold: { out: 'gold_ingot', xp: 1 },
  sand: { out: 'glass', xp: 0.1 },
  clay_ball: { out: 'brick', xp: 0.3 },
  cobblestone: { out: 'stone', xp: 0.1 },
  oak_log: { out: 'charcoal', xp: 0.15 },
  birch_log: { out: 'charcoal', xp: 0.15 },
  spruce_log: { out: 'charcoal', xp: 0.15 },
  raw_porkchop: { out: 'cooked_porkchop', xp: 0.35 },
  raw_beef: { out: 'steak', xp: 0.35 },
  raw_chicken: { out: 'cooked_chicken', xp: 0.35 },
  iron_ore: { out: 'iron_ingot', xp: 0.7 },
  gold_ore: { out: 'gold_ingot', xp: 1 },
};
const FUEL = { coal: 8, charcoal: 8, oak_planks: 1.5, birch_planks: 1.5, spruce_planks: 1.5, oak_log: 1.5, birch_log: 1.5, spruce_log: 1.5, stick: 0.5, coal_block: 80, lava_bucket: 100, crafting_table: 1.5, chest: 1.5, bookshelf: 1.5, bed: 1.5 };

/* 成就 */
const ACHIEVEMENTS = [
  { id: 'wood', cn: '伐木工', desc: '获得一块原木', emoji: '🪓' },
  { id: 'table', cn: '第一张工作台', desc: '合成一个工作台', emoji: '🧰' },
  { id: 'pick', cn: '开山凿石', desc: '合成一把镐子', emoji: '⛏️' },
  { id: 'stone', cn: '石来运转', desc: '挖到圆石', emoji: '🪨' },
  { id: 'furnace', cn: '熔炉达人', desc: '合成熔炉并熔炼出铁锭', emoji: '🔥' },
  { id: 'iron', cn: '铁器时代', desc: '合成任意铁制工具', emoji: '⚙️' },
  { id: 'diamond', cn: '钻石！', desc: '挖到一颗钻石', emoji: '💎' },
  { id: 'diamond_pick', cn: '钻石镐', desc: '合成钻石镐', emoji: '✨' },
  { id: 'hunt', cn: '猎手', desc: '击杀一只动物获得食物', emoji: '🍖' },
  { id: 'zombie', cn: '怪物猎人', desc: '击杀一只僵尸', emoji: '🧟' },
  { id: 'creeper', cn: '苦力怕再见', desc: '在爆炸前击杀苦力怕', emoji: '💥' },
  { id: 'armor', cn: '全副武装', desc: '装备一件盔甲', emoji: '🛡️' },
  { id: 'farm', cn: '农夫', desc: '收获成熟的小麦', emoji: '🌾' },
  { id: 'bread', cn: '烤面包', desc: '合成一个面包', emoji: '🍞' },
  { id: 'torch', cn: '点亮黑暗', desc: '放置一个火把', emoji: '🕯️' },
  { id: 'shelter', cn: '安家落户', desc: '放置 30 个方块', emoji: '🏠' },
  { id: 'redstone', cn: '电力时代', desc: '点亮红石灯', emoji: '🔴' },
  { id: 'tnt', cn: '轰！', desc: '引爆一个 TNT', emoji: '🧨' },
  { id: 'bed', cn: '睡个好觉', desc: '合成并使用床跳过夜晚', emoji: '🛏️' },
  { id: 'enchant', cn: '附魔师', desc: '给物品附魔', emoji: '🔮' },
  { id: 'bow', cn: '神射手', desc: '用弓箭击杀怪物', emoji: '🏹' },
  { id: 'deep', cn: '探险家', desc: '到达 y<20 的地下', emoji: '🕳️' },
  { id: 'day3', cn: '幸存者', desc: '生存到第 3 天', emoji: '🌗' },
  { id: 'portal', cn: '点燃传送门', desc: '用打火石点燃黑曜石框', emoji: '🌀' },
  { id: 'nether', cn: '下界之旅', desc: '通过传送门进入下界', emoji: '🔥' },
  { id: 'blaze', cn: '烈焰之力', desc: '获得烈焰棒', emoji: '✨' },
  { id: 'end_portal', cn: '末地之门', desc: '用末影之眼激活末地传送门', emoji: '👁️' },
  { id: 'end', cn: '进入末地', desc: '穿过末地传送门', emoji: '🌌' },
  { id: 'dragon', cn: '屠龙者', desc: '击败末影龙', emoji: '🐲' },
  { id: 'crystal', cn: '水晶破坏者', desc: '摧毁一颗末影水晶', emoji: '💠' },
  { id: 'endcity', cn: '末地城探险家', desc: '找到一座末地城', emoji: '🏯' },
  { id: 'shulker', cn: '小心头顶', desc: '击杀一只潜影贝', emoji: '🐚' },
  { id: 'elytra', cn: '展翅高飞', desc: '获得鞘翅', emoji: '🪂' },
];
