/** Shared verbatim with the generated app; no browser-only or external dependencies. */
export function createDataModel() {
  const MAX_ROWS = 200;
  const MAX_COLUMNS = 20;
  const MAX_STATE_BYTES = 30 * 1024; // Leave room below the host's 32 KiB ceiling.
  const MAX_INPUT_BYTES = 128 * 1024;
  const MAX_NUMBER = 1e12;
  const example = [
    ['周期', '实验组', '对照组', '备注'],
    ['Week 01', '24', '22', '示例数据'],
    ['Week 02', '32', '26', '示例数据'],
    ['Week 03', '29', '27', '示例数据'],
    ['Week 04', '45', '31', '示例数据'],
    ['Week 05', '51', '35', '示例数据'],
    ['Week 06', '48', '38', '示例数据'],
    ['Week 07', '62', '40', '示例数据'],
    ['Week 08', '70', '43', '示例数据'],
  ];
  const bytes = value => new TextEncoder().encode(value).length;
  function normalizeRows(value) {
    if (!Array.isArray(value) || !value.length) throw new Error('表格不能为空，请保留一行表头。');
    if (value.length > MAX_ROWS) throw new Error('最多 200 行（含表头），原数据未替换。');
    let columns = 0;
    for (const row of value) {
      if (!Array.isArray(row) || !row.length || row.length > MAX_COLUMNS) throw new Error('每行须有 1–20 列，原数据未替换。');
      if (row.some(cell => typeof cell !== 'string' || cell.length > 2048)) throw new Error('单元格须是文本，且不超过 2048 个字符。');
      columns = Math.max(columns, row.length);
    }
    return value.map(row => [...row, ...Array(columns - row.length).fill('')]);
  }
  function validateState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) throw new Error('保存的数据版本无效。');
    const rows = normalizeRows(value.rows);
    if (!Number.isInteger(value.selectedColumn) || value.selectedColumn < 0 || value.selectedColumn >= rows[0].length) throw new Error('数值列选择无效。');
    if (!['line', 'bar'].includes(value.chartMode)) throw new Error('图表类型无效。');
    const state = { version: 1, rows, selectedColumn: value.selectedColumn, chartMode: value.chartMode, source: value.source === 'sample' ? 'sample' : 'user' };
    if (bytes(JSON.stringify(state)) > MAX_STATE_BYTES) throw new Error('数据超过本应用 30 KiB 保存上限，原数据未替换。');
    return state;
  }
  function sampleState() {
    return validateState({ version: 1, rows: example, selectedColumn: 1, chartMode: 'line', source: 'sample' });
  }
  function restoreState(value) {
    if (value == null || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)) return { state: sampleState(), warning: '' };
    try { return { state: validateState(value), warning: '' }; }
    catch (error) { return { state: sampleState(), warning: '已保存数据无法恢复，当前显示示例。' + error.message }; }
  }
  function parseCSV(raw) {
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('请先粘贴 CSV。');
    if (bytes(raw) > MAX_INPUT_BYTES) throw new Error('CSV 输入超过 128 KiB。');
    const text = raw.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], cell = '', quoted = false, closed = false, started = false;
    const field = () => {
      row.push(cell); cell = ''; closed = false; started = false;
      if (row.length > MAX_COLUMNS) throw new Error('最多 20 列，原数据未替换。');
    };
    const record = () => {
      field(); rows.push(row); row = [];
      if (rows.length > MAX_ROWS) throw new Error('最多 200 行（含表头），原数据未替换。');
    };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else { quoted = false; closed = true; }
        } else cell += ch;
      } else if (ch === ',') field();
      else if (ch === '\r' || ch === '\n') { record(); if (ch === '\r' && text[i + 1] === '\n') i++; }
      else if (closed) {
        if (ch !== ' ' && ch !== '\t') throw new Error('引号后须为逗号或换行。');
      } else if (ch === '"') {
        if (started) throw new Error('字段内的引号须使用 CSV 双引号转义。');
        quoted = true; started = true;
      } else { cell += ch; started = true; }
    }
    if (quoted) throw new Error('CSV 引号没有闭合。');
    if (row.length || cell || started || closed) record();
    return normalizeRows(rows);
  }
  function toCSV(rows) {
    return normalizeRows(rows).map(row => row.map(value => /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value).join(',')).join('\r\n');
  }
  function numericCell(raw) {
    const text = raw.trim();
    if (!text) return { value: null, kind: 'empty' };
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return { value: null, kind: 'invalid' };
    const value = Number(text);
    if (!Number.isFinite(value) || Math.abs(value) > MAX_NUMBER) return { value: null, kind: 'invalid' };
    return { value, kind: 'number' };
  }
  function seriesFor(state) {
    const data = validateState(state);
    const series = data.rows.slice(1).map((row, index) => ({
      ...numericCell(row[data.selectedColumn]), index, row: index + 2,
      label: data.selectedColumn === 0 ? String(index + 1) : row[0] || String(index + 1),
    }));
    const numbers = series.filter(item => item.value !== null).map(item => item.value);
    const sum = numbers.reduce((total, value) => total + value, 0);
    return {
      title: data.rows[0][data.selectedColumn] || '未命名列', series,
      count: numbers.length, empty: series.filter(item => item.kind === 'empty').length,
      invalid: series.filter(item => item.kind === 'invalid').length,
      sum, mean: numbers.length ? sum / numbers.length : null,
      min: numbers.length ? Math.min(...numbers) : null,
      max: numbers.length ? Math.max(...numbers) : null,
    };
  }
  function chartGeometry(state, width = 640, height = 220) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 160 || height < 100) throw new Error('图表尺寸无效。');
    const stats = seriesFor(state);
    if (!stats.count) return { ...stats, points: [], path: '', ticks: [], labels: [], zeroY: null, width, height };
    let min = state.chartMode === 'bar' ? Math.min(0, stats.min) : stats.min;
    let max = state.chartMode === 'bar' ? Math.max(0, stats.max) : stats.max;
    if (min === max) { const margin = Math.max(1, Math.abs(min) * 0.1); min -= margin; max += margin; }
    const left = 72, right = width - 18, top = 16, bottom = height - 36;
    const y = value => top + (max - value) / (max - min) * (bottom - top);
    const slots = Math.max(1, stats.series.length);
    const step = (right - left) / slots;
    const points = stats.series.map(item => ({ ...item, x: left + step * (item.index + 0.5), y: item.value === null ? null : y(item.value), barWidth: Math.max(0.5, Math.min(34, step * 0.65)) }));
    let path = '', connected = false;
    for (const point of points) {
      if (point.y === null) { connected = false; continue; }
      path += `${connected ? ' L' : ' M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`; connected = true;
    }
    const tickValues = [max, (max + min) / 2, min];
    const stride = Math.max(1, Math.ceil(slots / 6));
    return { ...stats, points, path: path.trim(), width, height, zeroY: Math.max(top, Math.min(bottom, y(0))),
      ticks: tickValues.map(value => ({ value, y: y(value) })), labels: points.filter(point => point.index % stride === 0), left, right, top, bottom };
  }
  function importCSV(text, previous = sampleState()) {
    const rows = parseCSV(text);
    const selectedColumn = rows[0].findIndex((_, column) => rows.slice(1).some(row => numericCell(row[column]).kind === 'number'));
    return validateState({ ...previous, rows, selectedColumn: Math.max(0, selectedColumn), source: 'user' });
  }
  function updateCell(state, rowIndex, columnIndex, text) {
    if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex) || !state.rows[rowIndex] || columnIndex < 0 || columnIndex >= state.rows[0].length) throw new Error('单元格位置无效。');
    const rows = state.rows.map(row => [...row]); rows[rowIndex][columnIndex] = text;
    return validateState({ ...state, rows, source: 'user' });
  }
  return { MAX_ROWS, MAX_COLUMNS, MAX_STATE_BYTES, MAX_NUMBER, sampleState, restoreState, validateState, parseCSV, toCSV, numericCell, seriesFor, chartGeometry, importCSV, updateCell };
}

export const dataModel = createDataModel();
