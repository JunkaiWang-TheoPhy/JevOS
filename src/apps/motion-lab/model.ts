export interface MotionSettings { count: number; speed: number; color: string; paused: boolean }
export interface Particle { x: number; y: number; vx: number; vy: number; radius: number }

export const DEFAULT_SETTINGS: MotionSettings = { count: 80, speed: 0.8, color: '#70e5bf', paused: false };
export const LIMITS = { minCount: 16, maxCount: 160, minSpeed: 0.1, maxSpeed: 2.5 } as const;

function bounded(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function normalizeSettings(raw: unknown): MotionSettings {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return {
    count: Math.round(bounded(value.count, DEFAULT_SETTINGS.count, LIMITS.minCount, LIMITS.maxCount)),
    speed: bounded(value.speed, DEFAULT_SETTINGS.speed, LIMITS.minSpeed, LIMITS.maxSpeed),
    color: typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color) ? value.color.toLowerCase() : DEFAULT_SETTINGS.color,
    paused: typeof value.paused === 'boolean' ? value.paused : DEFAULT_SETTINGS.paused,
  };
}

export function createParticles(count: number, random: () => number = Math.random): Particle[] {
  const length = normalizeSettings({ count }).count;
  return Array.from({ length }, () => {
    const angle = random() * Math.PI * 2;
    const magnitude = 0.025 + random() * 0.045;
    return { x: random(), y: random(), vx: Math.cos(angle) * magnitude, vy: Math.sin(angle) * magnitude, radius: 1.2 + random() * 1.8 };
  });
}

/** Bounded wall-clock delta prevents a hidden tab's elapsed time from being replayed. */
export function stepParticles(particles: readonly Particle[], deltaSeconds: number, speed: number): Particle[] {
  const dt = bounded(deltaSeconds, 0, 0, 0.05);
  const factor = bounded(speed, DEFAULT_SETTINGS.speed, LIMITS.minSpeed, LIMITS.maxSpeed);
  return particles.map(particle => {
    let x = particle.x + particle.vx * dt * factor;
    let y = particle.y + particle.vy * dt * factor;
    let { vx, vy } = particle;
    if (x < 0) { x = -x; vx = Math.abs(vx); }
    else if (x > 1) { x = 2 - x; vx = -Math.abs(vx); }
    if (y < 0) { y = -y; vy = Math.abs(vy); }
    else if (y > 1) { y = 2 - y; vy = -Math.abs(vy); }
    return { ...particle, x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)), vx, vy };
  });
}
