// Constants
const SIMPLIFICATION_THRESHOLD = 0.01;
const MAGNETISM_RANGE = 600;
const ZOOM_REQUIREMENT = 15;
const DEBOUNCE_DELAY = 300; // in milliseconds

// Map Initialization
const map = L.map('map', {
  center: [47.6205, 6.3498],
  zoom: 10,
  zoomControl: false,
});

L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
  attribution: 'Erwan Vinot | HSN | OSM',
  maxNativeZoom: 19,
  maxZoom: 22
}).addTo(map);

// Create Panes
['routesPane', 'pointsPane', 'previewPane'].forEach((pane, index) => {
  map.createPane(pane).style.zIndex = 400 + (index * 100);
});

// Layer Groups
let routesLayer, pointsLayer, previewPoint, highlightedLayer, highlightedTooltip, originalData;
const closestPrLayer = L.layerGroup();
const clickedPointsLayer = L.layerGroup();
let closestPrTooltips = [];

// Styles and HTML content
const styles = {
  route: { color: "#4d4d4d", weight: 2, opacity: 0.8, pane: 'routesPane' },
  highlight: { color: "#2d2d2d", weight: 3, opacity: 1, pane: 'routesPane' },
  point: (fillColor) => ({ radius: 3, fillColor, color: "none", fillOpacity: 1, pane: 'pointsPane' }),
  preview: { radius: 3, fillColor: "#ffff00", color: "none", fillOpacity: 1, pane: 'previewPane' },
  tooltip: { permanent: true, direction: 'top', offset: [0, -10], className: 'highlighted-tooltip' },
  prTooltip: { permanent: true, direction: 'top', offset: [0, -10], className: 'pr-tooltip' },
  popup: { closeButton: true }
};

const htmlContent = {
  roadName: (roadName) => String(roadName),
  prTooltipContent: (num_pr, distance) => `<b>PR${num_pr}</b><br>${distance.toFixed(1)} m`,
  popupContent: (roadName, distanceAhead, prAhead, distanceBehind, prBehind) => `<b>${roadName}</b><br>Point à ${distanceAhead.toFixed(1)} m du PR ${prAhead}.<br>Et à ${distanceBehind.toFixed(1)} m du PR ${prBehind}.`
};

// Utility Functions
const simplifyGeometry = (data, zoom) => turf.simplify(data, { tolerance: zoom < ZOOM_REQUIREMENT ? SIMPLIFICATION_THRESHOLD : 0, highQuality: true });

// Debounce function
const debounce = (func, delay) => {
  let debounceTimer;
  return function() {
    const context = this;
    const args = arguments;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => func.apply(context, args), delay);
  };
};

const getNearestPoint = (latlng) => {
  const point = turf.point([latlng.lng, latlng.lat]);
  let nearestPoint = null, minDistance = MAGNETISM_RANGE, nearestLayer = null;

  routesLayer.eachLayer(layer => {
    const line = turf.feature(layer.feature.geometry);
    const snapped = turf.nearestPointOnLine(line, point);
    const distance = turf.distance(point, snapped, { units: 'meters' });

    if (distance < minDistance) {
      minDistance = distance;
      nearestPoint = snapped;
      nearestLayer = layer;
    }
  });

  return { nearestPoint, nearestLayer };
};

const findClosestPRs = (point, routeId) => {
  const prPoints = [];
  pointsLayer.eachLayer(layer => {
    if (layer.feature.properties.route_pr === routeId) {
      const prPoint = turf.point([layer.getLatLng().lng, layer.getLatLng().lat]);
      prPoints.push({ layer, distance: turf.distance(point, prPoint, { units: 'meters' }), properties: layer.feature.properties });
    }
  });
  prPoints.sort((a, b) => a.distance - b.distance);

  return [
    prPoints.find(pr => pr.layer.getLatLng().lng > point[0]),
    prPoints.find(pr => pr.layer.getLatLng().lng < point[0])
  ].filter(Boolean);
};

// Initialize map without event handlers
const initializeMap = async () => {
  const [routesResponse, prResponse] = await Promise.all([
    fetch('data/routes70.geojson'),
    fetch('data/pr70.geojson')
  ]);

  originalData = await routesResponse.json();
  routesLayer = L.geoJson(simplifyGeometry(originalData, map.getZoom()), { 
    style: styles.route, 
    renderer: L.canvas({ padding: 0.5 }) // Using canvas renderer
  }).addTo(map);

  const prData = await prResponse.json();
  pointsLayer = L.geoJson(prData, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, styles.point("#ff0000"))
  }).addTo(map);
};

// Debounced getNearestPoint
const debouncedGetNearestPoint = debounce(getNearestPoint, DEBOUNCE_DELAY);

// Example of attaching the debounced function to a map event
map.on('click', (e) => {
  const result = debouncedGetNearestPoint(e.latlng);
  // Do something with the result
});

initializeMap();
