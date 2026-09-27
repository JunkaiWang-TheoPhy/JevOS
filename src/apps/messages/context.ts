export interface GeneratedMessageContext { id: string; prompt: string; title: string; createdAt: string }
const memory = new Map<string, GeneratedMessageContext>();
const eventName = 'jevos:generated-message-context';
function key(owner: string) { return `jevos-message-context:${encodeURIComponent(owner)}`; }
export function publishGeneratedContent(workspaceId: string, prompt: string, title: string) {
  if (!workspaceId || !title.trim()) return;
  const value = { id: crypto.randomUUID(), prompt: prompt.slice(0, 2000), title: title.slice(0, 120), createdAt: new Date().toISOString() };
  memory.set(workspaceId, value);
  if (memory.size > 30) memory.delete(memory.keys().next().value!);
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(key(workspaceId), JSON.stringify(value)); } catch { /* Session memory retains the context. */ }
    window.dispatchEvent(new CustomEvent(eventName, { detail: { workspaceId } }));
  }
}
export function readGeneratedContent(workspaceId: string): GeneratedMessageContext | null {
  try {
    const v = JSON.parse(localStorage.getItem(key(workspaceId)) || 'null');
    if (v && typeof v.id === 'string' && typeof v.prompt === 'string' && typeof v.title === 'string') {
      return { id: v.id.slice(0, 100), prompt: v.prompt.slice(0, 2000), title: v.title.slice(0, 120), createdAt: typeof v.createdAt === 'string' ? v.createdAt.slice(0, 40) : '' };
    }
  } catch { /* Ignore corrupt or unavailable storage. */ }
  return memory.get(workspaceId) || null;
}
export { eventName as generatedContentEvent };
