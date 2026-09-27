export type MessageSource = 'user' | 'local-sim' | 'model-sim' | 'generated-context';
export interface SimMessage { id: string; body: string; source: MessageSource; createdAt: string }
export interface Conversation { messages: SimMessage[]; draft: string; seenContext: string }
const sources = new Set(['user', 'local-sim', 'model-sim', 'generated-context']);
export function cleanMessageBody(body: string): string {
  return body
    .replace(/【(?:本地|模型)?模拟(?:来信|回复|消息)】\s*/g, '')
    .replace(/[（(](?:模拟|模拟内容(?:[，,][^）)]*)?|再次说明[：:][^）)]*)[）)]/g, '')
    .replace(/^(?:这是一条模拟消息[^\n]*|温馨提示[：:]以上内容仅为演示[^\n]*)\n?/gm, '')
    .replace(/这是对「([^」]+)」的模拟回复示例[。]?/g, '关于「$1」：')
    .replace(/(?:这条消息基于已保存应用标题创建|此消息由本地生成事件创建|这是一条模拟回复|这是模拟内容)[，,]未发送邮件[。]?/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}
export function normalizeConversation(value: unknown): Conversation {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const messages: SimMessage[] = [];
  for (const item of Array.isArray(raw.messages) ? raw.messages.slice(-24) : []) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    if (typeof m.body !== 'string' || typeof m.id !== 'string' || typeof m.source !== 'string' || !sources.has(m.source)) continue;
    messages.push({ id: m.id.slice(0, 100), body: (m.source === 'user' ? m.body : cleanMessageBody(m.body)).slice(0, 3000), source: m.source as MessageSource,
      createdAt: typeof m.createdAt === 'string' && Number.isFinite(Date.parse(m.createdAt)) ? m.createdAt.slice(0, 40) : new Date().toISOString() });
  }
  const result = { messages, draft: typeof raw.draft === 'string' ? raw.draft.slice(0, 2000) : '', seenContext: typeof raw.seenContext === 'string' ? raw.seenContext.slice(0, 100) : '' };
  while (new TextEncoder().encode(JSON.stringify(result)).length > 60000 && messages.length > 1) messages.shift();
  return result;
}
export function makeMessage(body: string, source: MessageSource): SimMessage {
  return { id: crypto.randomUUID(), body: (source === 'user' ? body : cleanMessageBody(body)).slice(0, 3000), source, createdAt: new Date().toISOString() };
}
export function localReply(text: string, titles: readonly string[], note = '') {
  const app = titles.at(-1);
  return `收到，你说的是“${text.slice(0, 500)}”。${app ? `我会围绕已生成的「${app.slice(0, 120)}」继续讨论。` : '我们可以继续核对当前原型。'}${note.trim() ? `当前笔记提到：${note.trim().slice(0, 220)}。` : ''}下一步你希望先完善哪一部分？`;
}
