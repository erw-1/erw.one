// Define the Lambert93 projection
var crsL93 = new L.Proj.CRS(
    'EPSG:2154',
    '+proj=lcc +lat_1=44 +lat_2=49 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    {
        resolutions: [8192, 4096, 2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5],
        origin: [0, 0]
    }
);

// Initialize the map
var map = L.map('map', {
    crs: crsL93,
    continuousWorld: true,
    worldCopyJump: false
}).setView([46.5, 3], 5);

// Add an OSM layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Add a click event to show coordinates
map.on('click', function(e) {
    var coords = e.latlng;
    var transformedCoords = proj4(crsL93.proj4def, [coords.lng, coords.lat]);
    var popup = L.popup()
        .setLatLng(coords)
        .setContent('Coordonnées: ' + transformedCoords.join(', '))
        .openOn(map);

    navigator.clipboard.writeText(transformedCoords.join(', '));
});
