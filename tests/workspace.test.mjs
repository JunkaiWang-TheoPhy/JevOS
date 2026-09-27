import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrate, initialWorkspace, changeMode, undoMode, acceptDecision } from '../src/workspace.ts';
test('corrupt storage is safe and invalid fields are rejected', () => {
  assert.equal(hydrate('{broken').mode, 'read');
  assert.equal(hydrate({ mode:'evil', meeting:{date:'2026-02-30',time:'28:00'} }).mode,'read');
  assert.notEqual(hydrate({meeting:{date:'2026-02-30'}}).meeting.date,'2026-02-30');
  assert.equal(hydrate({note:'保留',meeting:{date:'9999-99-99'}}).note,'保留');
  assert.deepEqual(hydrate({tasks:['a','a',null,'']}).tasks,['a']);
});
test('layout transitions and undo preserve the newest user drafts', () => {
  let state = {...initialWorkspace(),note:'用户的笔记'};
  state = changeMode(state,'meeting');
  state = {...state,note:'最新笔记',meeting:{...state.meeting,title:'用户编辑'}};
  const restored = undoMode(state,'read');
  assert.equal(restored.note,'最新笔记'); assert.equal(restored.meeting.title,'用户编辑');
  assert.equal(changeMode(state,'invalid'),state);
});
test('decision boundary rejects malformed responses',()=>{
  assert.equal(acceptDecision({choice:'bad'}),null);
  assert.equal(acceptDecision({choice:'meeting',source:'jev',confidence:2,elapsedMs:1}),null);
  assert.ok(acceptDecision({choice:'stay',source:'rules',confidence:null,elapsedMs:1}));
});
