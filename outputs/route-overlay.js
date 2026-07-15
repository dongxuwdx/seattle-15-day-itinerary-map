/* Apple Maps-inspired route treatment: a single clear road-following line. */
window.addEventListener('load', () => {
  const oldShow = show;
  let overlay = [];

  const arrow = (a, b) => {
    const degrees = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    return L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], {
      interactive: false,
      icon: L.divIcon({
        className: '',
        html: `<div style="color:#fff;background:#007aff;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px #0004;width:22px;height:22px;font:700 15px/18px -apple-system;text-align:center;transform:rotate(${degrees}deg)">›</div>`,
        iconSize: [22, 22], iconAnchor: [11, 11]
      })
    });
  };

  show = async function (i) {
    oldShow(i);
    overlay.forEach(layer => map.removeLayer(layer));
    overlay = [];
    const points = D[i].p.map(x => [x[2], x[3]]);

    for (let k = 0; k < points.length - 1; k++) {
      const a = points[k], b = points[k + 1];
      let path = [a, b];
      try { path = await roadLine([a, b], i < 7 ? 'foot' : 'driving'); } catch (_) {}
      const casing = L.polyline(path, { color: '#ffffff', weight: 9, opacity: .92 }).addTo(map);
      const line = L.polyline(path, { color: '#007aff', weight: 5, opacity: .96 }).addTo(map);
      const midpoint = Math.max(1, Math.floor(path.length / 2));
      overlay.push(casing, line, arrow(path[midpoint - 1], path[midpoint]).addTo(map));
    }
  };
  show(0);
});
