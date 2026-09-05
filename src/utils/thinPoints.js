export function thinPoints(points, cap) {
  if (!Number.isInteger(cap) || cap <= 0) return points;
  if (points.length <= cap) return points;
  const step = points.length / cap;
  const out = [];
  for (let i = 0; i < cap - 1; i++) out.push(points[Math.min(points.length - 1, Math.floor(i * step))]);
  out.push(points[points.length - 1]);
  return out;
}

export function thinSeries(series, maxPoints) {
  const total = series.reduce((n, s) => n + s.data.length, 0);
  if (total <= maxPoints) return series;
  const cap = Math.max(1, Math.floor(maxPoints / series.length));
  return series.map(s => ({ ...s, data: thinPoints(s.data, cap) }));
}
