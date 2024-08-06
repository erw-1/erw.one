// Constants
const SIMPLIFICATION_THRESHOLD = 0.01;
const MAGNETISM_RANGE = 600;
const ZOOM_REQUIREMENT = 12;

// Map Initialization
const map = L.map('map', {
  center: [47.6205, 6.3498],
  zoom: 10,
  zoomControl: false
});

L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
  attribution: 'HSN | OSM',
  maxNativeZoom: 19,
  maxZoom: 22
}).addTo(map);

// Create Panes
map.createPane('routesPane').style.zIndex = 400;
map.createPane('pointsPane').style.zIndex = 500;
map.createPane('previewPane').style.zIndex = 600;

// Layer Groups
let routesLayer, pointsLayer, previewPoint, highlightedLayer, highlightedTooltip;
let originalData;
const closestPrLayer = L.layerGroup().addTo(map);
const clickedPointsLayer = L.layerGroup().addTo(map);
let closestPrTooltips = [];

// Styles
const styles = {
  route: { color: "#4d4d4d", weight: 2, opacity: 0.8, pane: 'routesPane' },
  highlight: { color: "#2d2d2d", weight: 3, opacity: 1, pane: 'routesPane' },
  point: (fillColor) => ({ radius: 3, fillColor, color: "none", fillOpacity: 1, pane: 'pointsPane' }),
  preview: { radius: 3, fillColor: "#ffff00", color: "none", fillOpacity: 1, pane: 'previewPane' }
};

// Utility Functions
const simplifyGeometry = (data, zoom) => {
  const tolerance = zoom < ZOOM_REQUIREMENT ? SIMPLIFICATION_THRESHOLD : 0;
  return turf.simplify(data, { tolerance, highQuality: true });
};

const getNearestPoint = (latlng) => {
  const point = turf.point([latlng.lng, latlng.lat]);
  let nearestPoint = null;
  let minDistance = MAGNETISM_RANGE;
  let nearestLayer = null;

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

  const closestAhead = prPoints.find(pr => pr.layer.getLatLng().lng > point[0]);
  const closestBehind = prPoints.find(pr => pr.layer.getLatLng().lng < point[0]);

  return [closestAhead, closestBehind].filter(Boolean);
};

const throttle = (func, limit) => {
  let lastFunc;
  let lastRan;
  return function() {
    const context = this;
    const args = arguments;
    if (!lastRan) {
      func.apply(context, args);
      lastRan = Date.now();
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(() => {
        if ((Date.now() - lastRan) >= limit) {
          func.apply(context, args);
          lastRan = Date.now();
        }
      }, limit - (Date.now() - lastRan));
    }
  };
};

// Event Handlers
const handleMouseMove = throttle((e) => {
  if (map.getZoom() < ZOOM_REQUIREMENT) return;

  // Remove existing tooltips
  if (highlightedTooltip) map.removeLayer(highlightedTooltip);
  closestPrTooltips.forEach(tooltip => map.removeLayer(tooltip));
  closestPrTooltips = [];

  const { nearestPoint, nearestLayer } = getNearestPoint(e.latlng);
  if (!nearestPoint) {
    if (highlightedLayer) routesLayer.resetStyle(highlightedLayer);
    if (previewPoint) map.removeLayer(previewPoint);
    closestPrLayer.clearLayers();
    highlightedLayer = previewPoint = null;
    map.getContainer().style.cursor = '';
    return;
  }

  if (highlightedLayer && highlightedLayer !== nearestLayer) routesLayer.resetStyle(highlightedLayer);
  if (highlightedLayer !== nearestLayer) closestPrLayer.clearLayers();

  nearestLayer.setStyle(styles.highlight);
  highlightedLayer = nearestLayer;
  map.getContainer().style.cursor = 'pointer';

  const roadName = nearestLayer.feature.properties.nom_route;
  highlightedTooltip = L.tooltip({ permanent: true, direction: 'top', offset: [0, -10], className: 'highlighted-tooltip' })
    .setContent(String(roadName))
    .setLatLng([nearestPoint.geometry.coordinates[1], nearestPoint.geometry.coordinates[0]])
    .addTo(map);

  const closestPRs = findClosestPRs(nearestPoint.geometry.coordinates, roadName);
  closestPRs.forEach(pr => {
    const prLatLng = pr.layer.getLatLng();
    const tooltipContent = `<b>PR${pr.properties.num_pr}</b><br>${pr.distance.toFixed(1)} m`;
    const prMarker = L.circleMarker(prLatLng, styles.point("#ffa500")).addTo(closestPrLayer);
    const prTooltip = L.tooltip({ permanent: true, direction: 'top', offset: [0, -10], className: 'pr-tooltip' })
      .setContent(tooltipContent)
      .setLatLng(prLatLng)
      .addTo(map);
    closestPrTooltips.push(prTooltip);
  });

  if (previewPoint) previewPoint.setLatLng([nearestPoint.geometry.coordinates[1], nearestPoint.geometry.coordinates[0]]);
  else previewPoint = L.circleMarker([nearestPoint.geometry.coordinates[1], nearestPoint.geometry.coordinates[0]], styles.preview).addTo(map);
}, 100);

