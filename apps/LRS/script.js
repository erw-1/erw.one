// Initialize the map
const map = L.map('map', {center: [47.6205, 6.3498], zoom: 10, zoomControl: false});
L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {attribution: 'HSN | OSM', maxNativeZoom: 19, maxZoom: 22}).addTo(map);

// Create Panes in order from bottom to top
['routesPane', 'pointsPane'].forEach((pane, index) => {
  map.createPane(pane).style.zIndex = 400 + (index);
});

// Define styles
const styles = {
  route: { color: "#4d4d4d", weight: 2, opacity: 1, pane: 'routesPane' },
  point: { radius: 3, fillColor: "#ff0000", color: "none", fillOpacity: 1, pane: 'pointsPane' }
};

// Function to add GeoJSON layers to the map
const addGeoJsonLayer = (url, style, pointToLayer) => {
  fetch(url)
    .then(response => response.json())
    .then(data => L.geoJson(data, { style, pointToLayer }).addTo(map))
};

// Initialize the map with data
const initializeMap = () => {
  addGeoJsonLayer('data/routes70.geojson', styles.route);
  addGeoJsonLayer('data/pr70.geojson', null, (feature, latlng) => L.circleMarker(latlng, styles.point));
};

// Call the initialize function
initializeMap();
