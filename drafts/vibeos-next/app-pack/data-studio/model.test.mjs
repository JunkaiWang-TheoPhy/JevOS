import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createDataModel, dataModel as m } from './model.mjs';
import { dataStudioDraft } from './app.mjs';

test('CSV supports BOM, CRLF, quoted commas, escaped quotes and multiline cells', () => {
  assert.deepEqual(m.parseCSV('\uFEFF名称,值,备注\r\n"甲,乙",3,"他说""好"""\r\n丙,,"跨\r\n行"\r\n'), [
    ['名称', '值', '备注'], ['甲,乙', '3', '他说"好"'], ['丙', '', '跨\r\n行'],
  ]);
});
test('CSV preserves trailing empty fields and pads ragged rows without inventing values', () => {
  assert.deepEqual(m.parseCSV('A,B,C\na,1,\nb'), [['A', 'B', 'C'], ['a', '1', ''], ['b', '', '']]);
  assert.deepEqual(m.parseCSV('"",x'), [['', 'x']]);
});
test('CSV malformed quotes and empty input fail explicitly', () => {
  for (const input of ['', '  \n', 'a,"unfinished', 'a,"x"oops', 'a,b"c']) assert.throws(() => m.parseCSV(input));
});
test('CSV roundtrip retains user text including markup', () => {
  const rows = [['<img src=x onerror=alert(1)>', 'a,b', 'a"b', 'two\nlines'], ['', '0', '-1', '四']];
  assert.deepEqual(m.parseCSV(m.toCSV(rows)), rows);
});
test('exactly 200 total rows and 20 columns fit; exceeding either fails', () => {
  const rows = Array.from({ length: 200 }, () => Array(20).fill('1'));
  assert.equal(m.parseCSV(rows.map(row => row.join(',')).join('\n')).length, 200);
  assert.throws(() => m.parseCSV(Array(201).fill('1').join('\n')), /200/);
  assert.throws(() => m.parseCSV(Array(21).fill('1').join(',')), /20/);
});
test('state size and input size are bounded separately; failed import keeps original immutable', () => {
  const old = m.sampleState(); const before = JSON.stringify(old);
  assert.throws(() => m.importCSV(Array(30).fill('a'.repeat(1500)).join('\n'), old), /30 KiB/);
  assert.throws(() => m.parseCSV('a'.repeat(128 * 1024 + 1)), /128 KiB/);
  assert.equal(JSON.stringify(old), before);
});
test('empty and nonnumeric cells are not silently converted to zero', () => {
  const state = m.importCSV('名称,数值\na,\nb,no\nc,0\nd,-2.5\ne,2e2\nf,Infinity\ng,1e13');
  state.selectedColumn = 1;
  const s = m.seriesFor(state);
  assert.equal(s.count, 3); assert.equal(s.empty, 1); assert.equal(s.invalid, 3);
  assert.equal(s.sum, 197.5); assert.equal(s.mean, 197.5 / 3);
});
test('flat nonzero and zero series have finite coordinates and visible range', () => {
  for (const value of ['0', '9', '-9', '1000000000000']) {
    for (const chartMode of ['line', 'bar']) {
      const state = { ...m.importCSV(`x,y\na,${value}\nb,${value}`), chartMode };
      state.selectedColumn = 1;
      const graph = m.chartGeometry(state);
      assert.ok(graph.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
      assert.ok(graph.ticks[0].value > graph.ticks[2].value);
    }
  }
});
test('line paths break at missing values and bar baseline handles negative data', () => {
  const state = m.importCSV('x,y\na,-4\nb,\nc,8'); state.selectedColumn = 1;
  const line = m.chartGeometry(state);
  assert.equal((line.path.match(/M/g) || []).length, 2);
  const bar = m.chartGeometry({ ...state, chartMode: 'bar' });
  assert.ok(bar.points[0].y > bar.zeroY); assert.ok(bar.points[2].y < bar.zeroY);
});
test('no numeric data produces an empty chart, not fabricated points or NaN', () => {
  const state = m.importCSV('a,b\nx,no\ny,'); state.selectedColumn = 1;
  const graph = m.chartGeometry(state);
  assert.equal(graph.count, 0); assert.equal(graph.path, ''); assert.deepEqual(graph.points, []); assert.equal(graph.mean, null);
});
test('editing updates statistics without mutating the previous state', () => {
  const state = m.importCSV('x,y\na,2\nb,4'); state.selectedColumn = 1;
  const changed = m.updateCell(state, 1, 1, '10');
  assert.equal(m.seriesFor(changed).sum, 14); assert.equal(state.rows[1][1], '2');
  assert.throws(() => m.updateCell(state, -1, 0, 'oops'));
});
test('serialized state restores rows, selected column and chart mode', () => {
  const state = { ...m.importCSV('周期,A,B\na,2,8\nb,4,16'), selectedColumn: 2, chartMode: 'bar' };
  const result = m.restoreState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(result.state, state); assert.equal(result.warning, ''); assert.equal(m.seriesFor(result.state).sum, 24);
});
test('invalid saved state recovers with an explicit warning', () => {
  for (const saved of [{ version: 2 }, { ...m.sampleState(), selectedColumn: 99 }, { ...m.sampleState(), rows: [[{}]] }, { ...m.sampleState(), chartMode: 'pie' }]) {
    const result = m.restoreState(saved); assert.ok(result.warning); assert.equal(result.state.source, 'sample');
  }
});
test('package embeds exactly the tested model, has valid plain script and respects size limits', () => {
  assert.equal(dataStudioDraft.id, 'draft-data-studio');
  assert.ok(dataStudioDraft.js.includes(createDataModel.toString()));
  assert.doesNotThrow(() => new vm.Script(dataStudioDraft.js));
  assert.ok(Buffer.byteLength(JSON.stringify(dataStudioDraft.initialState)) < 32 * 1024);
  assert.ok(Buffer.byteLength(dataStudioDraft.html + dataStudioDraft.css + dataStudioDraft.js) < 256 * 1024);
  assert.ok(!/innerHTML|\bfetch\s*\(|localStorage|setInterval/.test(dataStudioDraft.js));
});
