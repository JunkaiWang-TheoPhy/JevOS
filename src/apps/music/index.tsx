import { useEffect, useRef, useState } from 'react';
import type { BuiltinAppDefinition, BuiltinAppProps } from '../contracts';
import styles from './Music.module.css';

interface Track { id: string; title: string; composer: string; performer: string; src: string; source: string; license: string; licenseUrl: string }
interface SavedPlayer { trackId?: string; position?: number; volume?: number }
const clock = (seconds: number) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00';

function Music({ host, active }: BuiltinAppProps) {
  const [saved] = useState<SavedPlayer>(() => { try { const value = host.loadState(); return value && typeof value === 'object' && !Array.isArray(value) ? value as SavedPlayer : {}; } catch { return {}; } });
  const [tracks, setTracks] = useState<Track[]>([]);
  const [trackId, setTrackId] = useState(typeof saved.trackId === 'string' ? saved.trackId : '');
  const [volume, setVolume] = useState(typeof saved.volume === 'number' && Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : .6);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement>(null);
  const autoplay = useRef(false);
  const restored = useRef(false);
  const lastSave = useRef(0);
  const index = Math.max(0, tracks.findIndex(track => track.id === trackId));
  const track = tracks[index];
  const latest = useRef({ host, trackId: track?.id || '', volume });
  latest.current = { host, trackId: track?.id || '', volume };

  function save() {
    const value = latest.current;
    if (!value.trackId) return;
    try { value.host.saveState({ trackId: value.trackId, position: audio.current?.currentTime || 0, volume: value.volume }); }
    catch { setError('播放仍可继续，但这次进度未能保存。'); }
  }
  function play() {
    const element = audio.current;
    if (!element || !track) return;
    setError('');
    void element.play().catch((reason: Error) => {
      if (reason.name !== 'AbortError') setError('暂时无法播放，请点击播放重试。');
    });
  }
  function select(next: number) {
    if (!tracks.length) return;
    const chosen = tracks[(next + tracks.length) % tracks.length];
    if (chosen.id === track?.id) { play(); return; }
    autoplay.current = true;
    setTrackId(chosen.id);
  }

  useEffect(() => {
    if (!host.registerActions || !track) return;
    return host.registerActions(async action => {
      const element = audio.current;
      if (!element) throw new Error('播放器未就绪');
      if (action === 'pause') { element.pause(); if (!element.paused) throw new Error('暂停失败'); return '音乐已暂停'; }
      if (action === 'play') { await element.play(); if (element.paused) throw new Error('播放失败'); return '正在播放：' + track.title; }
      if (action === 'next') {
        const chosen = tracks[(index + 1) % tracks.length];
        if (!chosen || chosen.id === track.id) throw new Error('没有下一首');
        autoplay.current = false;
        element.src = chosen.src; element.load();
        setTrackId(chosen.id);
        await element.play();
        if (element.paused || !element.src.endsWith(chosen.src)) throw new Error('切歌失败');
        return '已切换并播放：' + chosen.title;
      }
      throw new Error('音乐不支持该操作');
    });
  }, [host, track, tracks, index]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${import.meta.env.BASE_URL}music/tracks.json`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('曲库载入失败');
      const value: unknown = await response.json();
      if (!Array.isArray(value) || value.length < 5 || !value.every(item => item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.src === 'string' && /^\/music\/[a-zA-Z0-9_.-]+$/.test(item.src))) throw new Error('曲库信息不完整');
      setTracks((value as Track[]).map(track => ({ ...track, src: `${import.meta.env.BASE_URL}${track.src.slice(1)}` })));
    }).catch((reason: Error) => { if (reason.name !== 'AbortError') setError('曲库暂时无法载入，请关闭后重新打开音乐。'); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const element = audio.current;
    if (!element || !track) return;
    if (!element.src.endsWith(track.src)) { element.src = track.src; element.load(); }
    setPosition(0); setDuration(0); setError('');
    if (autoplay.current) {
      void element.play().catch((reason: Error) => { if (reason.name !== 'AbortError') setError('请点击播放，继续聆听。'); });
    }
  }, [track]);
  useEffect(() => { if (audio.current) audio.current.volume = volume; }, [volume]);
  useEffect(() => {
    const element = audio.current;
    const persist = () => {
      const value = latest.current;
      try { if (value.trackId) value.host.saveState({ trackId: value.trackId, position: element?.currentTime || 0, volume: value.volume }); } catch { /* Closing never traps the user. */ }
    };
    window.addEventListener('pagehide', persist);
    return () => { persist(); element?.pause(); window.removeEventListener('pagehide', persist); };
  }, []);

  return <section className={styles.player} aria-label="音乐播放器">
    <audio ref={audio} data-testid="music-audio" preload="metadata"
      onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); save(); }}
      onLoadedMetadata={() => {
        const element = audio.current!;
        setDuration(Number.isFinite(element.duration) ? element.duration : 0);
        if (!restored.current) {
          restored.current = true;
          if (track?.id === saved.trackId && typeof saved.position === 'number' && Number.isFinite(saved.position)) element.currentTime = Math.max(0, Math.min(saved.position, element.duration || 0));
        }
      }}
      onTimeUpdate={() => { setPosition(audio.current?.currentTime || 0); if (Date.now() - lastSave.current > 5000) { lastSave.current = Date.now(); save(); } }}
      onEnded={() => select(index + 1)} onError={() => { setPlaying(false); setError('这首录音暂时无法读取，请重试或选择下一首。'); }} />
    <header className={styles.heading}><div><span className={styles.eyebrow}>JEVOS MUSIC · ACOUSTIC COLLECTION</span><h1>留一点时间，听音乐。</h1></div><span className={styles.count}>{tracks.length} 首录音</span></header>
    <div className={styles.nowPlaying}>
      <div className={`${styles.record} ${playing && active ? styles.spinning : ''}`} aria-hidden="true"><div><span>J</span><small>ACOUSTIC</small></div></div>
      <div className={styles.description}><span className={styles.eyebrow}>正在聆听 · 钢琴</span><h2 data-testid="music-track-title">{track?.title || '正在载入曲库…'}</h2><p>{track?.composer}</p><small>{track?.performer && `${track.performer} · 真实演奏录音`}</small></div>
    </div>
    <div className={styles.transport}>
      <div className={styles.seek}><span>{clock(position)}</span><input aria-label="播放进度" type="range" min="0" max={duration || 1} step=".1" value={Math.min(position, duration || 1)} disabled={!duration} onChange={event => { if (audio.current) { audio.current.currentTime = Number(event.target.value); setPosition(Number(event.target.value)); } }} onPointerUp={save} onKeyUp={save} /><span>{clock(duration)}</span></div>
      <div className={styles.controls}><div className={styles.buttons}><button aria-label="上一首" disabled={!track} onClick={() => select(index - 1)}>⏮</button><button className={styles.play} aria-label={playing ? '暂停音乐' : '播放音乐'} disabled={!track} onClick={() => playing ? audio.current?.pause() : play()}>{playing ? 'Ⅱ' : '▶'}</button><button aria-label="下一首" disabled={!track} onClick={() => select(index + 1)}>⏭</button></div><label className={styles.volume}>音量<input aria-label="音乐音量" type="range" min="0" max="1" step=".01" value={volume} onChange={event => setVolume(Number(event.target.value))} onPointerUp={save} onKeyUp={save} /></label></div>
      <div className={styles.status} role="status">{error || (playing ? '正在播放 · 最小化后可继续聆听' : '真实钢琴录音 · 点击播放开始聆听')}</div>
    </div>
    <div className={styles.listHeading}><h3>钢琴收藏</h3><span>本地音频 · 顺序播放</span></div>
    <ol className={styles.tracks} aria-label="音乐曲库">{tracks.map((item, number) => <li key={item.id}><button className={item.id === track?.id ? styles.selected : ''} aria-label={`播放：${item.title}`} aria-current={item.id === track?.id ? 'true' : undefined} onClick={() => select(number)}><span className={styles.number}>{item.id === track?.id && playing ? '♫' : String(number + 1).padStart(2, '0')}</span><span className={styles.trackInfo}><strong>{item.title}</strong><small>{item.composer} · {item.performer}</small></span><span className={styles.trackKind}>钢琴</span></button></li>)}</ol>
    <footer className={styles.footer}>{track && <><a href={track.source} target="_blank" rel="noreferrer">录音来源 ↗</a><a href={track.licenseUrl} target="_blank" rel="noreferrer">{track.license}</a></>}<span>关闭窗口时停止播放</span></footer>
  </section>;
}
export const definition: BuiltinAppDefinition = { id: 'music', title: '音乐', icon: '♫', accent: '#a6563e', width: 740, height: 680, Component: Music };
