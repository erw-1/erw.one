// Initialize the map
const map = L.map('map', {center: [47.6205, 6.3498], zoom: 10, zoomControl: false}).setView([47.6205, 6.3498], 10);
L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {attribution: 'HSN | OSM', maxNativeZoom: 19, maxZoom: 22}).addTo(map);

// Create Panes
['routesPane', 'pointsPane', 'previewPane'].forEach((pane, index) => {
  map.createPane(pane).style.zIndex = 400 + (index * 100);
});

// Define styles
const styles = {
  route: { color: "#4d4d4d", weight: 2, opacity: 0.8, pane: 'routesPane' },
  point: { radius: 3, fillColor: "#ff0000", color: "none", fillOpacity: 1, pane: 'pointsPane' }
};

// Function to add GeoJSON layers to the map
const addGeoJsonLayer = (data, style, pointToLayer) => {
  L.geoJson(data, { style, pointToLayer }).addTo(map);
};

// Initialize the map with data
const initializeMap = async () => {
  try {
    const [routesResponse, prResponse] = await Promise.all([
      fetch('data/routes70.geojson'),
      fetch('data/pr70.geojson')
    ]);

    const [routesData, prData] = await Promise.all([
      routesResponse.json(),
      prResponse.json()
    ]);

    // Add routes layer
    addGeoJsonLayer(routesData, styles.route);

    // Add points layer with custom point styling
    addGeoJsonLayer(prData, null, (feature, latlng) => L.circleMarker(latlng, styles.point));
  } catch (error) {
    console.error('Error loading GeoJSON data:', error);
  }
};

// Call the initialize function
initializeMap();
