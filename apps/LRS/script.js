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
  tooltip: { permanent: true, direction: 'top', offset: [0, -10], className: 'highlighted-tooltip' },
  prTooltip: { permanent: true, direction: 'top', offset: [0, -10], className: 'pr-tooltip' }
};

// Define HTML content for tooltips
const htmlContent = {
  tooltip: (roadName) => `<b>${roadName}</b>`,
  prTooltipContent: (num_pr, distance) => `<b>PR${num_pr}</b><br>${distance.toFixed(1)} m`
};

// Utility Functions
// Geometry simplification
const simplifyGeometry = (geojson, tolerance) => turf.simplify(geojson, { tolerance: tolerance, highQuality: false });

// Debounce utility
const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
};

// Function to toggle pane visibility based on zoom level
const togglePaneVisibility = (paneName, zoomLevel) => {
  map.getPane(paneName).style.display = map.getZoom() >= zoomLevel ? 'block' : 'none';
};

//// Map content Functions
// GeoJSON layer addition function
const addGeoJsonLayer = (url, style, pointToLayer, simplify = false, layerVar) => {
  fetch(url)
    .then(response => response.json())
    .then(data => {
      if (simplify) data = simplifyGeometry(data, 1 / Math.pow(2, map.getZoom())); // Simplify geometry if needed
      const layer = L.geoJson(data, { style, pointToLayer }).addTo(map);
      if (layerVar && window[layerVar]) map.removeLayer(window[layerVar]); // Remove duplicates
      window[layerVar] = layer;
    });
};

// Function to find the closest PR distances from the previewed point along the road
const findClosestPRs = (point, routeId) => {
  const prPoints = [];
  window.pointsLayer.eachLayer(layer => {
    if (layer.feature.properties.route_pr === routeId) {
      const prPoint = turf.point([layer.getLatLng().lng, layer.getLatLng().lat]);
      prPoints.push({ layer, distance: turf.distance(point, prPoint, { units: 'meters' }), properties: layer.feature.properties });
    }
  });
  prPoints.sort((a, b) => a.distance - b.distance);

  const closestAhead = prPoints.find(pr => pr.layer.getLatLng().lng > point.geometry.coordinates[0]);
  const closestBehind = prPoints.find(pr => pr.layer.getLatLng().lng < point.geometry.coordinates[0]);

  return [closestAhead, closestBehind].filter(Boolean);
};

// Function to update the preview marker with a tooltip
let previewMarker;
const updatePreviewMarker = (e) => {
  if (previewMarker) map.removeLayer(previewMarker);

  const roadsLayer = window.routesLayer; // Assuming routesLayer is the layer with road data
  if (!roadsLayer) return;

  const maxDistance = 200; // in meters
  const cursorPoint = turf.point([e.latlng.lng, e.latlng.lat]);
  let closestPoint = null;
  let closestDistance = Infinity;
  let roadName = '';

  roadsLayer.eachLayer(layer => {
    const line = turf.lineString(layer.getLatLngs().map(latlng => [latlng.lng, latlng.lat]));
    const snapped = turf.nearestPointOnLine(line, cursorPoint);
    const distance = turf.distance(cursorPoint, snapped, { units: 'meters' });

    if (distance < closestDistance && distance <= maxDistance) {
      closestDistance = distance;
      closestPoint = L.latLng(snapped.geometry.coordinates[1], snapped.geometry.coordinates[0]);
      roadName = layer.feature.properties.nom_route; // Road name field
    }
  });

  if (closestPoint) {
    previewMarker = L.circleMarker(closestPoint, styles.preview).addTo(map);
    map.getContainer().style.cursor = 'pointer'; // Change cursor to pointer

    const closestPRs = findClosestPRs(turf.point([closestPoint.lng, closestPoint.lat]), roadName);

    previewMarker.bindTooltip(htmlContent.tooltip(roadName), styles.tooltip).openTooltip();

    closestPRs.forEach(pr => {
      L.circleMarker(pr.layer.getLatLng(), styles.highlight)
        .bindTooltip(htmlContent.prTooltipContent(pr.properties.num_pr, pr.distance), styles.prTooltip)
        .addTo(map);
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

// Function to initialize the map with data
const initializeMap = () => {
  addGeoJsonLayer('data/routes70.geojson', styles.route, null, true, 'routesLayer'); // Simplify and add routes layer
  addGeoJsonLayer('data/pr70.geojson', null, (feature, latlng) => L.circleMarker(latlng, styles.point), false, 'pointsLayer'); // Add points layer
  togglePaneVisibility('pointsPane', 14); // Handle points pane visibility based on initial zoom level
};

//// Interactions
// Load initial layers
initializeMap();

// Update routes layer and pane visibility on zoom end
map.on('zoomend', () => {
  addGeoJsonLayer('data/routes70.geojson', styles.route, null, true, 'routesLayer'); // Simplify and update routes layer
  togglePaneVisibility('pointsPane', 14);  // Handle points pane visibility only when necessary
  togglePaneVisibility('previewPane', 14);
  if (map.getZoom() >= 14) {
    map.on('mousemove', debounce(updatePreviewMarker, 50));
    map.on('click', selectPreviewMarker);
  }
});
