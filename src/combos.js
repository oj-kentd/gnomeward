// Deliberate late-game synergies. Fractions scale the payoff with enemy health;
// shared victim cooldowns and finite ricochets keep dense rounds bounded.
export const SPOREFIRE = Object.freeze({
  radius: 4, cooldown: .8, damage: 160, healthFraction: .34, bossFraction: .06,
});
export const PRISMSTORM = Object.freeze({
  partnerRange: 7, cooldown: 1.8, ricochetRange: 6.5, bounces: 2,
  damage: 168, healthFraction: .16, bossFraction: .035, projectileLimit: 128,
});
