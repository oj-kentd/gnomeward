/** Original Gnomeward tuning. Coordinates are shared by Blender scenes and simulation. */
const creekPaths = [
  [[-12,-5],[-8,-5],[-8,-1],[-4,-1],[-4,-5],[-1,-5],[-1,0],[5,0],[5,-5],[9,-5],[9,4],[12,4]],
  [[-12,5],[-7,5],[-7,2],[-1,2],[-1,0],[5,0],[5,-5],[9,-5],[9,4],[12,4]],
];
const crossingPaths = [
  [[-12,-5],[-8,-5],[-8,4],[-3,4],[-3,0],[0,0],[0,5],[5,5],[5,2],[10,2],[10,6],[12,6]],
  [[12,-5],[8,-5],[8,-1],[3,-1],[3,0],[0,0],[0,5],[5,5],[5,2],[10,2],[10,6],[12,6]],
];
export const MAPS = [
  { id: 'meadow', name: 'Mossy Meadow', subtitle: 'A gentle first adventure', topology: 'Winding', difficulty: 'Easy', description: 'A long garden trail with generous bends. A lovely place to learn.', color: '#88b65d', path: [[-12,4],[-7,4],[-7,-4],[-1,-4],[-1,3],[5,3],[5,-3],[12,-3]] },
  { id: 'orchard', name: 'Amber Orchard', subtitle: 'Twice around the apple trees', topology: 'Figure eight', difficulty: 'Easy', description: 'Two orchard loops revisit the same junctions before the final turn home. Cover their shared center.', color: '#b2aa50', path: [[-12,0],[-8,0],[-8,-5],[-2,-5],[-2,0],[-8,0],[-8,5],[-2,5],[-2,0],[4,0],[4,-5],[9,-5],[9,3],[12,3]] },
  { id: 'creek', name: 'Moonlit Creek', subtitle: 'Two trails, one riverside gate', topology: 'Two entrances', difficulty: 'Medium', description: 'Skeletons alternate between the north and south riverbanks. Both trails join a winding final stretch.', color: '#54888b', path: creekPaths[0], paths: creekPaths },
  { id: 'quarry', name: 'Crystal Quarry', subtitle: 'Treasures below the stone', topology: 'Switchbacks', difficulty: 'Hard', description: 'A short, angular trail leaves little time. Explosions shine in the narrow bends.', color: '#8c819d', path: [[-12,-4],[-5,-4],[-5,3],[2,3],[2,-3],[7,-3],[7,2],[12,2]] },
  { id: 'hollow', name: 'Pumpkin Hollow', subtitle: 'Into the pumpkin spiral', topology: 'Spiral', difficulty: 'Medium', description: 'A broad outer circuit curls into a tight inner spiral before escaping along the garden edge.', color: '#967951', path: [[-12,6],[-9,6],[-9,-6],[9,-6],[9,4],[-5,4],[-5,-2],[4,-2],[4,1],[0,1],[0,6],[12,6]] },
  { id: 'crossroads', name: 'Twinbrook Crossing', subtitle: 'Guard both sides of the brook', topology: 'Two entrances', difficulty: 'Hard', description: 'Enemies arrive from opposite sides on unequal trails. Guard the meeting point and the final zigzag.', color: '#669c91', path: crossingPaths[0], paths: crossingPaths },
];

/** Shared cottage and door coordinates for models and reborn-gnome departures. */
export function cottagePosition(map, routeIndex = 0) {
  const path = (map.paths || [map.path])[routeIndex] || map.path;
  const [x, z] = path.at(-1);
  return { x: Math.max(-11.3, Math.min(11.3, x)), z: Math.max(-7, Math.min(7, z + 1.4)) };
}
export function cottageDoorPosition(map, routeIndex = 0) {
  const house = cottagePosition(map, routeIndex);
  return { x: house.x, z: house.z + 0.65 };
}

