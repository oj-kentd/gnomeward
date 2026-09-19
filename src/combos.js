// Deliberate late-game synergies. Fractions scale the payoff with enemy health;
// shared victim cooldowns and finite ricochets keep dense rounds bounded.
export const SPOREFIRE = Object.freeze({
  radius: 4, cooldown: .8, damage: 160, healthFraction: .34, bossFraction: .06,
});
export const PRISMSTORM = Object.freeze({
  partnerRange: 7, cooldown: 1.8, ricochetRange: 6.5, bounces: 2,
  damage: 168, healthFraction: .16, bossFraction: .035, projectileLimit: 128,
});

export const BERRY_SINGULARITY = Object.freeze({
  cooldown: 2.4, orbitDuration: .45, flightDuration: .65, orbitRadius: 1.05,
  range: 6.5, pierce: 5, damage: 40, healthFraction: .025, bossFraction: .004,
  projectileLimit: 128,
});