const handleMapClick = (e) => {
  if (map.getZoom() < ZOOM_REQUIREMENT) return;
  const { nearestPoint, nearestLayer } = getNearestPoint(e.latlng);
  if (nearestPoint) {
    const clickedPoint = L.circleMarker([nearestPoint.geometry.coordinates[1], nearestPoint.geometry.coordinates[0]], styles.point("#00ff00"))
      .addTo(clickedPointsLayer);

    const roadName = nearestLayer.feature.properties.nom_route;
    const closestPRs = findClosestPRs(nearestPoint.geometry.coordinates, roadName);

    if (closestPRs.length === 2) {
      const distanceAhead = closestPRs[0].distance;
      const distanceBehind = closestPRs[1].distance;

      const popupContent = `
        <b>${roadName}</b><br>
        Point à ${distanceAhead.toFixed(1)} m du PR ${closestPRs[0].properties.num_pr}.<br>
        Et à ${distanceBehind.toFixed(1)} m du PR ${closestPRs[1].properties.num_pr}.
      `;
      const popup = L.popup({ closeButton: true })
        .setContent(popupContent)
        .setLatLng(clickedPoint.getLatLng())
        .openOn(map);

      popup.on('remove', () => {
        clickedPointsLayer.removeLayer(clickedPoint);
      });
    }
  }
};

const handleZoomEnd = () => {
  const currentZoom = map.getZoom();
  const data = currentZoom >= ZOOM_REQUIREMENT ? originalData : simplifyGeometry(originalData, currentZoom);
  if (currentZoom < ZOOM_REQUIREMENT) {
    map.removeLayer(pointsLayer);
    map.removeLayer(clickedPointsLayer);
    map.removeLayer(closestPrLayer);
  } else {
    pointsLayer.addTo(map);
    clickedPointsLayer.addTo(map);
    closestPrLayer.addTo(map);
  }
  map.removeLayer(routesLayer);
  routesLayer = L.geoJson(data, { style: styles.route }).addTo(map);
};

// Fetch Data and Initialize Layers
const initializeMap = async () => {
  try {
    const routesResponse = await fetch('data/routes70.geojson');
    if (!routesResponse.ok) throw new Error('Network response was not ok');
    originalData = await routesResponse.json();
    routesLayer = L.geoJson(simplifyGeometry(originalData, map.getZoom()), { style: styles.route }).addTo(map);

    const prResponse = await fetch('data/pr70.geojson');
    if (!prResponse.ok) throw new Error('Network response was not ok');
    const prData = await prResponse.json();
    pointsLayer = L.geoJson(prData, { pointToLayer: (feature, latlng) => L.circleMarker(latlng, styles.point("#ff0000")) }).addTo(map);

    map.on('mousemove', handleMouseMove);
    map.on('click', handleMapClick);
    map.on('zoomend', handleZoomEnd);
  } catch (error) {
    console.error('Error fetching geojson:', error);
  }
};

initializeMap();
