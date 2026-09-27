import { chromium, expect } from '@playwright/test';
import { demoApps } from './apps.mjs';
import { validateAppPackage } from '../../../server/app-generator.mjs';
import { buildFrameDocument } from '../../../src/apps/generated/frame-document.ts';
const browser = await chromium.launch({ channel: 'chrome' });
try {
 for (const app of demoApps) {
  validateAppPackage(app);
  const page=await browser.newPage();
  await page.setContent('<iframe id="app" sandbox="allow-scripts allow-forms" style="width:520px;height:340px"></iframe>');
  const nonce='b'.repeat(32),doc=buildFrameDocument(app,nonce,app.id);
  await page.evaluate(({doc,nonce,app})=>{
   const frame=document.querySelector('iframe');let state=structuredClone(app.initialState);
   window.addEventListener('message',event=>{const data=event.data;if(event.source!==frame.contentWindow||data.channel!=='vibe-generated-v1'||data.nonce!==nonce)return;if(data.type==='request'){state={...state,...data.args[0]};frame.contentWindow.postMessage({...data,type:'response',ok:true,value:state},'*');}});
   frame.onload=()=>frame.contentWindow.postMessage({channel:'vibe-generated-v1',nonce,instanceId:app.id,type:'start',active:true,state},'*');
   frame.srcdoc=doc;
   window.reopen=()=>{frame.srcdoc=doc};
  },{doc,nonce,app});
  const frame=page.frameLocator('#app');
   await frame.locator('#article').waitFor();
   const inner=page.frames().find(f=>f.parentFrame());
   await inner.evaluate(()=>window.scrollTo(0,220));
   await frame.getByRole('button',{name:'保存阅读位置'}).click();
   await frame.getByText('阅读位置已保存',{exact:true}).waitFor();
   await page.evaluate(()=>window.reopen());await frame.locator('#article').waitFor();
   await expect.poll(()=>page.frames().find(f=>f.parentFrame()).evaluate(()=>document.scrollingElement.scrollTop)).toBeGreaterThan(0);console.log('PASS reader: original content, bookmark persisted on reopen');
  await page.close();
 }
}finally{await browser.close();}
