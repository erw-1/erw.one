// Proj4js definition for Lambert93
proj4.defs("EPSG:2154", "+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
var lambert93 = proj4("EPSG:2154");

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
fetch('https://erw.one/apps/LRS/data/pr70.json')
    .then(response => response.json())
    .then(data => L.geoJson(data).addTo(map));

// Fetch and add the second layer (routes70.json)
fetch('https://erw.one/apps/LRS/data/routes70.json')
    .then(response => response.json())
    .then(data => L.geoJson(data).addTo(map));
