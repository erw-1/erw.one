//// Config
// variables
const MIN_ZOOM_LEVEL_FOR_PANES = 14;
let previewMarker;
let prTooltips = [];
let highlightedPRs = [];
let currentPRs = { roadName: '', closestAhead: null, closestBehind: null };
let eventsAdded = false;

// Define styles for map elements and layers
const styles = {
  mapTileLayer: 'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
  mapTileLayerAttribution: 'Erwan Vinot - HSN | OSM',
  mapOptions: { center: [47.6205, 6.3498], zoom: 10, zoomControl: false },
  route: { color: "#4d4d4d", weight: 2, opacity: 1, pane: 'routesPane', renderer: L.canvas() },
  point: { radius: 3, fillColor: "#ff0000", color: "none", fillOpacity: 1, pane: 'pointsPreviewPane' },
  preview: { radius: 3, fillColor: "#ffff00", color: "none", fillOpacity: 1, pane: 'pointsPreviewPane' },
  selected: { radius: 3, fillColor: "#00ff00", color: "none", fillOpacity: 1, pane: 'pointsPreviewPane' },
  highlight: { radius: 3, fillColor: "#ffa500", color: "none", fillOpacity: 1, pane: 'pointsPreviewPane' },
  tooltip: { permanent: true, direction: 'top', offset: [0, -10], className: 'highlighted-tooltip', pane: 'pointsPreviewPane' },
  prTooltip: { permanent: true, direction: 'top', offset: [0, -10], className: 'pr-tooltip', pane: 'pointsPreviewPane' },
  popup: { closeOnClick: false, autoClose: false }
};

// Define HTML content for tooltips
const htmlContent = {
  tooltip: (roadName) => `<b>${roadName}</b>`,
  prTooltipContent: (num_pr, distance) => `<b>PR${num_pr}</b><br>${distance} m`,
  popupContent: (roadName, distanceAhead, prAhead, distanceBehind, prBehind) => `<b>${roadName}</b><br>Point à ${distanceAhead} m du PR ${prAhead}.<br>Et à ${distanceBehind} m du PR ${prBehind}.`
};

// Initialize the map with specified options
const map = L.map('map', styles.mapOptions);
L.tileLayer(styles.mapTileLayer, { attribution: styles.mapTileLayerAttribution, maxNativeZoom: 19, maxZoom: 22 }).addTo(map);

// Create Panes, from bottom to top
['routesPane', 'pointsPreviewPane'].forEach((pane, index) => {map.createPane(pane).style.zIndex = 400 + index;});


//// Utility Functions
// Function to add GeoJSON layers to the map
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

// Simplify GeoJSON data to improve performance
const simplifyGeometry = (geojson, tolerance) => turf.simplify(geojson, { tolerance: tolerance, highQuality: false });

// Debounce utility to limit the rate at which a function can fire
const debounce = (func, delay) => { let timeoutId; return (...args) => { if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => { func(...args); }, delay);};
};

// Toggle visibility of a pane based on the zoom level
const togglePaneVisibility = (paneName, zoomLevel) => {
  map.getPane(paneName).style.display = map.getZoom() >= zoomLevel ? 'block' : 'none';
};

// Helper function to find the closest point on the road to the cursor
const findClosestPointOnRoad = (cursorPoint, roadsLayer, maxDistance) => {
  let closestPoint = null;
  let closestDistance = 1000;
  let roadName = '';
  let roadLine = null;

  // Iterate through each layer in roadsLayer to find the closest point on the road
  roadsLayer.eachLayer(layer => {
    const line = turf.lineString(layer.getLatLngs().map(latlng => [latlng.lng, latlng.lat]));
    const snapped = turf.nearestPointOnLine(line, cursorPoint);
    const distance = turf.distance(cursorPoint, snapped, { units: 'meters' }).toFixed(1);

    // Update closest point if a closer point is found
    if (distance < closestDistance && distance <= maxDistance) {
      closestDistance = distance;
      closestPoint = L.latLng(snapped.geometry.coordinates[1], snapped.geometry.coordinates[0]);
      roadName = layer.feature.properties.nom_route; // Road name field
      roadLine = line;
    }
  });
  return { closestPoint, roadName, roadLine };
};

