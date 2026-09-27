/** Literal, local shortcut. Call from the user's send event, never from received text. */
export type MessageTriggerSource = 'user-send' | 'incoming' | 'model-reply' | 'retry';
export function fatigueMusicRequested(text: string, source: MessageTriggerSource): boolean {
  return source === 'user-send' && text.includes('累');
}
