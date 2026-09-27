/** Locally authored demo units. These are preassembled, never labelled live-generated. */
const css = `*{box-sizing:border-box}body{margin:0;background:#f7f4eb;color:#29372e;font:16px/1.7 system-ui}main{padding:24px;max-width:760px;margin:auto}h1{font-size:25px;margin:0 0 8px}small{color:#677465}button,input{font:inherit}button{padding:9px 14px;border:1px solid #bac6b5;border-radius:12px;background:#edf3e5;color:#29372e;cursor:pointer;margin:6px 4px 6px 0}input{max-width:100%}article{white-space:pre-wrap}output{display:block;font-size:46px;font-variant-numeric:tabular-nums}label{display:block}#status{min-height:28px}`;
const article = `早晨，把注意力留给一件事\n\n打开电脑时，我们很容易先处理一切：消息、日程、昨天没写完的稿子。工具越多，决定先做什么的时间也越长。\n\n今天先写下一个小目标：把三分钟的介绍讲清楚。它不需要一张满屏窗口的桌面，只需要可以阅读的材料、一份持续保留的笔记，以及一个提醒时间的工具。舒缓的声音提供背景，不代替思考。\n\n准备材料时，先找到一句能直接说明产品价值的话。接着安排一次真实操作，让听众看见变化。最后留一个结果：刚写的文字仍在，新工具可以使用，关闭再打开仍保留设置。\n\n工作阶段改变，工具的位置也可以改变。阅读时把原文放大，写作时把笔记放大，排练时让计时器退到角落。主次变化不应清空已经完成的工作。\n\n这份材料是为 JevOS 路演原创的本地示例文章，不是论文摘要。你可以选择段落、记录书签，再回到同一个阅读位置。`;
export const demoReader = {
 id:'demo-reader',title:'晨间阅读器',createdAt:'2026-09-27T10:00:00.000Z',
 initialState:{bookmark:0},css:css+'#reader-tools{position:sticky;top:0;background:#f7f4eb;padding:8px;z-index:2}',
 html:`<main><h1>晨间阅读</h1><div id="reader-tools"><button id="mark" type="button">保存阅读位置</button><button id="restore" type="button">回到书签</button><p id="status" role="status"></p></div><article id="article">${article}</article></main>`,
 js:`(async()=>{let state=await vibe.getState();const status=document.getElementById('status'),mark=document.getElementById('mark');function position(){return document.scrollingElement.scrollTop}mark.addEventListener('click',async()=>{mark.disabled=true;try{const bookmark=position();await vibe.setState({bookmark});state={...state,bookmark};status.textContent='阅读位置已保存';}catch{status.textContent='保存失败，请重试';}finally{mark.disabled=false}});document.getElementById('restore').addEventListener('click',()=>{window.scrollTo(0,state.bookmark||0);status.textContent='已回到书签';});requestAnimationFrame(()=>window.scrollTo(0,state.bookmark||0));})().catch(e=>document.body.textContent=e.message);`
};

export const demoReaderFixture = demoReader;
export const demoApps = [demoReader];
