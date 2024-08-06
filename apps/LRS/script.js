//// Config
// Initialize the map
const map = L.map('map', { center: [47.6205, 6.3498], zoom: 10, zoomControl: false });
L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', { attribution: 'HSN | OSM', maxNativeZoom: 19, maxZoom: 22 }).addTo(map);

// Create Panes in order from bottom to top
['routesPane', 'pointsPane'].forEach((pane, index) => {
  map.createPane(pane).style.zIndex = 400 + index;
});

// Define styles
const styles = {
  route: { color: "#4d4d4d", weight: 2, opacity: 1, pane: 'routesPane', renderer: L.canvas() },
  point: { radius: 3, fillColor: "#ff0000", color: "none", fillOpacity: 1, pane: 'pointsPane' }
};

//// Functions
// Geometry simplification function
const simplifyGeometry = (geojson, tolerance) => {
  return turf.simplify(geojson, { tolerance: tolerance, highQuality: false });
};

// Function to toggle points pane visibility based on zoom level
const togglePointsPaneVisibility = () => {
  const pointsPane = map.getPane('pointsPane');
  pointsPane.style.display = map.getZoom() >= 14 ? 'block' : 'none';
};

// GeoJSON layer addition function
const addGeoJsonLayer = (url, style, pointToLayer, simplify = false, layerVar) => {
  fetch(url)
    .then(response => response.json())
    .then(data => {
      if (simplify) { // Simplify geometry if needed
        const tolerance = 1 / Math.pow(2, map.getZoom()); // Adjust tolerance based on zoom level
        data = simplifyGeometry(data, tolerance);
      }
      // Add new layer to the map
      const layer = L.geoJson(data, { style, pointToLayer }).addTo(map);
      // Manage global layer reference : if already exists, remove the old one
      if (layerVar) {
        if (window[layerVar]) {
          map.removeLayer(window[layerVar]);
        }
        window[layerVar] = layer;
      }
    })
};

// Function to initialize the map with data
const initializeMap = () => {
  addGeoJsonLayer('data/routes70.geojson', styles.route, null, true, 'routesLayer'); // Simplify and add routes layer
};

// Call the initialize function to load initial layers
initializeMap();

//// Interactions
// Ensure correct initial visibility of points pane on map load
map.on('load', togglePointsPaneVisibility);

// Update routes layer and points pane visibility on zoom end
map.on('zoomend', () => {
  addGeoJsonLayer('data/routes70.geojson', styles.route, null, true, 'routesLayer'); // Simplify and update routes layer
  togglePointsPaneVisibility(); // Toggle points pane visibility
  if (map.getZoom() >= 14 && !window.pointsLayer) {
    addGeoJsonLayer('data/pr70.geojson', null, (feature, latlng) => L.circleMarker(latlng, styles.point), false, 'pointsLayer'); // Add points layer if not already added
  }
});
