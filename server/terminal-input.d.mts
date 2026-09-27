export function parseTerminalInput(value: string): { command: string; directives: string[] };
export function terminalPrompt(cwd: string): string;
export function initialTerminalState(): { cwd: string; mode: 'shell'; filesystem: Record<string, { type: string }>; env: Record<string, string> };

export function classifyTerminalInput(value: string): { language: 'python' | 'java' | 'cpp' | 'shell' | 'natural'; kind: 'code' | 'command' | 'request' };
