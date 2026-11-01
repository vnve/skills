export interface WeatherPreset {
  particleCount: { light: number; normal: number; heavy: number };
  speedRange: [number, number];
  angle: number;
  sizeRange: [number, number];
}

export const WEATHER_PRESETS: Record<'rain' | 'snow', WeatherPreset> = {
  rain: {
    particleCount: { light: 80, normal: 200, heavy: 400 },
    speedRange: [600, 1000],
    angle: 10,
    sizeRange: [15, 25],
  },
  snow: {
    particleCount: { light: 40, normal: 100, heavy: 200 },
    speedRange: [40, 120],
    angle: 0,
    sizeRange: [2, 4],
  },
};

export interface Particle {
  x: number;
  y: number;
  speed: number;
  size: number;
  wobbleOffset: number;
  wobbleSpeed: number;
  opacity: number;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class WeatherParticleSystem {
  private particles: Particle[];
  private type: 'rain' | 'snow';
  private width: number;
  private height: number;
  private preset: WeatherPreset;
  private elapsed = 0;

  constructor(
    type: 'rain' | 'snow',
    intensity: 'light' | 'normal' | 'heavy',
    width: number,
    height: number,
    private readonly renderScale = 1,
  ) {
    this.type = type;
    this.width = width;
    this.height = height;
    this.preset = WEATHER_PRESETS[type];
    const count = this.preset.particleCount[intensity];
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push(this.createParticle(true));
    }
  }

  private createParticle(randomY: boolean): Particle {
    return {
      x: Math.random() * this.width,
      y: randomY ? Math.random() * this.height : -randomBetween(10, 40) * this.renderScale,
      speed: randomBetween(this.preset.speedRange[0], this.preset.speedRange[1]) * this.renderScale,
      size: randomBetween(this.preset.sizeRange[0], this.preset.sizeRange[1]) * this.renderScale,
      wobbleOffset: Math.random() * Math.PI * 2,
      wobbleSpeed: randomBetween(1.5, 3),
      opacity: randomBetween(0.3, 0.8),
    };
  }

  getParticleCount(): number {
    return this.particles.length;
  }

  getParticles(): Particle[] {
    return this.particles;
  }

  update(dt: number): void {
    this.elapsed += dt;
    const angleRad = (this.preset.angle * Math.PI) / 180;
    const windX = Math.sin(angleRad);
    const windY = Math.cos(angleRad);

    for (const p of this.particles) {
      p.y += p.speed * windY * dt;
      p.x += p.speed * windX * dt;

      if (this.type === 'snow') {
        p.x += Math.sin(this.elapsed * p.wobbleSpeed + p.wobbleOffset) * 30 * this.renderScale * dt;
      }

      if (p.y > this.height) {
        p.y = -p.size;
        p.x = Math.random() * this.width;
      }
      if (p.x > this.width + 20 * this.renderScale) {
        p.x = -20 * this.renderScale;
      }
      if (p.x < -20 * this.renderScale) {
        p.x = this.width + 20 * this.renderScale;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, globalOpacity: number): void {
    ctx.save();
    ctx.globalAlpha = globalOpacity;

    if (this.type === 'rain') {
      ctx.strokeStyle = 'rgba(200, 220, 255, 0.6)';
      ctx.lineWidth = 1.5 * this.renderScale;
      const angleRad = (this.preset.angle * Math.PI) / 180;
      for (const p of this.particles) {
        ctx.globalAlpha = globalOpacity * p.opacity;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(
          p.x + Math.sin(angleRad) * p.size,
          p.y + Math.cos(angleRad) * p.size,
        );
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      for (const p of this.particles) {
        ctx.globalAlpha = globalOpacity * p.opacity;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }
}
