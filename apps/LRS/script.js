// Initialize the map
const map = L.map('map', {center: [47.6205, 6.3498], zoom: 10, zoomControl: false});
L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {attribution: 'HSN | OSM', maxNativeZoom: 19, maxZoom: 22}).addTo(map);

// Create Panes in order from bottom to top
['routesPane', 'pointsPane'].forEach((pane, index) => {
  map.createPane(pane).style.zIndex = 400 + index;
});

// Define styles
const styles = {
  route: { color: "#4d4d4d", weight: 2, opacity: 1, pane: 'routesPane', renderer: L.canvas() },
  point: { radius: 3, fillColor: "#ff0000", color: "none", fillOpacity: 1, pane: 'pointsPane' }
};

// Function to simplify geometry
const simplifyGeometry = (geojson, tolerance) => {
  return turf.simplify(geojson, { tolerance: tolerance, highQuality: false });
};

// Function to add GeoJSON layers to the map
const addGeoJsonLayer = (url, style, pointToLayer, simplify = false) => {
  fetch(url)
    .then(response => response.json())
    .then(data => {
      if (simplify) { // Check if simplification is needed
        const tolerance = 1 / Math.pow(2, map.getZoom()); // Adjust tolerance based on zoom level
        data = simplifyGeometry(data, tolerance);
      }
      L.geoJson(data, { style, pointToLayer }).addTo(map);
    })
    .catch(error => console.error('Error loading GeoJSON data:', error));
};

// Function to remove existing routes layer
const removeRoutesLayer = () => {
  map.eachLayer((layer) => {
    if (layer.options && layer.options.pane === 'routesPane') {
      map.removeLayer(layer);
    }
  });
};

// Initialize the map with data
const initializeMap = () => {
  addGeoJsonLayer('data/routes70.geojson', styles.route, null, true); // true = simplify the routes layer
  addGeoJsonLayer('data/pr70.geojson', null, (feature, latlng) => L.circleMarker(latlng, styles.point));
};

// Update routes layer on zoom end to simplify geometries
map.on('zoomend', () => {
  removeRoutesLayer(); // Remove existing routes layer
  addGeoJsonLayer('data/routes70.geojson', styles.route, null, true); // Simplify the routes layer on zoom end
});

// Call the initialize function
initializeMap();
