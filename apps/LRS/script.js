// Initialize the map
var map = L.map('map', {
    center: [47.6205, 6.3498], // Set to the desired center coordinates
    zoom: 10,                  // Set to the desired initial zoom level
    zoomControl: false         // Disables the default zoom controls
}).setView([47.6205, 6.3498], 10);

// Add OpenStreetMap tiles
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'HSN | OSM',
    maxNativeZoom: 19,
    maxZoom: 22
}).addTo(map);

// Fetch and add the first layer (pr70.json)
fetch('data/pr70.geojson')
    .then(response => response.json())
    .then(data => L.geoJson(data).addTo(map));

// Fetch and add the second layer (routes70.json)
fetch('data/routes70.geojson')
    .then(response => response.json())
    .then(data => L.geoJson(data).addTo(map));
