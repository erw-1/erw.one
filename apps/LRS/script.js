// Initialize the map
var map = L.map('map', {
    center: [47.6205, 6.3498], // Set to the desired center coordinates
    zoom: 10,                  // Set to the desired initial zoom level
    zoomControl: false         // Disables the default zoom controls
}).setView([47.6205, 6.3498], 10);

// Add OpenStreetMap tiles
L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    attribution: 'HSN | OSM',
    maxNativeZoom: 19,
    maxZoom: 22
}).addTo(map);

// Style function for routes70 layer (dark grey lines)
function routes70Style(feature) {
    return {
        color: "#4d4d4d",
        weight: 2,
        opacity: 0.8
    };
}

// Style function for pr70 layer (simple red dots)
function pr70Style(feature) {
    return {
        radius: 3,
        fillColor: "#ff0000",
        color: "none",
        fillOpacity: 1
    };
}

// Fetch and add the second layer (routes70.geojson) with dark grey line styling
fetch('data/routes70.geojson')
    .then(response => response.json())
    .then(data => L.geoJson(data, {
        style: routes70Style
    }).addTo(map));

// Fetch and add the first layer (pr70.geojson) with red dot styling
fetch('data/pr70.geojson')
    .then(response => response.json())
    .then(data => L.geoJson(data, {
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, pr70Style(feature));
        }
    }).addTo(map));