export const SECRETS = {
  hollow: { unit: 'necro', order: ['hollow-moon', 'hollow-star', 'hollow-leaf', 'hollow-flame'], spots: [
    { id: 'hollow-moon', symbol: 'moon', x: -11, z: -2, color: '#d6b86d' },
    { id: 'hollow-star', symbol: 'star', x: 6.5, z: 1.5, color: '#dbc781' },
    { id: 'hollow-leaf', symbol: 'leaf', x: -6.6, z: 6.9, color: '#a2b878' },
    { id: 'hollow-flame', symbol: 'flame', x: 11, z: -3, color: '#cb8662' },
  ] },
  meadow: { unit: 'gravity', spots: [
    { id: 'meadow-moon', x: -4, z: -1, color: '#ad8cff' },
    { id: 'meadow-star', x: 2, z: -1, color: '#d7b6ff' },
    { id: 'meadow-orbit', x: 8, z: 1, color: '#8865db' },
  ] },
  quarry: { unit: 'crystal', spots: [
    { id: 'quarry-rose', x: -2, z: -1, color: '#f291bd' },
    { id: 'quarry-sky', x: 4, z: -5, color: '#84dded' },
    { id: 'quarry-sun', x: 5, z: 0, color: '#f4d077' },
  ], summon: { x: 4, z: -1 } },
};

const path = (id, name, description, costs = [10, 24, 48]) => ({ id, name, description, costs });
export const TOWERS = {
  sprout: { id: 'sprout', name: 'Sprout', role: 'Growing guardian', description: 'A small pebble, a big heart. Starts gently and grows into a mighty guardian.', cost: 100, color: '#d86b47', unlockWave: 0, paths: [path('power','Mighty Pebbles','Much more damage with every upgrade.'),path('speed','Busy Hands','Throw pebbles more often.'),path('range','Eagle Eyes','Reach farther across the garden.'),path('growth','Growing Spirit','Gain damage as this gnome defeats skeletons.')] },
  spore: { id: 'spore', name: 'Morel', role: 'Poison gardener', description: 'Plants mushrooms on the trail. Passing skeletons catch a lingering poison.', cost: 160, color: '#a589d5', unlockWave: 0, paths: [path('venom','Potent Spores','Increase poison damage each second.'),path('duration','Deep Roots','Poison lasts longer; mushrooms can affect more skeletons.'),path('speed','Fast Harvest','Plant mushrooms more often.'),path('range','Wild Garden','Plant farther away. Tier 1 lets poisoned skeletons infect nearby enemies once per second; higher tiers spread farther and infect more targets. Secondary infections do not spread.')] },
  boom: { id: 'boom', name: 'Bramble', role: 'Chain-reaction expert', description: 'Defeated skeletons burst into sparks, damaging their nearby friends.', cost: 210, color: '#e5a742', unlockWave: 0, paths: [path('power','Heavy Acorns','Increase the damage of direct attacks.'),path('blast','Big Bang','Bigger and stronger on-kill explosions.'),path('speed','Quick Fuse','Fire acorns more often.'),path('range','Long Toss','Increase attack range.')] },
  stun: { id: 'stun', name: 'Poppy', role: 'Bubble blaster', description: 'A pink bubble gun slows skeletons to half speed for 2 seconds. Defeat the wave 10 boss to unlock.', cost: 240, color: '#ec85b4', unlockWave: 10, paths: [path('stun','Sticky Bubbles','Keep skeletons slowed for longer. Extra hits refresh the effect without stacking.'),path('speed','Bubble Stream','Shoot bubbles more often.'),path('power','Pop Power','Increase bubble damage.'),path('range','Bubble Reach','Increase attack range.')] },
  multi: { id: 'multi', name: 'Tumble', role: 'Many little surprises', description: 'Attacks several skeletons at once. One special path improves damage, speed, and target count. Clear wave 15 to unlock.', cost: 290, color: '#64b7bb', unlockWave: 15, paths: [path('flurry','Whirling Wonders','More targets, more damage, faster attacks.',[20,45,80])] },
  sniper: { id: 'sniper', name: 'Aster', role: 'Watchful sharpshooter', description: 'Sees the entire map. Starts with low damage; build for power, speed, or a little of both. Defeat the final boss to unlock.', cost: 300, color: '#7d98d1', unlockWave: 20, paths: [path('power','Meteor Shots','Greatly increase damage per shot.',[15,35,65]),path('speed','Starlight Stream','Greatly increase shooting speed.',[15,35,65])] },
  gravity: { id: 'gravity', name: 'Orbit', role: 'Gravity gardener', description: 'Opens a short-lived gravity well behind skeletons, tugging them back along the trail. Find three hidden moonstones in Mossy Meadow.', cost: 320, color: '#9a7be7', unlockWave: 0, unlockSecret: 'meadow', paths: [path('horizon','Event Horizon','Stronger pull and damage. Tier 3 captures skeletons at the center until the well closes.',[18,36,75]),path('duration','Lingering Gravity','Wells last longer, followed by a longer recovery.'),path('radius','Wide Orbit','Pull from farther along the trail and reach farther.'),path('recharge','Cosmic Rhythm','Recover sooner between wells. Always at least five seconds between active wells.')] },
  crystal: { id: 'crystal', name: 'Prism', role: 'Crystal architect', description: 'Raises crystals ahead of skeletons. They must break through to continue. Find three hidden gems in Crystal Quarry to summon your first Prism for free.', cost: 280, color: '#6ad7de', unlockWave: 0, unlockSecret: 'quarry', paths: [path('durability','Diamond Walls','Raise stronger, longer-lasting crystal barriers.'),path('volatile','Shattering Light','Crystals explode when enemies destroy them. Expired crystals fade safely.'),path('speed','Crystal Bloom','Raise replacement crystals sooner.'),path('range','Prismatic Reach','Raise crystals farther away.')] },

  necro: { id: 'necro', name: 'Morrow', role: 'Necromancer', description: 'Spell defeats call reborn gnomes from the cottage to march against the skeletons. Follow the cottage clue in Pumpkin Hollow to find this secret guardian.', cost: 300, color: '#9ba3d8', unlockWave: 0, unlockSecret: 'hollow', paths: [path('champions','Reborn Champions','Reborn gnomes gain more health and stronger melee attacks.'),path('procession','Soul Procession','Dispatch gnomes sooner, support a larger group, and march faster.'),path('gravecraft','Gravecraft','Cast stronger spells more often and reach farther.')] },

};

