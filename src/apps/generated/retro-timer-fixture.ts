import type { GeneratedAppPackage } from '../contracts';

/** A checked-in acceptance fixture, never a claim of a live model generation. */
export const retroTimerFixture: GeneratedAppPackage = {
  id: 'fixture-retro-timer',
  title: '复古计时器 · 验收样例',
  createdAt: '2026-09-27T00:00:00.000Z',
  initialState: { durationMs: 1500000, remainingMs: 1500000, deadline: null, running: false },
  html: `<main class="timer-machine">
    <header><span class="serial">JEV / TIMER—01</span><span class="fixture">验收样例 · 非现场生成</span></header>
    <section class="screen" aria-label="计时器显示屏">
      <div class="screen-top"><span id="mode">READY TO FOCUS</span><span class="signal" aria-hidden="true">▂▄▆█</span></div>
      <output id="time" aria-label="剩余时间">25:00</output>
      <div class="progress" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <p id="status" role="status">一小段时间，只做一件事。</p>
    </section>
    <div class="duration-row"><label for="duration">专注时长</label><select id="duration"><option value="1">1 分钟</option><option value="5">5 分钟</option><option value="25" selected>25 分钟</option><option value="45">45 分钟</option></select></div>
    <div class="controls"><button id="start" type="button">▶ 开始</button><button id="pause" type="button">Ⅱ 暂停</button><button id="reset" type="button">↺ 重置</button></div>
    <footer><span>LOCAL CLOCK / SAVED STATE</span><span id="visibility">窗口已唤醒</span></footer>
  </main>`,
  css: `:root{color-scheme:dark;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#e3e6d6;background:#15161e}body{min-height:100vh;display:grid;place-items:center;padding:22px;background:repeating-linear-gradient(0deg,#15161e 0px,#15161e 3px,#181923 3px,#181923 4px)}button,select{font:inherit}.timer-machine{width:min(100%,440px);padding:22px;background:#282a37;border:2px solid #555966;box-shadow:5px 5px 0 #070911,inset 0 0 0 4px #20222d}header{display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap;margin-bottom:20px}.serial{font-size:12px;letter-spacing:1px;color:#f6be68}.fixture{font-size:10px;color:#c0c1d2}.screen{padding:20px 18px;background:#151e19;border:3px solid #090e0b;box-shadow:inset 0 0 22px #0008}.screen-top{display:flex;justify-content:space-between;font-size:10px;letter-spacing:1px;color:#a8c78b}.signal{color:#c9ec9b;animation:blink 1.4s steps(2,end) infinite}#time{display:block;margin:18px 0 20px;text-align:center;font-size:clamp(38px,12vw,72px);font-weight:700;letter-spacing:4px;color:#daf3a6;text-shadow:0 0 20px #bade7333;font-variant-numeric:tabular-nums}.progress{display:flex;gap:5px}.progress i{height:7px;flex:1;background:#364432}.progress i.lit{background:#b9d78c}#status{min-height:18px;margin:17px 0 0;color:#b5c4a5;font-size:11px;line-height:1.6}.duration-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:21px 0;font-size:12px;color:#d0d2df}select{padding:7px 10px;border:1px solid #686b80;border-radius:0;background:#1b1d29;color:#eee}.controls{display:grid;grid-template-columns:1.15fr 1fr 1fr;gap:10px}button{padding:12px 6px;border:1px solid #767889;border-bottom-width:4px;border-radius:2px;background:#424555;color:#eef0f6;font-size:12px;cursor:pointer}button:active{transform:translateY(2px);border-bottom-width:2px}#start{background:#ecc378;border-color:#98743c;color:#272011}button:disabled{opacity:.45;cursor:default}button:focus-visible,select:focus-visible{outline:3px solid #bde3fc;outline-offset:3px}footer{display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap;margin-top:22px;font-size:9px;color:#b0b4c7;letter-spacing:.3px}@keyframes blink{50%{opacity:.35}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}`,
  js: `(async () => {
    const saved = await vibe.getState();
    const goodNumber = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
    const data = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    let state = {
      durationMs: goodNumber(data.durationMs) && data.durationMs > 0 ? Math.min(data.durationMs, 86400000) : 1500000,
      remainingMs: goodNumber(data.remainingMs) ? Math.min(data.remainingMs, 86400000) : 1500000,
      deadline: goodNumber(data.deadline) ? data.deadline : null,
      running: data.running === true && goodNumber(data.deadline)
    };
    const $ = id => document.getElementById(id);
    const remaining = () => state.running ? Math.max(0, state.deadline - Date.now()) : state.remainingMs;
    const persist = async () => {
      try { await vibe.setState({ ...state }); }
      catch { $('status').textContent = '保存未成功，请保持窗口打开后重试。'; }
    };
    function paint() {
      const left = remaining();
      const seconds = Math.ceil(left / 1000);
      $('time').textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
      $('mode').textContent = state.running ? 'FOCUS IN PROGRESS' : left === 0 ? 'SESSION COMPLETE' : 'READY TO FOCUS';
      $('start').disabled = state.running;
      $('pause').disabled = !state.running;
      $('duration').disabled = state.running;
      document.querySelectorAll('.progress i').forEach((item, index) => item.classList.toggle('lit', index < Math.ceil(left / state.durationMs * 10)));
      if (state.running && left === 0) { state = { ...state, running: false, deadline: null, remainingMs: 0 }; $('status').textContent = '这一段完成了。休息一下，再继续。'; void persist(); }
    }
    $('duration').value = String(state.durationMs / 60000);
    $('start').addEventListener('click', async () => {
      if (state.running) return;
      const left = remaining() || state.durationMs;
      state = { ...state, running: true, remainingMs: left, deadline: Date.now() + left };
      $('status').textContent = '时间在走，其他事情可以先等等。'; paint(); await persist();
    });
    $('pause').addEventListener('click', async () => {
      state = { ...state, remainingMs: remaining(), running: false, deadline: null };
      $('status').textContent = '已暂停，准备好时继续。'; paint(); await persist();
    });
    const reset = async () => {
      state = { ...state, remainingMs: state.durationMs, running: false, deadline: null };
      $('status').textContent = '一小段时间，只做一件事。'; paint(); await persist();
    };
    $('reset').addEventListener('click', reset);
    $('duration').addEventListener('change', () => { state.durationMs = Number($('duration').value) * 60000; void reset(); });
    vibe.onVisibilityChange(active => { $('visibility').textContent = active ? '窗口已唤醒' : '绘制已暂停'; if (active) paint(); });
    paint(); setInterval(paint, 250);
  })();`,
};
