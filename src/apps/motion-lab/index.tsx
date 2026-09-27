import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BuiltinAppDefinition, BuiltinAppProps } from '../contracts';
import { createParticles, DEFAULT_SETTINGS, LIMITS, normalizeSettings, stepParticles } from './model';
import type { MotionSettings, Particle } from './model';
import styles from './MotionLab.module.css';

function loadSettings(host: BuiltinAppProps['host']) {
  try { return normalizeSettings(host.loadState()); }
  catch { return { ...DEFAULT_SETTINGS }; }
}

function paint(context: CanvasRenderingContext2D, width: number, height: number, particles: readonly Particle[], color: string) {
  context.fillStyle = '#101a25';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#293746'; context.lineWidth = 0.5;
  context.beginPath();
  for (let x = 0; x < width; x += 32) { context.moveTo(x, 0); context.lineTo(x, height); }
  for (let y = 0; y < height; y += 32) { context.moveTo(0, y); context.lineTo(width, y); }
  context.stroke();
  // Keep the neighbor workload bounded rather than drawing all particle pairs.
  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    for (let j = Math.max(0, i - 10); j < i; j++) {
      const b = particles[j];
      const distance = Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
      const reach = Math.min(width, height) * 0.33;
      if (distance >= reach) continue;
      context.globalAlpha = (1 - distance / reach) * 0.35;
      context.strokeStyle = color; context.beginPath(); context.moveTo(a.x * width, a.y * height); context.lineTo(b.x * width, b.y * height); context.stroke();
    }
  }
  context.globalAlpha = 1;
  for (const particle of particles) {
    context.fillStyle = color; context.beginPath(); context.arc(particle.x * width, particle.y * height, particle.radius, 0, Math.PI * 2); context.fill();
  }
}

export default function MotionLab({ host, active }: BuiltinAppProps) {
  const [settings, setSettings] = useState(() => loadSettings(host));
  const [reset, setReset] = useState(0);
  const [storageError, setStorageError] = useState('');
  const [canvasError, setCanvasError] = useState('');
  const [documentVisible, setDocumentVisible] = useState(() => document.visibilityState !== 'hidden');
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const canvas = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const id = useId();
  const running = active && documentVisible && !settings.paused && !reduceMotion;

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReduceMotion(preference.matches);
    const visibility = () => setDocumentVisible(document.visibilityState !== 'hidden');
    preference.addEventListener('change', motion);
    document.addEventListener('visibilitychange', visibility);
    return () => { preference.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility); };
  }, []);

  useEffect(() => { particles.current = createParticles(settings.count); }, [settings.count, reset]);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) { setCanvasError('当前环境不支持 Canvas。'); return; }
    let width = 1, height = 1, frame = 0, previous = 0;
    const resize = () => {
      const box = element.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return;
      width = Math.min(1600, box.width); height = Math.min(1000, box.height);
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      element.width = Math.round(width * ratio); element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      paint(context, width, height, particles.current, settings.color);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element); resize();
    const tick = (time: number) => {
      particles.current = stepParticles(particles.current, previous ? (time - previous) / 1000 : 0, settings.speed);
      previous = time;
      paint(context, width, height, particles.current, settings.color);
      frame = requestAnimationFrame(tick);
    };
    if (running) frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [running, settings.count, settings.color, settings.speed, reset]);

  function change(patch: Partial<MotionSettings>) {
    const next = normalizeSettings({ ...settings, ...patch });
    setSettings(next);
    try { host.saveState({ ...next }); setStorageError(''); }
    catch { setStorageError('参数未保存；当前动画仍可操作。'); }
  }
  const stateLabel = reduceMotion ? '减少动态偏好' : !active || !documentVisible ? '后台暂停' : settings.paused ? '已暂停' : '运行中';

  return <section className={styles.lab} aria-label="Motion Lab 粒子实验室" style={{ '--motion-accent': settings.color } as CSSProperties}>
    <header className={styles.header}><div><span className={styles.eyebrow}>LOCAL EXPERIMENT / 01</span><h2>Motion Lab<span>粒子实验室</span></h2></div><span className={`${styles.status} ${running ? styles.live : ''}`}><i />{stateLabel}</span></header>
    <div className={styles.instrument}><canvas ref={canvas} className={styles.canvas} role="img" aria-label={`${settings.count} 个粒子的可控动画`} /><div className={styles.plotLabel}>PARTICLE FIELD</div><div className={styles.scale}><span>X / 0.00</span><span>1.00 / Y</span></div>{canvasError && <p className={styles.canvasError} role="status">{canvasError}</p>}</div>
    <div className={styles.readouts}><div><span>PARTICLES</span><strong>{String(settings.count).padStart(3, '0')}</strong></div><div><span>SPEED</span><strong>{settings.speed.toFixed(1)}<small>×</small></strong></div><div><span>RENDERER</span><strong className={styles.renderer}>CANVAS<small>本地运行</small></strong></div></div>
    <div className={styles.controls}><div className={styles.sliderControl}><label htmlFor={`${id}-count`}>粒子数量 <output>{settings.count}</output></label><input id={`${id}-count`} type="range" min={LIMITS.minCount} max={LIMITS.maxCount} step={1} value={settings.count} onChange={event => change({ count: Number(event.target.value) })} /></div><div className={styles.sliderControl}><label htmlFor={`${id}-speed`}>运动速度 <output>{settings.speed.toFixed(1)}×</output></label><input id={`${id}-speed`} type="range" min={LIMITS.minSpeed} max={LIMITS.maxSpeed} step={0.1} value={settings.speed} onChange={event => change({ speed: Number(event.target.value) })} /></div><div className={styles.colorControl}><label htmlFor={`${id}-color`}>粒子颜色</label><input id={`${id}-color`} type="color" value={settings.color} onChange={event => change({ color: event.target.value })} /><span>{settings.color.toUpperCase()}</span></div></div>
    <footer className={styles.footer}><p role="status">{storageError || (reduceMotion ? '系统减少动态偏好已开启，画面保持静止。' : '设置由宿主保存 · 最小化时暂停')}</p><div><button className={styles.reset} onClick={() => { change(DEFAULT_SETTINGS); setReset(current => current + 1); }}>↺ 重置</button><button className={styles.play} aria-pressed={settings.paused} disabled={reduceMotion} onClick={() => change({ paused: !settings.paused })}>{settings.paused ? '▶ 继续' : 'Ⅱ 暂停'}</button></div></footer>
  </section>;
}

export const definition: BuiltinAppDefinition = {
  id: 'motion-lab', title: 'Motion Lab', icon: '◌', accent: '#70e5bf', width: 620, height: 580, Component: MotionLab,
};
