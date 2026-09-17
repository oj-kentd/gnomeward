/** Original Gnomeward tuning. Coordinates are shared by Blender scenes and simulation. */
export const MAPS = [
  { id: 'meadow', name: 'Mossy Meadow', subtitle: 'A gentle first adventure', difficulty: 'Easy', description: 'A long garden trail with generous bends. A lovely place to learn.', color: '#88b65d', path: [[-12,4],[-7,4],[-7,-4],[-1,-4],[-1,3],[5,3],[5,-3],[12,-3]] },
  { id: 'orchard', name: 'Amber Orchard', subtitle: 'Among the apple trees', difficulty: 'Easy', description: 'A winding orchard road brings skeletons past your gnomes again and again.', color: '#b2aa50', path: [[-12,-5],[-8,-5],[-8,4],[-3,4],[-3,-4],[3,-4],[3,4],[8,4],[8,-3],[12,-3]] },
  { id: 'creek', name: 'Moonlit Creek', subtitle: 'Hold the riverside', difficulty: 'Medium', description: 'A twisting riverside route. Cover the central crossing with overlapping attacks.', color: '#54888b', path: [[-12,5],[-6,5],[-6,0],[-9,0],[-9,-5],[0,-5],[0,4],[7,4],[7,-2],[12,-2]] },
  { id: 'quarry', name: 'Crystal Quarry', subtitle: 'Treasures below the stone', difficulty: 'Hard', description: 'A short, angular trail leaves little time. Explosions shine in the narrow bends.', color: '#8c819d', path: [[-12,-4],[-5,-4],[-5,3],[2,3],[2,-3],[7,-3],[7,2],[12,2]] },
  { id: 'hollow', name: 'Pumpkin Hollow', subtitle: 'The midnight garden', difficulty: 'Hard', description: 'Guard a compact spiral in the pumpkin patch. Your last line of defense matters.', color: '#967951', path: [[-12,5],[-8,5],[-8,-5],[7,-5],[7,4],[-2,4],[-2,0],[12,0]] },
];

const path = (id, name, description, costs = [10, 24, 48]) => ({ id, name, description, costs });
export const TOWERS = {
  sprout: { id: 'sprout', name: 'Sprout', role: 'Growing guardian', description: 'A small pebble, a big heart. Starts gently and grows into a mighty guardian.', cost: 100, color: '#d86b47', unlockWave: 0, paths: [path('power','Mighty Pebbles','Much more damage with every upgrade.'),path('speed','Busy Hands','Throw pebbles more often.'),path('range','Eagle Eyes','Reach farther across the garden.'),path('growth','Growing Spirit','Gain damage as this gnome defeats skeletons.')] },
  spore: { id: 'spore', name: 'Morel', role: 'Poison gardener', description: 'Plants mushrooms on the trail. Passing skeletons catch a lingering poison.', cost: 160, color: '#a589d5', unlockWave: 0, paths: [path('venom','Potent Spores','Increase poison damage each second.'),path('duration','Deep Roots','Poison lasts longer; mushrooms can affect more skeletons.'),path('speed','Fast Harvest','Plant mushrooms more often.'),path('range','Wild Garden','Plant farther away and spread poison around each mushroom.')] },
  boom: { id: 'boom', name: 'Bramble', role: 'Chain-reaction expert', description: 'Defeated skeletons burst into sparks, damaging their nearby friends.', cost: 210, color: '#e5a742', unlockWave: 0, paths: [path('power','Heavy Acorns','Increase the damage of direct attacks.'),path('blast','Big Bang','Bigger and stronger on-kill explosions.'),path('speed','Quick Fuse','Fire acorns more often.'),path('range','Long Toss','Increase attack range.')] },
  stun: { id: 'stun', name: 'Poppy', role: 'Bubble blaster', description: 'A pink bubble gun slows skeletons to half speed for 2 seconds. Defeat the wave 10 boss to unlock.', cost: 240, color: '#ec85b4', unlockWave: 10, paths: [path('stun','Sticky Bubbles','Keep skeletons slowed for longer. Extra hits refresh the effect without stacking.'),path('speed','Bubble Stream','Shoot bubbles more often.'),path('power','Pop Power','Increase bubble damage.'),path('range','Bubble Reach','Increase attack range.')] },
  multi: { id: 'multi', name: 'Tumble', role: 'Many little surprises', description: 'Attacks several skeletons at once. One special path improves damage, speed, and target count. Clear wave 15 to unlock.', cost: 290, color: '#64b7bb', unlockWave: 15, paths: [path('flurry','Whirling Wonders','More targets, more damage, faster attacks.',[20,45,80])] },
  sniper: { id: 'sniper', name: 'Aster', role: 'Watchful sharpshooter', description: 'Sees the entire map. Starts with low damage; build for power, speed, or a little of both. Defeat the final boss to unlock.', cost: 300, color: '#7d98d1', unlockWave: 20, paths: [path('power','Meteor Shots','Greatly increase damage per shot.',[15,35,65]),path('speed','Starlight Stream','Greatly increase shooting speed.',[15,35,65])] },
};

export const ENEMIES = {
  bone: { id: 'bone', name: 'Ivory skeleton', color: '#eee8cf', hp: 13, speed: 1.35, reward: 6, leak: 1 },
  green: { id: 'green', name: 'Moss skeleton', color: '#9cce71', hp: 28, speed: 1.20, reward: 8, leak: 2 },
  blue: { id: 'blue', name: 'Frost skeleton', color: '#76bce7', hp: 48, speed: 1.50, reward: 10, leak: 3 },
  red: { id: 'red', name: 'Ember skeleton', color: '#ed8376', hp: 82, speed: 1.13, reward: 12, leak: 4 },
  purple: { id: 'purple', name: 'Amethyst skeleton', color: '#bb89e0', hp: 130, speed: 1.32, reward: 15, leak: 5 },
  gold: { id: 'gold', name: 'Golden skeleton', color: '#f4cd72', hp: 205, speed: 1.00, reward: 20, leak: 7 },
  boss: { id: 'boss', name: 'The Bone Baron', color: '#dfb666', hp: 1400, speed: 0.65, reward: 220, leak: 30, boss: true },
  king: { id: 'king', name: 'The Skeleton King', color: '#cf88ce', hp: 4400, speed: 0.62, reward: 400, leak: 60, boss: true },
};
