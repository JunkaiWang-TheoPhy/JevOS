import type { ComponentType } from 'react';
import type { Workspace } from '../workspace';

export type AppJson = null | boolean | number | string | AppJson[] | { [key: string]: AppJson };

export interface AppDescriptor {
  id: string;
  title: string;
  icon: string;
  accent: string;
  width: number;
  height: number;
}

/** A bridge is bound by the host to one app instance; apps do not choose its storage key. */
export interface AppHostBridge {
  listApps(): readonly AppDescriptor[];
  openApp(appId: string): void;
  setNote(value: string): void;
  exportText(filename: string, content: string): void;
  loadState(): AppJson | null;
  saveState(value: AppJson): void;
}

export interface BuiltinAppProps {
  instanceId: string;
  workspace: Workspace;
  host: AppHostBridge;
  /** False when minimized or hidden: continuous animation must pause. */
  active: boolean;
}

export interface BuiltinAppDefinition extends AppDescriptor {
  Component: ComponentType<BuiltinAppProps>;
}

export interface GeneratedAppPackage {
  id: string;
  title: string;
  html: string;
  css: string;
  js: string;
  initialState: AppJson;
  createdAt: string;
}