// Helper function to find the closest PRs in both directions
const findClosestPRs = (previewPoint, roadLine, routeId) => {
  const prPoints = [];
  // Collect all PR points for the given route
  window.pointsLayer.eachLayer(layer => {
    if (layer.feature.properties.route_pr === routeId) {
      const prPoint = turf.point([layer.getLatLng().lng, layer.getLatLng().lat]);
      prPoints.push({ layer, point: prPoint, properties: layer.feature.properties });
    }
  });

  // Calculate distances from the preview point to each PR point along the road
  const distances = prPoints.map(pr => ({
    prLayer: pr.layer,
    distance: turf.length(turf.lineSlice(previewPoint, pr.point, roadLine), { units: 'meters' }).toFixed(1),
    properties: pr.properties
  }));

  // Sort the PR points by distance
  distances.sort((a, b) => a.distance - b.distance);
  return distances.slice(0, 2); // Return the two closest PRs
};


//// Interaction Functions
// Function to update the preview marker with a tooltip when mouse moves
const updatePreviewMarker = (e) => {
  // Remove existing preview marker and tooltips
  if (previewMarker) map.removeLayer(previewMarker);
  prTooltips.forEach(tooltip => map.removeLayer(tooltip));
  prTooltips = [];
  highlightedPRs.forEach(pr => map.removeLayer(pr));
  highlightedPRs = [];

  const roadsLayer = window.routesLayer;
  if (!roadsLayer) return;

  const maxDistance = 200; // in meters
  const cursorPoint = turf.point([e.latlng.lng, e.latlng.lat]);
  const { closestPoint, roadName, roadLine } = findClosestPointOnRoad(cursorPoint, roadsLayer, maxDistance);

  if (closestPoint) {
    // Create and add preview marker to the map
    previewMarker = L.circleMarker(closestPoint, styles.preview).addTo(map);
    map.getContainer().style.cursor = 'pointer'; // Change cursor to pointer
    const closestPRs = findClosestPRs(turf.point([closestPoint.lng, closestPoint.lat]), roadLine, roadName);
    previewMarker.bindTooltip(htmlContent.tooltip(roadName), styles.tooltip).openTooltip();

    // Store current PRs information
    currentPRs = {
      roadName,
      closestAhead: closestPRs[0] ? { distance: closestPRs[0].distance, num_pr: closestPRs[0].properties.num_pr } : null,
      closestBehind: closestPRs[1] ? { distance: closestPRs[1].distance, num_pr: closestPRs[1].properties.num_pr } : null
    };

    // Highlight the closest PRs on the map
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

// Function to handle click event to place the previewed marker with a popup
const selectPreviewMarker = (e) => {
  if (previewMarker) {
    const latlng = previewMarker.getLatLng();
    const popupContent = htmlContent.popupContent(
      currentPRs.roadName,
      currentPRs.closestAhead ? currentPRs.closestAhead.distance : 0, currentPRs.closestAhead ? currentPRs.closestAhead.num_pr : 'N/A',
      currentPRs.closestBehind ? currentPRs.closestBehind.distance : 0, currentPRs.closestBehind ? currentPRs.closestBehind.num_pr : 'N/A'
    );
    const marker = L.circleMarker(latlng, styles.selected)
      .bindPopup(popupContent, styles.popup)
      .addTo(map)
      .openPopup();

    // Remove marker when the popup is closed
    marker.on('popupclose', () => {
      map.removeLayer(marker);
    });
  }
};

// Function to initialize the map with the required data layers
const initializeMap = () => {
  addGeoJsonLayer('data/routes70.geojson', styles.route, null, true, 'routesLayer');
  addGeoJsonLayer('data/pr70.geojson', null, (feature, latlng) => L.circleMarker(latlng, styles.point), false, 'pointsLayer');
  togglePaneVisibility('pointsPreviewPane', MIN_ZOOM_LEVEL_FOR_PANES);
};

//// Start
//Initialize the map Add event listeners for zoom and user interactions
initializeMap();
map.on('zoomend', () => {
  addGeoJsonLayer('data/routes70.geojson', styles.route, null, true, 'routesLayer');
  togglePaneVisibility('pointsPreviewPane', MIN_ZOOM_LEVEL_FOR_PANES);

  if (map.getZoom() >= MIN_ZOOM_LEVEL_FOR_PANES && !eventsAdded) {
    map.on('mousemove', debounce(updatePreviewMarker, 50));
    map.on('click', selectPreviewMarker);
    eventsAdded = true;
  }
});
