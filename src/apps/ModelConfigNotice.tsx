import { useCallback, useEffect, useState } from 'react';
import styles from './model-config.module.css';

declare global {
  interface Window {
    jevosDesktop?: { openConfiguration(): void; restartConfiguration(): void };
  }
}
type Configuration = { jevConfigured: boolean; generatorConfigured: boolean };

export default function ModelConfigNotice() {
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState('');
  const refresh = useCallback(async (automatic = false, signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/config', { credentials: 'same-origin', cache: 'no-store', signal });
      const value = await response.json();
      if (!response.ok || typeof value.jevConfigured !== 'boolean' || typeof value.generatorConfigured !== 'boolean') throw new Error();
      if (signal?.aborted) return;
      setConfiguration(value); setProblem('');
      if (automatic && !window.jevosDesktop && (!value.jevConfigured || !value.generatorConfigured)) setOpen(true);
    } catch {
      if (signal?.aborted) return;
      setProblem('当前无法检查模型服务，已有本地应用仍可使用。');
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(true, controller.signal);
    return () => controller.abort();
  }, [refresh]);
  function show() {
    if (window.jevosDesktop) window.jevosDesktop.openConfiguration();
    else { setOpen(true); void refresh(); }
  }
  return <>
    <button className={styles.reopen} onClick={show} aria-label="重新打开模型配置">模型设置</button>
    {open && <div className={styles.backdrop}><section className={styles.panel} role="dialog" aria-modal="true" aria-label="模型服务配置">
      <h2>模型服务配置</h2>
      <p>智能布局需要 Jev，生成新 App 需要独立的代码生成模型。本地应用可继续使用。</p>
      <ul><li>Jev：{configuration?.jevConfigured ? '已配置' : '待配置'}</li><li>代码生成模型：{configuration?.generatorConfigured ? '已配置' : '待配置'}</li></ul>
      <p>{problem || '请在服务端填写模型配置后重启服务；密钥不会保存在浏览器中。'}</p>
      <small>关闭仅隐藏本次提醒；可随时通过“模型设置”重新打开。</small>
      <div className={styles.actions}><button onClick={() => { void refresh(); }}>刷新配置状态</button><button onClick={() => setOpen(false)}>关闭提醒</button></div>
    </section></div>}
  </>;
}
