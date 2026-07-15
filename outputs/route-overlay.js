/* Clear, color-coded route legs with arrowheads near each destination. */
(() => {
  const colors = ['#ff9f0a', '#af52de', '#ff375f', '#0a84ff'];
  let requestId = 0;

  const decodePolyline = (encoded, precision = 6) => {
    const points = [];
    const factor = 10 ** precision;
    let index = 0, latitude = 0, longitude = 0;

    while (index < encoded.length) {
      const decodeValue = () => {
        let result = 0, shift = 0, byte;
        do {
          byte = encoded.charCodeAt(index++) - 63;
          result |= (byte & 31) << shift;
          shift += 5;
        } while (byte >= 32);
        return result & 1 ? ~(result >> 1) : result >> 1;
      };
      latitude += decodeValue();
      longitude += decodeValue();
      points.push([latitude / factor, longitude / factor]);
    }
    return points;
  };

  const fetchLeg = async (from, to, pedestrian) => {
    const request = {
      locations: [
        { lat: from[0], lon: from[1] },
        { lat: to[0], lon: to[1] }
      ],
      costing: pedestrian ? 'pedestrian' : 'auto',
      units: 'kilometers'
    };
    const url = 'https://valhalla1.openstreetmap.de/route?json=' +
      encodeURIComponent(JSON.stringify(request));
    const response = await fetch(url);
    if (!response.ok) throw new Error('Route unavailable');
    const data = await response.json();
    return decodePolyline(data.trip.legs[0].shape);
  };

  // Keep the arrow a fixed visual distance before the destination pin.
  const pointBeforeEnd = (path, gap = 31) => {
    let remaining = gap;
    for (let index = path.length - 1; index > 0; index--) {
      const from = map.latLngToLayerPoint(path[index - 1]);
      const to = map.latLngToLayerPoint(path[index]);
      const length = from.distanceTo(to);
      if (length >= remaining) {
        const progress = (length - remaining) / Math.max(length, 1);
        const point = from.add(to.subtract(from).multiplyBy(progress));
        return {
          position: map.layerPointToLatLng(point),
          from: path[index - 1],
          to: path[index]
        };
      }
      remaining -= length;
    }
    return { position: path[0], from: path[0], to: path[1] || path[0] };
  };

  const arrow = (path, color) => {
    const placement = pointBeforeEnd(path);
    const from = map.latLngToLayerPoint(placement.from);
    const to = map.latLngToLayerPoint(placement.to);
    const degrees = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
    const svg = `<svg width="18" height="18" viewBox="0 0 18 18" style="display:block;transform:rotate(${degrees}deg)"><path d="M3 2.5 L16 9 L3 15.5 Z" fill="${color}" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg>`;
    return L.marker(placement.position, {
      interactive: false,
      zIndexOffset: 600,
      icon: L.divIcon({ className: '', html: svg, iconSize: [18, 18], iconAnchor: [9, 9] })
    });
  };

  const numberedPin = number => L.divIcon({
    className: '',
    html: `<div style="background:#087a72;border:3px solid white;border-radius:50%;color:white;box-shadow:0 2px 7px #0005;width:42px;height:42px;font:700 18px/42px -apple-system;text-align:center">${number}</div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21]
  });

  show = async function (dayIndex) {
    const currentRequest = ++requestId;
    marks.forEach(layer => map.removeLayer(layer));
    marks = [];

    const day = D[dayIndex];
    const points = day.p.map(stop => [stop[2], stop[3]]);
    map.fitBounds(points, { padding: [64, 64], maxZoom: dayIndex < 7 ? 16 : 14 });

    const legs = await Promise.all(points.slice(0, -1).map(async (from, index) => {
      try {
        return await fetchLeg(from, points[index + 1], dayIndex < 7);
      } catch (_) {
        return [from, points[index + 1]];
      }
    }));
    if (currentRequest !== requestId) return;

    legs.forEach((path, index) => {
      const color = colors[index % colors.length];
      marks.push(L.polyline(path, { color: 'white', weight: 8, opacity: .96 }).addTo(map));
      marks.push(L.polyline(path, { color, weight: 5, opacity: .98 }).addTo(map));
      marks.push(arrow(path, color).addTo(map));
    });

    day.p.forEach((stop, index) => {
      const marker = L.marker([stop[2], stop[3]], {
        icon: numberedPin(index + 1),
        zIndexOffset: 1000
      }).addTo(map).bindPopup(`<b>${index + 1}. ${stop[1]}</b><br>${stop[0]}`);
      marks.push(marker);
    });
    location.hash = 'day-' + (dayIndex + 1);
  };

  show(0);
})();
