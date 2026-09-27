import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesktop,desktopReducer as reduce,hydrateDesktop,toolsForMode} from '../src/desktop-model.ts';
test('open restores stable tool window and does not close other tools',()=>{
  let s=reduce(createDesktop(),{type:'open',tool:'notes'}); const id=s.activeId;
  s=reduce(s,{type:'open',tool:'message'});s=reduce(s,{type:'minimize',id});s=reduce(s,{type:'open',tool:'notes'});
  assert.equal(s.windows.length,2);assert.equal(s.activeId,id);assert.equal(s.windows.find(w=>w.id===id).minimized,false);
  s=reduce(s,{type:'close',id});s=reduce(s,{type:'open',tool:'notes'});assert.equal(s.activeId,id);assert.equal(s.windows.length,2);
});
test('minimize and close focus the next visible window',()=>{
  let s=reduce(createDesktop(),{type:'open',tool:'message'});s=reduce(s,{type:'open',tool:'notes'});
  s=reduce(s,{type:'minimize',id:'notes'});assert.equal(s.activeId,'message');
  s=reduce(s,{type:'close',id:'message'});assert.equal(s.activeId,null);
  s=reduce(s,{type:'restore',id:'notes'});assert.equal(s.activeId,'notes');
});
test('non-finite movement and resizing are rejected, maxima preserve geometry',()=>{
  const s=reduce(createDesktop(),{type:'open',tool:'calendar'});
  assert.equal(reduce(s,{type:'move',id:'calendar',x:NaN,y:4}),s);
  assert.equal(reduce(s,{type:'resize',id:'calendar',width:Infinity,height:4}),s);
  const max=reduce(s,{type:'maximize',id:'calendar'});const restored=reduce(max,{type:'maximize',id:'calendar'});
  assert.equal(restored.windows[0].width,s.windows[0].width);assert.equal(restored.windows[0].maximized,false);
});
test('tiling stays within a finite narrow viewport',()=>{
  let s=createDesktop();for(const tool of toolsForMode('meeting'))s=reduce(s,{type:'open',tool});
  s=reduce(s,{type:'tile',width:390,height:720});
  for(const w of s.windows){assert.ok(w.x>=0&&w.y>=0);assert.ok(w.x+w.width<=390);assert.ok(w.y+w.height<=720);}
  assert.equal(s.windows.length,4);
});
test('hydrate rejects corrupt windows and duplicates, clamps geometry',()=>{
  assert.deepEqual(hydrateDesktop('{oops'),createDesktop());
  const w=reduce(createDesktop(),{type:'open',tool:'message'}).windows[0];
  const s=hydrateDesktop({windows:[{...w,x:-300,width:90000},{...w},{...w,id:'evil',tool:'unknown'},{...w,id:'bad',tool:'notes',y:Infinity}],activeId:'evil'});
  assert.equal(s.windows.length,1);assert.equal(s.windows[0].x,0);assert.equal(s.windows[0].width,4000);assert.equal(s.activeId,'message');
});
