import { Component, useContext, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { WorkspaceContext } from '../components';
import { getBuiltinApp, getGeneratedApp } from './registry';
import { readInstanceState, writeInstanceState } from './instance-state';
import type { AppHostBridge, AppDescriptor } from './contracts';
import GeneratedAppHost from './generated/GeneratedAppHost';

interface Props {
  appId: string;
  instanceId: string;
  workspaceId: string | null;
  active: boolean;
  apps: readonly AppDescriptor[];
  openApp(id: string): void;
}

class AppBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() {
    if (this.state.error) return <div className="app-runtime-error" role="alert"><h2>应用暂时无法运行</h2><p>{this.state.error}</p><button onClick={() => this.setState({ error: null })}>重新载入</button></div>;
    return this.props.children;
  }
}

export default function AppHost(props: Props) {
  const context = useContext(WorkspaceContext);
  const latest = useRef({ context, apps: props.apps, openApp: props.openApp });
  latest.current = { context, apps: props.apps, openApp: props.openApp };
  const transient = useRef(new Map<string, string>());
  const host = useMemo<AppHostBridge>(() => {
    const owner = props.workspaceId || 'local';
    const storage = {
      getItem(key: string) { try { return localStorage.getItem(key); } catch { return transient.current.get(key) ?? null; } },
      setItem(key: string, value: string) { transient.current.set(key, value); try { localStorage.setItem(key, value); } catch { /* Preserve state for this session when storage is full. */ } },
    };
    return {
      listApps: () => latest.current.apps.map(app => ({ ...app })),
      openApp(id) {
        if (!latest.current.apps.some(app => app.id === id)) throw new Error('该应用尚未注册。');
        latest.current.openApp(id);
      },
      setNote(value) {
        if (typeof value !== 'string' || value.length > 10000) throw new Error('笔记内容无效。');
        latest.current.context?.setState(current => ({ ...current, note: value }));
      },
      exportText(filename, content) {
        if (typeof filename !== 'string' || typeof content !== 'string' || content.length > 1024 * 1024) throw new Error('导出内容无效。');
        const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url; link.download = filename.replace(/[\\/]/g, '_').replace(/\p{Cc}/gu, '_').slice(0, 100) || 'vibeos.txt';
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      loadState: () => readInstanceState(storage, owner, props.instanceId),
      saveState: value => writeInstanceState(storage, owner, props.instanceId, value),
    };
  }, [props.workspaceId, props.instanceId]);
  if (!context) return null;
  const builtin = getBuiltinApp(props.appId);
  const generated = getGeneratedApp(props.appId);
  return <AppBoundary>
    {builtin ? <builtin.Component instanceId={props.instanceId} workspace={context.state} host={host} active={props.active} /> :
      generated ? <GeneratedAppHost app={generated} instanceId={props.instanceId} host={host} active={props.active} /> :
        <div className="app-runtime-error" role="status">应用内容正在载入。</div>}
  </AppBoundary>;
}
