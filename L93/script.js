// Proj4js definition for Lambert93
proj4.defs("EPSG:2154", "+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
var lambert93 = proj4("EPSG:2154");

// Initialize the map
var map = L.map('map').setView([47.6205, 6.3498], 10);  // Centered on Haute-Saône

// Add OpenStreetMap tiles
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'HSN | OSM'
}).addTo(map);

// Handle map click event
map.on('click', function(e) {
    var latlng = e.latlng;
    var coordsLambert93 = proj4('EPSG:4326', lambert93, [latlng.lng, latlng.lat]);
    var content = `Coords. en Lambert 93 : ${coordsLambert93[0].toFixed(3)}, ${coordsLambert93[1].toFixed(3)}\n\n Coords. copiées dans le presse-papiers\n CTRL+V pour les coller`;
    var coords = `${coordsLambert93[0].toFixed(3)}, ${coordsLambert93[1].toFixed(3)}`;
    
    L.popup()
        .setLatLng(latlng)
        .setContent(content)
        .openOn(map);

    // Copy to clipboard
    navigator.clipboard.writeText(coords).then(() => {
        console.log("Coordinates copied to clipboard.");
    }).catch(err => {
        console.error("Failed to copy coordinates: ", err);
    });
});
 
