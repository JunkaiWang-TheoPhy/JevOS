import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDemoCommand } from '../src/apps/terminal/demo-commands.ts';
const apps = [{id:'notes',title:'笔记'},{id:'music',title:'音乐'},{id:'generated:pomo',title:'番茄钟'},{id:'generated:demo-reader',title:'阅读器'},{id:'generated:custom',title:'My Water App'}];
test('local clear, catalog, quoted app and real generated aliases', () => {
  for (const c of ['clear','cls','清屏']) assert.equal(parseDemoCommand(c,apps).effect.type,'clear');
  assert.equal(parseDemoCommand('open timer',[{id:'generated:fixture',title:'计时器 · 预制演示'},...apps]).effect.appId,'generated:pomo');
  assert.equal(parseDemoCommand('open reader',apps).effect.appId,'generated:demo-reader');
  assert.equal(parseDemoCommand('open "My Water App"',apps).effect.appId,'generated:custom');
  assert.equal(parseDemoCommand('open missing',apps).ok,false);
  assert.equal(parseDemoCommand('apps',apps).source,'local');
  assert.match(parseDemoCommand('help',apps).output,/scene/);
});
test('every deterministic command has typed effects', () => {
  for (const [input,type] of [['close music','close'],['minimize timer','minimize'],['focus notes','focus'],['tile','tile'],['split reader notes','split'],['move music bottom-right','move'],['resize notes 70%','resize'],['music play','app-action'],['music pause','app-action'],['music next','app-action'],['timer start 3m','app-action'],['timer pause','app-action'],['timer reset','app-action'],['reader bookmark','app-action'],['reader restore','app-action'],['scene morning','scene'],['scene focus','scene'],['scene pitch','scene'],['undo layout','undo-layout'],['create app "喝水提醒器"','create-app']]) {
    const parsed = parseDemoCommand(input,apps); assert.equal(parsed.ok,true,input); assert.equal(parsed.effect.type,type,input);
  }
  assert.equal(parseDemoCommand('timer start 3m',apps).effect.args.minutes,3);
});
test('reject command chaining and malformed args; ordinary shell falls through', () => {
  for(const input of ['open notes; ls','clear\nopen music','open notes && ls','open notes | cat','open $(ls)','open `ls`','resize notes 101%','timer start 0m','timer start 121m','timer start 0.5m','scene unknown','split notes notes','open "unfinished']) assert.equal(parseDemoCommand(input,apps).ok,false,input);
  assert.equal(parseDemoCommand('ls -la',apps),null);
  assert.equal(parseDemoCommand('open timer',[]).ok,false);
});
