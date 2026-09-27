import type { AppDescriptor, BuiltinAppDefinition, GeneratedAppPackage } from './contracts';
import { definition as terminal } from './terminal';
import { definition as motionLab } from './motion-lab';
import { definition as music } from './music';
import { definition as messages } from './messages';

const builtins = new Map<string, BuiltinAppDefinition>();
const generated = new Map<string, GeneratedAppPackage>();

export function registerBuiltinApp(definition: BuiltinAppDefinition) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(definition.id)) throw new Error('应用标识无效。');
  builtins.set(definition.id, definition);
}

export function getBuiltinApp(id: string) { return builtins.get(id); }
export function builtinApps(): AppDescriptor[] {
  return [...builtins.values()].map(({ id, title, icon, accent, width, height }) => ({ id, title, icon, accent, width, height }));
}

export function generatedWindowId(id: string) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error('生成应用标识无效。');
  return `generated:${id}`;
}

export function registerGeneratedApp(app: GeneratedAppPackage): AppDescriptor {
  const id = generatedWindowId(app.id);
  generated.set(id, app);
  return { id, title: app.title, icon: '✦', accent: '#9c72e8', width: 600, height: 460 };
}

export function getGeneratedApp(windowId: string) { return generated.get(windowId); }

registerBuiltinApp(terminal);
registerBuiltinApp(motionLab);
registerBuiltinApp(music);
registerBuiltinApp(messages);
