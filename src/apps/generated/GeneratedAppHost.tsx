import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AppHostBridge, AppJson, GeneratedAppPackage } from '../contracts';
import { buildFrameDocument, FRAME_CHANNEL, GENERATED_FRAME_SANDBOX, isSafeState, parseFrameMessage } from './frame-document';
import styles from './generated.module.css';

export interface GeneratedAppHostProps {
  app: GeneratedAppPackage;
  instanceId: string;
  host: AppHostBridge;
  active: boolean;
  onError?: (message: string) => void;
}

function createNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), value => value.toString(16).padStart(2, '0')).join('');
}

function initialState(app: GeneratedAppPackage, host: AppHostBridge): AppJson {
  const saved = host.loadState();
  const value = saved ?? app.initialState;
  if (!isSafeState(value)) throw new Error('应用状态无效或超过大小限制。');
  return structuredClone(value);
}

/** The source key intentionally excludes workspace and visibility changes. */
export default function GeneratedAppHost(props: GeneratedAppHostProps) {
  const [retry, setRetry] = useState(0);
  const sourceKey = JSON.stringify([props.instanceId, props.app.id, props.app.createdAt, props.app.html, props.app.css, props.app.js, retry]);
  return <FrameRuntime key={sourceKey} {...props} onRetry={() => setRetry(value => value + 1)} />;
}

function FrameRuntime({ app, instanceId, host, active, onError, onRetry }: GeneratedAppHostProps & { onRetry(): void }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const latest = useRef({ host, active, onError });
  latest.current = { host, active, onError };
  const [session] = useState(() => {
    const nonce = createNonce();
    try {
      return { nonce, document: buildFrameDocument(app, nonce, instanceId), state: initialState(app, host), error: '' };
    } catch {
      return { nonce, document: '', state: null, error: '应用内容或已保存状态无法加载，请检查应用包后重试。' };
    }
  });
  const state = useRef<AppJson>(session.state);
  const [error, setError] = useState(session.error);
  const [ready, setReady] = useState(false);
  const sequence = useRef(0);
  const requestBudget = useRef({ since: 0, count: 0 });
  const reported = useRef('');
  const send = (payload: object) => iframe.current?.contentWindow?.postMessage({ channel: FRAME_CHANNEL, nonce: session.nonce, instanceId, ...payload }, '*');
  const start = () => { if (session.document) send({ type: 'start', active: latest.current.active, state: state.current }); };

  useEffect(() => {
    if (error && error !== reported.current) {
      reported.current = error;
      latest.current.onError?.(error);
    }
  }, [error]);

  useLayoutEffect(() => {
    const receive = (event: MessageEvent) => {
      const message = parseFrameMessage(event.data, session.nonce, event.source, iframe.current?.contentWindow, instanceId);
      if (!message) return;
      const nextSequence = Number(message.id.slice(2));
      if (nextSequence <= sequence.current) return;
      sequence.current = nextSequence;
      if (message.type === 'ready') {
        setReady(true);
        send({ type: 'visibility', active: latest.current.active });
        return;
      }
      if (message.type === 'runtime-error') { setError(message.message || '应用脚本运行失败'); return; }
      if (message.type !== 'request') return;
      const reply = (value: AppJson) => send({ type: 'response', id: message.id, ok: true, value });
      try {
        const now = Date.now();
        if (now - requestBudget.current.since >= 1000) requestBudget.current = { since: now, count: 0 };
        if (++requestBudget.current.count > 100) throw new Error('应用请求过于频繁，请稍后重试');
        const bridge = latest.current.host;
        switch (message.method) {
          case 'getState': reply(state.current); break;
          case 'setState': {
            const previous = state.current && typeof state.current === 'object' && !Array.isArray(state.current) ? state.current : {};
            const next = { ...previous, ...message.args[0] as Record<string, AppJson> };
            if (!isSafeState(next)) throw new Error('应用状态超过大小限制');
            bridge.saveState(structuredClone(next));
            state.current = structuredClone(next);
            reply(structuredClone(next));
            break;
          }
        }
      } catch (cause) {
        // Do not forward host exceptions, which may contain private service details.
        const safeErrors = ['应用请求过于频繁，请稍后重试', '应用状态超过大小限制'];
        const reason = cause instanceof Error && safeErrors.includes(cause.message) ? cause.message : '宿主操作失败，请稍后重试';
        send({ type: 'response', id: message.id, ok: false, error: reason });
      }
    };
    window.addEventListener('message', receive);
    start();
    return () => {
      window.removeEventListener('message', receive);
    };
  }, [session]);

  useEffect(() => {
    send({ type: 'visibility', active });
  }, [active, session]);

  useEffect(() => {
    if (ready || error) return;
    const timer = window.setTimeout(() => setError('应用启动超时。可以重新加载；已有保存内容仍保留。'), 10000);
    return () => window.clearTimeout(timer);
  }, [ready, error]);

  return <section className={styles.host} aria-label={`${app.title} 应用`}>
    {error && <div className={styles.error} role="alert"><strong>应用运行出错</strong><p>其他窗口仍可使用。你可以重试此应用。</p><pre>{error}</pre><button type="button" onClick={onRetry}>重新加载应用</button></div>}
    {!ready && !error && <div className={styles.loading} role="status">正在启动应用…</div>}
    {session.document && <iframe ref={iframe} className={styles.frame} title={app.title} sandbox={GENERATED_FRAME_SANDBOX} referrerPolicy="no-referrer" srcDoc={session.document} onLoad={() => { setReady(false); start(); }} allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'" />}
  </section>;
}
