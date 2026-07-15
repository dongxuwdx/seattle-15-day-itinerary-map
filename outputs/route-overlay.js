window.addEventListener('load', () => {
  const colors = ['#f97316', '#8b5cf6', '#ec4899', '#0ea5e9'];
  const oldShow = show;
  show = async function (i) {
    oldShow(i);
    const d = D[i], pts = d.p.map(x => [x[2], x[3]]);
    const layers = [];
    const arrow = (a, b, color) => {
      const deg = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
      return L.marker([(a[0]+b[0])/2, (a[1]+b[1])/2], { interactive:false, icon:L.divIcon({className:'', html:`<div style="color:${color};text-shadow:0 0 4px white;font:bold 30px sans-serif;transform:rotate(${deg}deg)">➜</div>`, iconSize:[30,30], iconAnchor:[15,15]}) });
    };
    pts.slice(0, -1).forEach((a, k) => {
      const b = pts[k+1], color = colors[k];
      layers.push(L.polyline([a,b], {color, weight:7, opacity:.95}).addTo(map));
      layers.push(arrow(a,b,color).addTo(map));
    });
    window.routeOverlay?.forEach(x => map.removeLayer(x));
    window.routeOverlay = layers;
  };
  show(0);
});
