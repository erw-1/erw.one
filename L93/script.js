// Define the Lambert93 projection
proj4.defs("EPSG:2154","+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
var lambert93 = new L.Proj.CRS('EPSG:2154', proj4.defs('EPSG:2154'));

// Initialize the map
var map = L.map('map', {
    crs: L.CRS.EPSG3857, // Using the default Web Mercator first
}).setView([48.8566, 2.3522], 12);

// Add the CartoDB tiles
L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    attribution: 'Map tiles by Carto, under CC BY 3.0. Data by OpenStreetMap, under ODbL.'
}).addTo(map);

// Function to copy text to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function() {
        alert('Coordinates copied to clipboard!');
    }, function(err) {
        alert('Failed to copy coordinates: ', err);
    });
}

// Handle map click event
map.on('click', function(e) {
    var latlng = e.latlng;
    var projected = proj4('EPSG:4326', 'EPSG:2154', [latlng.lng, latlng.lat]);
    var content = `Coordinates: ${projected[0].toFixed(2)}, ${projected[1].toFixed(2)}`;
    
    // Show popup
    L.popup()
        .setLatLng(latlng)
        .setContent(content)
        .openOn(map);
    
    // Copy to clipboard
    copyToClipboard(content);
});
