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

  // Drive by default. Walk only when adjacent stops are genuinely close.
  const legDistanceKm = (from, to) => {
    const radians = value => value * Math.PI / 180;
    const latitudeDelta = radians(to[2] - from[2]);
    const longitudeDelta = radians(to[3] - from[3]);
    const fromLatitude = radians(from[2]);
    const toLatitude = radians(to[2]);
    const haversine = Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  };
  const prefersWalking = (from, to) => legDistanceKm(from, to) <= 0.8;

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

  const englishDays = [
    ['Arrival & Pike Place Market', 'Easy arrival day', [['After arrival', 'Start with the market and nearby streets at an easy pace.'], ['Early evening', 'A quick photo stop below the market.'], ['Before sunset', 'Take a relaxed walk along the waterfront.'], ['Sunset', 'Ride for Elliott Bay views if the weather is clear.']]],
    ['Seattle Center', 'Mostly indoors', [['Morning', 'Reserve a timed entry in advance.'], ['Midday', 'Located next to the Space Needle.'], ['Afternoon', 'Explore exhibits on music and popular culture.'], ['Evening', 'See the classic Seattle skyline view.']]],
    ['Downtown Architecture & Art', 'Good for rain', [['Morning', 'Make this the main indoor stop on a rainy day.'], ['Midday', 'Explore brick-lined streets and local cafés.'], ['Afternoon', 'Visit for the architecture itself.'], ['Evening', 'Choose from a dense mix of restaurants, bars, and cafés.']]],
    ['Capitol Hill & Volunteer Park', 'Slow day · Coffee', [['Morning', 'A compact greenhouse that also works well in wet weather.'], ['Midday', 'Conveniently located beside the park.'], ['Afternoon', 'Climb for city views when the tower is open.'], ['Evening', 'Pick a neighborhood restaurant or cocktail bar.']]],
    ['Ballard & Fremont', 'Best in clear weather', [['Morning', 'Watch boats pass through the locks and visit the fish ladder.'], ['Afternoon', 'Enjoy the beach and Olympic Mountains views.'], ['Early evening', 'Stop at this playful neighborhood landmark.'], ['Sunset', 'See the downtown skyline from the lakeshore.']]],
    ['Pike Place Market in Depth', 'Can swap with D1', [['Breakfast', 'Arrive early to avoid the midday crowds.'], ['Morning', 'Explore the indoor marine exhibits.'], ['Afternoon', 'Walk through this free outdoor sculpture park.'], ['Evening', 'Relax by the water or return to the market for dinner.']]],
    ['Bainbridge Island', 'Ferry day trip', [['Morning', 'Check the ferry schedule in advance.'], ['Morning', 'Walk into Winslow after arriving on the island.'], ['Midday', 'Browse the main street and stop for lunch.'], ['Afternoon', 'Reserve ahead; without a car, spend more time around Winslow instead.']]],
    ['Mount Rainier National Park', 'Weather-sensitive · Car or tour', [['Early morning', 'Arrive as early as possible and bring warm, waterproof layers.'], ['Morning', 'Hike only as far as your energy and conditions allow.'], ['Afternoon', 'Reflections are best when the air is calm.'], ['Return trip', 'Make a short stop before leaving the mountain.']]],
    ['Recovery Day by Lake Washington', 'Relax after Mount Rainier', [['Morning', 'Take a slow walk on shaded garden trails.'], ['Afternoon', 'Explore the campus and see Suzzallo Library.'], ['Evening', 'Shop, have dinner, and restock essentials.']]],
    ['Olympic National Park', 'Weather-sensitive · Early start', [['Early morning', 'Take the ferry if driving; join a tour if you do not have a car.'], ['Morning', 'Enjoy ridge views after confirming the road is open.'], ['Midday', 'Stop for lunch and supplies.'], ['Afternoon', 'Spend time by the lake before returning.']]],
    ['International District & Chinatown', 'Good for rain', [['Morning', 'Learn about Asian American immigrant history.'], ['Midday', 'Browse the Japanese grocery store and prepared-food counters.'], ['Afternoon', 'Walk the neighborhood and stop for dessert.'], ['Evening', 'Add a game only if one is scheduled.']]],
    ['Whidbey Island', 'Best by car', [['Morning', 'Take the ferry to the island.'], ['Midday', 'Have lunch in this small waterfront town.'], ['Afternoon', 'Explore the historic district and old wharf.'], ['Evening', 'Visit only if time allows, and leave before dark.']]],
    ['Boeing & Everett', 'Confirm tour times', [['Morning', 'Confirm factory-tour times and ID requirements in advance.'], ['Afternoon', 'Visit the waterfront lighthouse and bay.'], ['Evening', 'Have dinner by the water or take a beach walk.']]],
    ['West Seattle & Alki Beach', 'Clear weather · Easy day', [['Morning', 'Take the water taxi to West Seattle.'], ['Midday', 'Enjoy the beach, city views, and lunch.'], ['Afternoon', 'Take an easy walk along the shoreline.'], ['Evening', 'Browse local shops and have dinner.']]],
    ['Flexible Finish & Departure', 'Stay close on departure day', [['Morning', 'Pick up coffee, chocolate, or last-minute souvenirs.'], ['Midday', 'Visit if your flight leaves later in the day.'], ['Before departure', 'Take Link Line 1 to the airport.'], ['Departure', 'Allow extra time for an international flight.']]]
  ];

  document.documentElement.lang = 'en';
  document.title = 'Seattle 15-Day Itinerary Map';
  document.querySelector('.hero').innerHTML = '<h1>Seattle · 15-Day Itinerary</h1><p>Open a day card to see each stop and suggested time, then use Apple Maps for leg-by-leg directions or individual places.</p>';
  document.querySelector('.note').innerHTML = '<strong>Travel note:</strong> Walk, take Link light rail, or use buses on city days. For Mount Rainier, Olympic National Park, and Whidbey Island, rent a car or book a day tour. Swap mountain and island days based on weather, and check roads, ferries, and park conditions before leaving.';
  document.querySelector('.footer').textContent = 'This itinerary assumes a hotel near Downtown or Pike Place. Places and routes are suggestions; Apple Maps opens in a new window so you can adjust for traffic, energy, and opening hours.';

  D.forEach((day, dayIndex) => {
    const english = englishDays[dayIndex];
    day.t = english[0];
    day.w = english[1];
    day.p.forEach((stop, stopIndex) => {
      stop[0] = english[2][stopIndex][0];
      stop[4] = english[2][stopIndex][1];
    });

    const card = document.querySelectorAll('.day')[dayIndex];
    card.innerHTML = `<div class="head"><span class="num">${day.n}</span><h2>${day.t}</h2></div><div class="area">${day.a}</div><div class="route">${day.p.map(stop => stop[1]).join(' → ')}</div><p><span class="tag">Drive by default · Walk short legs</span><span class="weather">${day.w}</span></p><section class="details">${day.p.map((stop, stopIndex) => {
      const walking = stopIndex > 0 && prefersWalking(day.p[stopIndex - 1], stop);
      const legButton = stopIndex === 0 ? '' : `<a class="btn routebtn" target="_blank" rel="noopener" href="${appleLeg(day.p[stopIndex - 1], stop, walking)}">${walking ? 'Walk' : 'Drive'} ${stopIndex} → ${stopIndex + 1}</a>`;
      return `<div class="stop"><strong>${stopIndex + 1}. ${stop[1]}</strong> <span class="time">${stop[0]}</span><p>${stop[4]}</p><a class="btn" target="_blank" rel="noopener" href="${applePlace(stop[1], stop[2], stop[3])}">Open in Apple Maps</a>${legButton}</div>`;
    }).join('')}</section>`;
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
        return await fetchLeg(from, points[index + 1], prefersWalking(day.p[index], day.p[index + 1]));
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
