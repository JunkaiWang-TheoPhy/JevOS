import { createDataModel, dataModel } from './model.mjs';

/** Prebuilt acceptance/demo fixture. All initial values are labelled sample data. */
export const dataStudioDraft = {
  id: 'draft-data-studio',
  title: 'Data Studio · 预制样例',
  createdAt: '2026-09-27T09:40:00.000Z',
  initialState: dataModel.sampleState(),
  html: `<main class="studio">
    <header class="titlebar"><span class="appmark" aria-hidden="true">▥</span><strong>Data Studio</strong><span class="document-title">Untitled worksheet</span><span class="fixture-label">预制演示样例</span></header>
    <div class="toolbar"><button id="import-open" type="button" aria-expanded="false" aria-controls="import-panel">↥ 导入 CSV</button><button id="sample-reset" type="button">↺ 重置示例</button><span class="toolbar-divider"></span><span id="source-label" class="source-label">示例数据</span><span class="toolbar-hint">单击单元格编辑</span></div>
    <section id="import-panel" class="import-panel is-hidden" aria-label="导入 CSV">
      <div class="import-heading"><strong>导入一张表</strong><button id="import-close" type="button" aria-label="关闭导入">×</button></div>
      <p>首行为表头。支持逗号、引号及换行；最多 200 行（含表头）× 20 列。导入会替换当前表格。</p>
      <label class="sr-only" for="csv-input">CSV 文本</label><textarea id="csv-input" rows="6" spellcheck="false" placeholder="月份,收入,成本&#10;一月,120,85&#10;二月,145,91"></textarea>
      <div class="import-actions"><label for="csv-file" class="file-label">或选择本地 CSV<input id="csv-file" type="file"></label><button id="import-apply" type="button" class="primary">导入数据</button></div>
      <p id="import-error" class="error" role="alert"></p>
    </section>
    <div class="formula-bar"><output id="cell-address">A1</output><span class="fx" aria-hidden="true">fx</span><span id="cell-value">选择单元格查看内容</span><span id="sheet-size"></span></div>
    <section class="sheet" aria-label="可编辑数据表"><table id="data-table"><caption class="sr-only">首行为列名，其余行参与图表计算</caption><thead id="table-head"></thead><tbody id="table-body"></tbody></table></section>
    <section class="chart-panel" aria-label="数据图表">
      <div class="chart-toolbar"><div class="chart-caption"><span class="section-label">ANALYSIS</span><strong id="chart-title">实验组</strong></div><label for="value-column">数值列</label><select id="value-column"></select><div class="mode-switch" role="group" aria-label="图表类型"><button id="mode-line" type="button" aria-pressed="true">折线</button><button id="mode-bar" type="button" aria-pressed="false">柱状</button></div></div>
      <div class="chart-canvas"><svg id="chart" viewBox="0 0 640 220" role="img" aria-label="当前数值列图表"></svg><p id="chart-empty" class="chart-empty is-hidden">当前列没有可绘制的数值</p></div>
      <div class="statistics"><span>有效值 <strong id="stat-count">0</strong></span><span>合计 <strong id="stat-sum">—</strong></span><span>平均 <strong id="stat-mean">—</strong></span><span id="skipped-values"></span></div>
    </section>
    <footer class="statusbar"><span class="sheet-tab">Sheet 1</span><span id="save-status" role="status">正在恢复数据…</span><span id="interaction-status" role="status"></span><span class="status-tail">本地计算 · 首行作表头</span></footer>
  </main>`,
  css: `:root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#2b3745;background:#eef1f5;font-size:12px}body{margin:0;min-height:100vh;overflow-x:hidden;overflow-y:auto}button,select,input,textarea{font:inherit}button{border:1px solid #c8d1dc;background:#fafbfd;color:#33475b;border-radius:3px;padding:6px 10px;cursor:pointer;white-space:nowrap}button:hover{background:#e8eff8;border-color:#96afcf}button:focus-visible,select:focus-visible,textarea:focus-visible,input:focus-visible{outline:2px solid #357ac1;outline-offset:1px}button:disabled{opacity:.6;cursor:wait}.studio{width:100%;min-width:0;height:100vh;min-height:520px;display:grid;grid-template-rows:35px 40px 29px minmax(125px,1fr) minmax(218px,.95fr) 27px;position:relative;overflow:hidden;background:#fff}.titlebar{display:flex;align-items:center;gap:9px;padding:0 13px;background:#e8edf4;border-bottom:1px solid #c5cfdb}.appmark{display:grid;place-items:center;width:21px;height:21px;background:#447aa7;color:white;font-size:17px}.titlebar strong{font-size:12px;font-weight:650}.document-title{margin-left:10px;color:#647386;font-size:11px}.fixture-label{margin-left:auto;font-size:10px;color:#66768a}.toolbar{display:flex;align-items:center;gap:7px;padding:0 10px;background:#f8f9fb;border-bottom:1px solid #d6dde6}.toolbar button{font-size:11px;padding:4px 8px}.toolbar-divider{height:18px;border-left:1px solid #d2dbe5;margin:0 3px}.source-label{font-size:10px;color:#667a91}.toolbar-hint{margin-left:auto;color:#8290a0;font-size:10px}.formula-bar{display:flex;align-items:center;gap:9px;border-bottom:1px solid #ccd6e1;background:#fff;overflow:hidden}.formula-bar output{min-width:47px;align-self:stretch;display:grid;place-items:center;background:#f4f7fb;border-right:1px solid #d3dce6;color:#466789;font:11px ui-monospace,monospace}.fx{font:italic 13px Georgia,serif;color:#93a0ad}#cell-value{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#627185}#sheet-size{font-size:10px;color:#8a95a2;padding-right:12px;white-space:nowrap}.sheet{overflow:auto;background:repeating-linear-gradient(0deg,#fff 0,#fff 27px,#eef2f7 27px,#eef2f7 28px)}table{border-collapse:separate;border-spacing:0;table-layout:fixed;min-width:100%;width:max-content}th{height:25px;font-weight:400;background:#eef2f7;color:#65778b;font:10px ui-monospace,monospace}thead th{position:sticky;top:0;z-index:3;border-bottom:1px solid #bfcddd;border-right:1px solid #d8e0e9}thead th:first-child{left:0;z-index:4;width:42px;min-width:42px}.row-number{position:sticky;left:0;z-index:2;width:42px;min-width:42px;text-align:center;border-right:1px solid #ccd7e4;border-bottom:1px solid #dfe5ed}td{padding:0;min-width:130px;width:130px;height:28px;border-right:1px solid #e0e6ee;border-bottom:1px solid #e0e6ee;background:#fff}td.selected-column{background:#f5f9fe}tr:first-child td{background:#edf3fa}td input{display:block;border:0;border-radius:0;outline:none;background:transparent;width:100%;height:27px;padding:4px 9px;color:#3f4d5e;font-size:11px;min-width:110px}tr:first-child td input{font-weight:650;color:#365776}td input.numeric{text-align:right;font-variant-numeric:tabular-nums}td input.invalid{color:#a7583c;background:#fff5ef}td:focus-within{box-shadow:inset 0 0 0 2px #4786c5;position:relative;z-index:2}td input:focus-visible{outline:none}.chart-panel{border-top:2px solid #c3d0df;display:flex;flex-direction:column;min-height:0;background:#fbfcfe}.chart-toolbar{display:flex;align-items:center;gap:9px;min-height:42px;padding:6px 13px}.chart-caption{display:flex;align-items:baseline;gap:9px;min-width:0;flex:1}.section-label{font-size:8px;letter-spacing:1.3px;color:#8493a4}.chart-caption strong{font-size:12px;font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chart-toolbar label{font-size:10px;color:#8190a1;white-space:nowrap}select{max-width:155px;min-width:90px;border:1px solid #cbd6e3;background:#fff;padding:4px 6px;color:#45617e;border-radius:3px;font-size:11px}.mode-switch{display:flex}.mode-switch button{padding:4px 8px;border-radius:0;font-size:10px}.mode-switch button:first-child{border-radius:3px 0 0 3px}.mode-switch button:last-child{border-radius:0 3px 3px 0;border-left:0}.mode-switch button[aria-pressed="true"]{background:#dfeaf7;color:#285c91}.chart-canvas{position:relative;flex:1;min-height:125px;padding:0 12px}svg{width:100%;height:100%;display:block}.chart-empty{position:absolute;inset:0;display:grid;place-content:center;color:#8796a7;font-size:12px;margin:0}.statistics{display:flex;gap:19px;align-items:center;min-height:29px;padding:4px 16px;border-top:1px solid #e3e9f1;font-size:10px;color:#8795a5}.statistics strong{color:#405a74;font-variant-numeric:tabular-nums;margin-left:5px;font-weight:600}#skipped-values{margin-left:auto;color:#9b7457;font-size:9px}.statusbar{display:flex;align-items:center;gap:12px;background:#edf2f8;border-top:1px solid #cbd5e1;padding:0 10px;color:#6f8094;font-size:9px;min-width:0}.sheet-tab{align-self:stretch;display:grid;place-items:center;color:#396c9c;font-size:10px;border-bottom:2px solid #598dbf;padding:0 11px;background:#fff}#interaction-status{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#a25035}.status-tail{margin-left:auto;white-space:nowrap}.import-panel{position:absolute;top:74px;left:12px;right:12px;z-index:10;background:#f9fbfe;border:1px solid #94abc4;box-shadow:0 9px 28px #253e5c33;padding:14px;max-height:calc(100% - 110px);overflow:auto}.import-heading{display:flex;justify-content:space-between;align-items:center}.import-heading button{border:0;background:transparent;font-size:20px;padding:0 3px}.import-panel p{font-size:11px;line-height:1.6;color:#77869a;margin:8px 0}.import-panel textarea{resize:vertical;display:block;width:100%;min-height:90px;max-height:190px;padding:9px;border:1px solid #c2cfdd;background:white;color:#40536b;font:11px/1.6 ui-monospace,monospace}.import-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}.file-label{font-size:10px;color:#70839a}.file-label input{display:block;max-width:240px;font-size:10px;margin-top:4px}.primary{background:#417bad;color:white;border-color:#417bad}.primary:hover{background:#326a9b;color:white}.import-panel .error{color:#a14c37;margin-bottom:0;min-height:16px}.is-hidden{display:none!important}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:520px){.document-title,.toolbar-hint,.section-label,.status-tail{display:none}.chart-toolbar{gap:5px;padding-inline:9px}.chart-caption strong{max-width:100px}.chart-toolbar select{max-width:105px;min-width:70px}.statistics{gap:10px;flex-wrap:wrap}.fixture-label{font-size:9px}.studio{grid-template-rows:35px 40px 29px minmax(125px,1fr) minmax(230px,1fr) 27px}}`,
  js: `(async () => {
    'use strict';
    const model = (${createDataModel.toString()})();
    const $ = id => document.getElementById(id);
    const recovered = model.restoreState(await vibe.getState());
    let state = recovered.state;
    let saving = false, pendingSave = null, revision = 0;
    const format = value => value === null ? '—' : Math.abs(value) >= 1e8 ? value.toExponential(2) : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(value);
    const letter = index => String.fromCharCode(65 + index);
    const notice = message => { $('interaction-status').textContent = message; };
    async function persist() {
      pendingSave = { state: JSON.parse(JSON.stringify(state)), revision: ++revision };
      $('save-status').textContent = '保存中…';
      if (saving) return;
      saving = true;
      while (pendingSave) {
        const next = pendingSave; pendingSave = null;
        try {
          await vibe.setState(next.state);
          if (!pendingSave && next.revision === revision) $('save-status').textContent = '已保存';
        } catch {
          $('save-status').textContent = '保存失败';
          notice('数据仍在当前窗口中；继续编辑可重试保存。');
        }
      }
      saving = false;
    }
    function renderColumnOptions() {
      $('value-column').replaceChildren();
      state.rows[0].forEach((title, index) => {
        const option = document.createElement('option'); option.value = String(index);
        option.textContent = letter(index) + ' · ' + (title || '未命名列');
        $('value-column').append(option);
      });
      $('value-column').value = String(state.selectedColumn);
    }
    function renderTable() {
      const header = document.createElement('tr');
      const corner = document.createElement('th'); corner.setAttribute('aria-label', '行号'); header.append(corner);
      state.rows[0].forEach((_, index) => { const th = document.createElement('th'); th.textContent = letter(index); th.scope = 'col'; header.append(th); });
      $('table-head').replaceChildren(header);
      const fragment = document.createDocumentFragment();
      state.rows.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        const th = document.createElement('th'); th.className = 'row-number'; th.scope = 'row'; th.textContent = String(rowIndex + 1); tr.append(th);
        row.forEach((value, columnIndex) => {
          const td = document.createElement('td'); td.classList.toggle('selected-column', columnIndex === state.selectedColumn);
          const input = document.createElement('input'); input.type = 'text'; input.value = value; input.maxLength = 2048;
          input.dataset.row = String(rowIndex); input.dataset.column = String(columnIndex);
          input.setAttribute('aria-label', letter(columnIndex) + (rowIndex + 1));
          if (rowIndex > 0) { const numeric = model.numericCell(value); input.classList.toggle('numeric', numeric.kind === 'number'); input.classList.toggle('invalid', numeric.kind === 'invalid' && columnIndex === state.selectedColumn); }
          td.append(input); tr.append(td);
        });
        fragment.append(tr);
      });
      $('table-body').replaceChildren(fragment);
      $('sheet-size').textContent = state.rows.length + ' 行 × ' + state.rows[0].length + ' 列';
    }
    function svgElement(tag, attributes, text) {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function renderChart() {
      const graph = model.chartGeometry(state);
      const svg = $('chart'); svg.replaceChildren();
      svg.setAttribute('aria-label', graph.title + '，' + graph.count + ' 个有效数值，' + (state.chartMode === 'bar' ? '柱状图' : '折线图'));
      $('chart-title').textContent = graph.title;
      $('chart-empty').classList.toggle('is-hidden', graph.count > 0);
      $('stat-count').textContent = String(graph.count);
      $('stat-sum').textContent = graph.count ? format(graph.sum) : '—';
      $('stat-mean').textContent = format(graph.mean);
      $('skipped-values').textContent = graph.empty || graph.invalid ? '跳过 ' + graph.empty + ' 个空值 / ' + graph.invalid + ' 个非数值或超范围值' : '按表格当前值计算';
      $('source-label').textContent = state.source === 'sample' ? '示例数据 · 非真实实验' : '当前编辑数据';
      $('mode-line').setAttribute('aria-pressed', String(state.chartMode === 'line'));
      $('mode-bar').setAttribute('aria-pressed', String(state.chartMode === 'bar'));
      if (!graph.count) return;
      for (const tick of graph.ticks) {
        svg.append(svgElement('line', { x1: graph.left, x2: graph.right, y1: tick.y, y2: tick.y, stroke: '#dce5ef', 'stroke-dasharray': '3 4' }));
        svg.append(svgElement('text', { x: graph.left - 10, y: tick.y + 3, 'text-anchor': 'end', fill: '#8b9aad', 'font-size': 9 }, format(tick.value)));
      }
      if (state.chartMode === 'line') svg.append(svgElement('path', { d: graph.path, fill: 'none', stroke: '#4c83b5', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      else svg.append(svgElement('line', { x1: graph.left, x2: graph.right, y1: graph.zeroY, y2: graph.zeroY, stroke: '#b6c7d9' }));
      for (const point of graph.points) {
        if (point.y === null) continue;
        const node = state.chartMode === 'bar'
          ? svgElement('rect', { x: point.x - point.barWidth / 2, y: Math.min(point.y, graph.zeroY), width: point.barWidth, height: Math.abs(point.y - graph.zeroY), fill: point.value < 0 ? '#bb806b' : '#7199be' })
          : svgElement('circle', { cx: point.x, cy: point.y, r: graph.count > 70 ? 1.8 : 3.4, fill: '#fff', stroke: '#4c83b5', 'stroke-width': 1.8 });
        node.append(svgElement('title', {}, point.label + ': ' + format(point.value))); svg.append(node);
      }
      for (const point of graph.labels) svg.append(svgElement('text', { x: point.x, y: graph.bottom + 20, 'text-anchor': 'middle', fill: '#8595a7', 'font-size': 9 }, point.label.length > 12 ? point.label.slice(0, 11) + '…' : point.label));
    }
    function refresh() { renderColumnOptions(); renderTable(); renderChart(); }
    function importPanel(open) { $('import-panel').classList.toggle('is-hidden', !open); $('import-open').setAttribute('aria-expanded', String(open)); if (open) $('csv-input').focus(); else $('import-open').focus(); }
    $('import-open').addEventListener('click', () => importPanel($('import-panel').classList.contains('is-hidden')));
    $('import-close').addEventListener('click', () => importPanel(false));
    $('import-panel').addEventListener('keydown', event => { if (event.key === 'Escape') importPanel(false); });
    $('import-apply').addEventListener('click', () => {
      try { const next = model.importCSV($('csv-input').value, state); state = next; $('import-error').textContent = ''; refresh(); importPanel(false); notice('已导入 ' + (state.rows.length - 1) + ' 行数据'); void persist(); }
      catch (error) { $('import-error').textContent = error.message; }
    });
    $('csv-file').accept = '.csv,text/csv';
    $('csv-file').addEventListener('change', async event => {
      const file = event.target.files && event.target.files[0]; if (!file) return;
      if (file.size > 128 * 1024) { $('import-error').textContent = '文件超过 128 KiB。'; return; }
      try { $('csv-input').value = await file.text(); $('import-error').textContent = '已读取文件，点击导入数据后替换表格。'; }
      catch { $('import-error').textContent = '文件读取失败。'; }
    });
    $('sample-reset').addEventListener('click', () => { state = model.sampleState(); refresh(); notice('已重置为预制示例数据'); void persist(); });
    $('value-column').addEventListener('change', event => { state = model.validateState({ ...state, selectedColumn: Number(event.target.value) }); renderTable(); renderChart(); notice(''); void persist(); });
    for (const mode of ['line', 'bar']) $('mode-' + mode).addEventListener('click', () => { state = model.validateState({ ...state, chartMode: mode }); renderChart(); void persist(); });
    $('table-body').addEventListener('focusin', event => {
      if (!(event.target instanceof HTMLInputElement)) return;
      const input = event.target; $('cell-address').textContent = letter(Number(input.dataset.column)) + (Number(input.dataset.row) + 1); $('cell-value').textContent = input.value || '空值';
    });
    $('table-body').addEventListener('input', event => {
      if (!(event.target instanceof HTMLInputElement)) return;
      const input = event.target, row = Number(input.dataset.row), column = Number(input.dataset.column);
      try {
        state = model.updateCell(state, row, column, input.value); $('cell-value').textContent = input.value || '空值';
        if (row === 0) renderColumnOptions();
        else { const cell = model.numericCell(input.value); input.classList.toggle('numeric', cell.kind === 'number'); input.classList.toggle('invalid', cell.kind === 'invalid' && column === state.selectedColumn); }
        renderChart(); notice(''); void persist();
      } catch (error) { input.value = state.rows[row][column]; notice(error.message); }
    });
    refresh(); $('save-status').textContent = recovered.warning ? '恢复失败 · 显示示例' : '状态已恢复'; notice(recovered.warning);
  })();`,
};
