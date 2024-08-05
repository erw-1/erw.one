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

// Handle map click event to display and copy Lambert93 coordinates
map.on('click', function(e) {
    var latlng = e.latlng;
    var coordsLambert93 = proj4('EPSG:4326', lambert93, [latlng.lng, latlng.lat]);
    var coords = `${coordsLambert93[0].toFixed(3)}, ${coordsLambert93[1].toFixed(3)}`;
    var content = `Coords. en Lambert 93 : <b>${coords}</b><br/>Copiées dans le presse-papiers`;

    L.popup()
        .setLatLng(latlng)
        .setContent(content)
        .openOn(map);

    // Copy coordinates to clipboard
    navigator.clipboard.writeText(`${coords}`);
});

document.getElementById('locateButton').addEventListener('click', function() {
    document.getElementById('loading').style.display = 'block'; // Afficher l'indicateur de chargement
    map.locate({setView: true, maxZoom: 16});
});

map.on('locationfound', function(e) {
    const location = e.latlng;
    const radius = e.accuracy / 2;
    var coordsLambert93 = proj4('EPSG:4326', lambert93, [location.lng, location.lat]);
    var coordsLambert93Formatted = `${coordsLambert93[0].toFixed(3)}, ${coordsLambert93[1].toFixed(3)}`;
    const content = `Précision du GPS : ${radius} mètres<br/>Coord. Lambert 93: <b>${coordsLambert93Formatted}</b>`;
    
    document.getElementById('loading').style.display = 'none'; // Masquer l'indicateur de chargement
    navigator.clipboard.writeText(`${coordsLambert93[0].toFixed(3)}, ${coordsLambert93[1].toFixed(3)}`)
    L.marker(location).addTo(map).bindPopup(content).openPopup();
});

map.on('locationerror', function(e) {
    document.getElementById('loading').style.display = 'none'; // Assurez-vous de masquer le chargement même en cas d'erreur
    alert('Erreur de géolocalisation: ' + e.message);
});
