// Initialize the map centered on Haute-Saône
var map = L.map('map').setView([47.6205, 6.3498], 10);  // Latitude and Longitude of Haute-Saône with a zoom level that shows the region

// Add the CartoDB tiles
L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    attribution: 'Map tiles by Carto, under CC BY 3.0. Data by OpenStreetMap, under ODbL.'
}).addTo(map);

// Function to convert lat-lng to Lambert93 (approximate)
function convertToLambert93(lat, lng) {
    // Constants for Lambert93 projection
    const lambda0 = 3; // Central meridian in degrees
    const phi0 = 46.5; // Latitude of origin in degrees
    const x0 = 700000; // False easting
    const y0 = 6600000; // False northing
    const phi1 = 44; // First standard parallel
    const phi2 = 49; // Second standard parallel

    // Convert degrees to radians
    const rad = (deg) => deg * (Math.PI / 180);

    // Geodetic constants for WGS84
    const a = 6378137; // Semi-major axis
    const b = 6356752.314; // Semi-minor axis
    const f = 1/298.257223563; // Flattening

    // Compute parameters
    const n = (Math.log((a * Math.cos(rad(phi1))) / (a * Math.cos(rad(phi2)))) /
               Math.log(Math.tan(rad(90 + phi2) / 2) / Math.tan(rad(90 + phi1) / 2)));
    const F = (a * Math.cos(rad(phi1)) * Math.exp(n * Math.log(Math.tan(rad(90 + phi1) / 2)))) / n;
    const rho0 = F / Math.exp(n * Math.log(Math.tan(rad(90 + phi0) / 2)));

    // Convert
    const rho = F / Math.exp(n * Math.log(Math.tan(rad(90 + lat) / 2)));
    const theta = n * (rad(lng) - rad(lambda0));
    const x = x0 + rho * Math.sin(theta);
    const y = y0 + rho0 - rho * Math.cos(theta);

    return [x, y];
}

// Handle map click event
map.on('click', function(e) {
    var latlng = e.latlng;
    var [x, y] = convertToLambert93(latlng.lat, latlng.lng);
    var content = `Coordinates: ${x.toFixed(2)}, ${y.toFixed(2)}. Coords. en Lambert93 copiées, Ctrl+V pour les coller.`;

    // Show popup and notify user
    L.popup()
        .setLatLng(latlng)
        .setContent(content)
        .openOn(map);

    // Copy to clipboard
    navigator.clipboard.writeHey(content);  // No error handling needed, simplicity for user notification
});
