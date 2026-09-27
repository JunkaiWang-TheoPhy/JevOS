import { fatigueMusicRequested } from './fatigue-trigger.ts';
import type { MessageTriggerSource } from './fatigue-trigger';
import type { AppHostBridge } from '../contracts';

export async function musicForMessage(text: string, source: MessageTriggerSource, run: AppHostBridge['runAction']) {
  if (!fatigueMusicRequested(text, source)) return null;
  if (!run) throw new Error('音乐还没准备好，请点击播放。');
  return await run('music', 'music.play', {});
}
