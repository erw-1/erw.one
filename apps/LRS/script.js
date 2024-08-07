//// Config
// Initialize the map
const map = L.map('map', { center: [47.6205, 6.3498], zoom: 10, zoomControl: false });
L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
  attribution: 'Erwan Vinot - HSN | OSM',
  maxNativeZoom: 19,
  maxZoom: 22
}).addTo(map);

// Create Panes, bottom to top
['routesPane', 'pointsPane', 'previewPane'].forEach((pane, index) => {
  map.createPane(pane).style.zIndex = 400 + index;
});

// Define styles
const styles = {
  route: { color: "#4d4d4d", weight: 2, opacity: 1, pane: 'routesPane', renderer: L.canvas() },
  point: { radius: 3, fillColor: "#ff0000", color: "none", fillOpacity: 1, pane: 'pointsPane' },
  preview: { radius: 3, fillColor: "#ffff00", color: "none", fillOpacity: 1, pane: 'previewPane' },
  selected: { radius: 3, fillColor: "#00ff00", color: "none", fillOpacity: 1, pane: 'previewPane' },
  highlight: { radius: 3, fillColor: "#ffa500", color: "none", fillOpacity: 1, pane: 'previewPane' },
  tooltip: { permanent: true, direction: 'top', offset: [0, -10], className: 'highlighted-tooltip', pane: 'previewPane' },
  prTooltip: { permanent: true, direction: 'top', offset: [0, -10], className: 'pr-tooltip', pane: 'previewPane' }
};

// Define HTML content for tooltips
const htmlContent = {
  tooltip: (roadName) => `<b>${roadName}</b>`,
  prTooltipContent: (num_pr, distance) => `<b>PR${num_pr}</b><br>${distance.toFixed(1)} m`
};

// Utility Functions
const simplifyGeometry = (geojson, tolerance) => turf.simplify(geojson, { tolerance: tolerance, highQuality: false });

const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
};

const togglePaneVisibility = (paneName, zoomLevel) => {
  map.getPane(paneName).style.display = map.getZoom() >= zoomLevel ? 'block' : 'none';
};

// Function to find the closest PRs from the previewed point along the road
const findClosestPRs = (previewPoint, roadLine, routeId) => {
  const prPoints = [];
  window.pointsLayer.eachLayer(layer => {
    if (layer.feature.properties.route_pr === routeId) {
      const prPoint = turf.point([layer.getLatLng().lng, layer.getLatLng().lat]);
      prPoints.push({ layer, point: prPoint, properties: layer.feature.properties });
    }
  });

  const distances = prPoints.map(pr => ({
    prLayer: pr.layer,
    distance: turf.length(turf.lineSlice(previewPoint, pr.point, roadLine), { units: 'meters' }),
    properties: pr.properties
  }));

  distances.sort((a, b) => a.distance - b.distance);

  return distances.slice(0, 2); // Return the two closest PRs
};

// Function to update the preview marker with a tooltip
let previewMarker;
let prTooltips = [];
let highlightedPRs = [];
let eventsAdded = false;

const updatePreviewMarker = (e) => {
  if (previewMarker) map.removeLayer(previewMarker);
  prTooltips.forEach(tooltip => map.removeLayer(tooltip));
  prTooltips = [];
  highlightedPRs.forEach(pr => map.removeLayer(pr));
  highlightedPRs = [];

  const roadsLayer = window.routesLayer; // Assuming routesLayer is the layer with road data
  if (!roadsLayer) return;

  const maxDistance = 200; // in meters
  const cursorPoint = turf.point([e.latlng.lng, e.latlng.lat]);
  let closestPoint = null;
  let closestDistance = Infinity;
  let roadName = '';
  let roadLine = null;

  roadsLayer.eachLayer(layer => {
    const line = turf.lineString(layer.getLatLngs().map(latlng => [latlng.lng, latlng.lat]));
    const snapped = turf.nearestPointOnLine(line, cursorPoint);
    const distance = turf.distance(cursorPoint, snapped, { units: 'meters' });

    if (distance < closestDistance && distance <= maxDistance) {
      closestDistance = distance;
      closestPoint = L.latLng(snapped.geometry.coordinates[1], snapped.geometry.coordinates[0]);
      roadName = layer.feature.properties.nom_route; // Road name field
      roadLine = line;
    }
  });

  if (closestPoint) {
    previewMarker = L.circleMarker(closestPoint, styles.preview).addTo(map);
    map.getContainer().style.cursor = 'pointer'; // Change cursor to pointer
    const closestPRs = findClosestPRs(turf.point([closestPoint.lng, closestPoint.lat]), roadLine, roadName);
    previewMarker.bindTooltip(htmlContent.tooltip(roadName), styles.tooltip).openTooltip();
    
    closestPRs.forEach(pr => {
      const prMarker = L.circleMarker(pr.prLayer.getLatLng(), styles.highlight)
        .bindTooltip(htmlContent.prTooltipContent(pr.properties.num_pr, pr.distance), styles.prTooltip)
        .addTo(map);
      prTooltips.push(prMarker);
      highlightedPRs.push(prMarker);
    });
  } else {
    map.getContainer().style.cursor = ''; // Reset cursor
  }
};

// Function to handle click event to place the previewed marker
const selectPreviewMarker = (e) => {
  if (previewMarker) {
    const latlng = previewMarker.getLatLng();
    L.circleMarker(latlng, styles.selected).addTo(map);
  }
};

const addGeoJsonLayer = (url, style, pointToLayer, simplify = false, layerVar) => {
  fetch(url)
    .then(response => response.json())
    .then(data => {
      if (simplify) data = simplifyGeometry(data, 1 / Math.pow(2, map.getZoom()));
      const layer = L.geoJson(data, { style, pointToLayer }).addTo(map);
      if (layerVar && window[layerVar]) map.removeLayer(window[layerVar]);
      window[layerVar] = layer;
    });
};

const initializeMap = () => {
  addGeoJsonLayer('data/routes70.geojson', styles.route, null, true, 'routesLayer');
  addGeoJsonLayer('data/pr70.geojson', null, (feature, latlng) => L.circleMarker(latlng, styles.point), false, 'pointsLayer');
  togglePaneVisibility('pointsPane', 14);
};

initializeMap();

map.on('zoomend', () => {
  addGeoJsonLayer('data/routes70.geojson', styles.route, null, true, 'routesLayer');
  togglePaneVisibility('pointsPane', 14);
  togglePaneVisibility('previewPane', 14);

  if (map.getZoom() >= 14 && !eventsAdded) {
    map.on('mousemove', debounce(updatePreviewMarker, 50));
    map.on('click', selectPreviewMarker);
    eventsAdded = true;
  }
});
