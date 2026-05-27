import { describe, expect, it } from 'vitest';
import {
  createDefaultPowerups,
  grantPowerup,
  hasInvulnerability,
  hasRadiationSuit,
  powerupsHudSnapshot,
  resetPowerups,
  shouldBlockSectorDamage,
  tickPowerups,
} from './playerPowerups';

describe('playerPowerups', () => {
  it('grants timed invulnerability', () => {
    const p = createDefaultPowerups();
    grantPowerup(p, 'invuln', 1000);
    expect(hasInvulnerability(p, 1500)).toBe(true);
    expect(hasInvulnerability(p, 40000)).toBe(false);
  });

  it('resets all timers', () => {
    const p = createDefaultPowerups();
    grantPowerup(p, 'berserk', 1000);
    resetPowerups(p);
    expect(p.berserkUntil).toBe(0);
  });

  it('rad suit blocks slime damage only', () => {
    const p = createDefaultPowerups();
    grantPowerup(p, 'radSuit', 1000);
    expect(shouldBlockSectorDamage(p, 'slime', 1500)).toBe(true);
    expect(shouldBlockSectorDamage(p, 'generic', 1500)).toBe(false);
  });

  it('invuln blocks all damage kinds', () => {
    const p = createDefaultPowerups();
    grantPowerup(p, 'invuln', 1000);
    expect(shouldBlockSectorDamage(p, 'generic', 1500)).toBe(true);
  });

  it('ticks expired powerups off', () => {
    const p = createDefaultPowerups();
    p.invulnUntil = 500;
    tickPowerups(p, 600);
    expect(p.invulnUntil).toBe(0);
  });

  it('grants computer map permanently', () => {
    const p = createDefaultPowerups();
    grantPowerup(p, 'invis', 1000);
    grantPowerup(p, 'computerMap', 1000);
    expect(powerupsHudSnapshot(p, 1500).invis).toBe(true);
    expect(powerupsHudSnapshot(p, 1500).computerMap).toBe(true);
  });

  it('snapshots active flags for HUD', () => {
    const p = createDefaultPowerups();
    grantPowerup(p, 'computerMap', 0);
    const snap = powerupsHudSnapshot(p, 100);
    expect(snap.computerMap).toBe(true);
  });
});