export const ENEMIES = {
  bone: { id: 'bone', attackDamage: 9, name: 'Ivory skeleton', color: '#eee8cf', hp: 13, speed: 1.35, reward: 6, leak: 1 },
  green: { id: 'green', attackDamage: 12, name: 'Moss skeleton', color: '#9cce71', hp: 28, speed: 1.20, reward: 8, leak: 2 },
  blue: { id: 'blue', attackDamage: 15, name: 'Frost skeleton', color: '#76bce7', hp: 48, speed: 1.50, reward: 10, leak: 3 },
  red: { id: 'red', attackDamage: 20, name: 'Ember skeleton', color: '#ed8376', hp: 82, speed: 1.13, reward: 12, leak: 4 },
  purple: { id: 'purple', attackDamage: 25, name: 'Amethyst skeleton', color: '#bb89e0', hp: 130, speed: 1.32, reward: 15, leak: 5 },
  gold: { id: 'gold', attackDamage: 32, name: 'Golden skeleton', color: '#f4cd72', hp: 205, speed: 1.00, reward: 20, leak: 7 },
  boss: { id: 'boss', attackDamage: 100, name: 'The Bone Baron', color: '#dfb666', hp: 1400, speed: 0.65, reward: 220, leak: 30, boss: true },
  king: { id: 'king', attackDamage: 180, name: 'The Skeleton King', color: '#cf88ce', hp: 4400, speed: 0.62, reward: 400, leak: 60, boss: true },
};
