import test from 'node:test';
import assert from 'node:assert/strict';
import { applyShellDesktop } from '../src/shell-desktop.ts';
const apps=[{id:'notes',title:'笔记'},{id:'music',title:'音乐'},{id:'generated:pomo',title:'番茄钟'},{id:'generated:demo-reader',title:'阅读器'}];
const viewport={width:1200,height:800};
const initial={windows:[{id:'stable-note',tool:'notes',title:'笔记',x:10,y:20,width:400,height:300,z:1,minimized:false,maximized:false},{id:'terminal',tool:'terminal',title:'Terminal',x:30,y:30,width:480,height:400,z:2,minimized:false,maximized:false}],activeId:'stable-note'};
const run=(effect,state=initial,v=viewport)=>applyShellDesktop(state,effect,v,apps);
function inside(s,v=viewport){ for(const w of s.windows.filter(w=>!w.minimized)){assert.ok(w.x>=0&&w.y>=0&&w.width>0&&w.height>0);assert.ok(w.x+w.width<=v.width+.001&&w.y+w.height<=v.height+.001);} }
test('open/focus retain identity, and local geometry does not mutate original',()=>{
 const s=run({type:'open',appId:'notes'});assert.equal(s.windows[0].id,'stable-note');assert.equal(s.windows.length,2);
 inside(run({type:'move',appId:'notes',position:'bottom-right'}));
 assert.equal(run({type:'resize',appId:'notes',percent:70}).windows[0].width,840);
 assert.equal(initial.windows[0].x,10);
 assert.equal(run({type:'minimize',appId:'notes'}).windows[0].minimized,true);
 assert.equal(run({type:'close',appId:'notes'}).windows.length,1);
});
test('tile and split fit viewport and reuse app windows',()=>{
 inside(run({type:'tile'}));const s=run({type:'split',appIds:['notes','music']});inside(s);
 const n=s.windows.find(w=>w.tool==='notes'),m=s.windows.find(w=>w.tool==='music');assert.equal(n.id,'stable-note');assert.ok(n.x+n.width<m.x);
});
test('morning four apps have no overlap; scene changes retain all identities',()=>{
 const morning=run({type:'scene',name:'morning'});inside(morning);
 const visible=morning.windows.filter(w=>!w.minimized);assert.equal(visible.length,4);
 for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){const a=visible[i],b=visible[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);}
 const focus=run({type:'scene',name:'focus'},morning);assert.equal(focus.windows.length,morning.windows.length);assert.equal(focus.activeId,'stable-note');
 const pitch=run({type:'scene',name:'pitch'},focus);inside(pitch);assert.equal(pitch.windows.filter(w=>!w.minimized).length,2);
});
test('narrow viewport never overflows and unsupported/missing commands fail',()=>{
 const small={width:320,height:240};inside(run({type:'scene',name:'morning'},initial,small),small);
 assert.throws(()=>run({type:'app-action',appId:'music',action:'music.play'}));
 assert.throws(()=>run({type:'open',appId:'untrusted'}));
 assert.throws(()=>run({type:'resize',appId:'notes',percent:101}));
 assert.throws(()=>applyShellDesktop(initial,{type:'scene',name:'morning'},viewport,[]));
});
