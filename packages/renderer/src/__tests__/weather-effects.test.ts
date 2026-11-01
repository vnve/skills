import { describe, expect, it, vi } from 'vitest';
import { WeatherParticleSystem, WEATHER_PRESETS } from '../weather-effects';

describe('WEATHER_PRESETS', () => {
  it('defines presets for rain and snow', () => {
    expect(WEATHER_PRESETS.rain).toBeDefined();
    expect(WEATHER_PRESETS.snow).toBeDefined();
  });

  it('rain preset has particle counts for each intensity', () => {
    expect(WEATHER_PRESETS.rain.particleCount.light).toBe(80);
    expect(WEATHER_PRESETS.rain.particleCount.normal).toBe(200);
    expect(WEATHER_PRESETS.rain.particleCount.heavy).toBe(400);
  });

  it('snow preset has particle counts for each intensity', () => {
    expect(WEATHER_PRESETS.snow.particleCount.light).toBe(40);
    expect(WEATHER_PRESETS.snow.particleCount.normal).toBe(100);
    expect(WEATHER_PRESETS.snow.particleCount.heavy).toBe(200);
  });
});

describe('WeatherParticleSystem', () => {
  it('initializes with correct particle count', () => {
    const system = new WeatherParticleSystem('rain', 'normal', 800, 600);
    expect(system.getParticleCount()).toBe(200);
  });

  it('update advances particle positions', () => {
    const system = new WeatherParticleSystem('rain', 'light', 800, 600);
    const before = system.getParticles().map(p => ({ ...p }));
    system.update(1 / 60);
    const after = system.getParticles();
    const moved = after.some((p, i) => p.y !== before[i].y);
    expect(moved).toBe(true);
  });

  it('particles wrap around when falling below canvas', () => {
    const system = new WeatherParticleSystem('rain', 'light', 800, 600);
    for (const p of system.getParticles()) {
      p.y = 610;
    }
    system.update(1 / 60);
    const allAboveBottom = system.getParticles().every(p => p.y < 600);
    expect(allAboveBottom).toBe(true);
  });

  it('snow particles oscillate horizontally', () => {
    const system = new WeatherParticleSystem('snow', 'normal', 800, 600);
    const p = system.getParticles()[0];
    const startX = p.x;
    for (let i = 0; i < 60; i++) {
      system.update(1 / 60);
    }
    expect(p.x).not.toBe(startX);
  });

  it('render draws to canvas context', () => {
    const system = new WeatherParticleSystem('rain', 'light', 800, 600);
    const calls: string[] = [];
    const mockCtx = {
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      globalAlpha: 1,
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      beginPath: () => calls.push('beginPath'),
      moveTo: () => calls.push('moveTo'),
      lineTo: () => calls.push('lineTo'),
      stroke: () => calls.push('stroke'),
      arc: () => calls.push('arc'),
      fill: () => calls.push('fill'),
    } as unknown as CanvasRenderingContext2D;

    system.render(mockCtx, 0.8);
    expect(calls).toContain('save');
    expect(calls).toContain('restore');
  });
});

describe('weather render scaling', () => {
  it.each(['rain', 'snow'] as const)('keeps %s size and motion proportional across preview and export', (type) => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const full = new WeatherParticleSystem(type, 'normal', 1920, 1080, 1);
      const preview = new WeatherParticleSystem(type, 'normal', 960, 540, 0.5);
      full.update(0.1);
      preview.update(0.1);
      const a = full.getParticles()[0];
      const b = preview.getParticles()[0];
      expect(b.size).toBeCloseTo(a.size * 0.5);
      expect(b.x).toBeCloseTo(a.x * 0.5);
      expect(b.y).toBeCloseTo(a.y * 0.5);
    } finally {
      random.mockRestore();
    }
  });
});
