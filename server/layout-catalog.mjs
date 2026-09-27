// Layout variants are data: geometry is resolved against the current viewport.
export const LAYOUT_CATALOG = Object.freeze(
  ['split', 'stack', 'primary-sidebar', 'primary-bottom', 'grid', 'focus']
    .flatMap((family) => [0.33, 0.4, 0.5, 0.6, 0.67, 0.75, 0.8]
      .flatMap((ratio) => ['forward', 'reverse', 'center'].map((direction) =>
        Object.freeze({ id: `${family}-${ratio}-${direction}`, family, ratio, direction })))),
);

export function resolveLayout(candidate, count, viewport) {
  if (!count) return [];
  const gap = 12;
  const margin = Math.min(12, viewport.width / 10, viewport.height / 10);
  const width = viewport.width - margin * 2;
  const height = viewport.height - margin * 2;
  const narrow = viewport.width < 650;
  const vertical = narrow || ['stack', 'primary-bottom'].includes(candidate.family);
  let rects;
  if (count === 1) rects = [{ x: margin, y: margin, width, height }];
  else if (candidate.family === 'grid' && !narrow) {
    const columns = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / columns);
    const w = (width - gap * (columns - 1)) / columns;
    const h = (height - gap * (rows - 1)) / rows;
    rects = Array.from({ length: count }, (_, i) => ({ x: margin + i % columns * (w + gap), y: margin + Math.floor(i / columns) * (h + gap), width: w, height: h }));
  } else {
    const extent = vertical ? height : width;
    const primary = count === 2 ? (extent - gap) * candidate.ratio : (extent - gap) * candidate.ratio;
    const other = (extent - primary - gap * (count - 1)) / (count - 1);
    let offset = margin;
    rects = Array.from({ length: count }, (_, i) => {
      const size = i === 0 ? primary : other;
      const rect = vertical ? { x: margin, y: offset, width, height: size } : { x: offset, y: margin, width: size, height };
      offset += size + gap;
      return rect;
    });
  }
  if (candidate.direction === 'reverse') rects.reverse();
  return rects.map((rect) => Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, Math.round(value * 100) / 100])));
}
