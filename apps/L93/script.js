// Proj4js definition for Lambert93
proj4.defs("EPSG:2154", "+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
var lambert93 = proj4("EPSG:2154");

// Initialize the map
var map = L.map('map').setView([47.6205, 6.3498], 10);  // Centered on Haute-Saône

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
    var content = `Coords. en Lambert 93 : <b>${coords}</b>\n\nCopiées dans le presse-papiers`;

    L.popup()
        .setLatLng(latlng)
        .setContent(content)
        .openOn(map);

    // Copy coordinates to clipboard
    navigator.clipboard.writeText(`${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`).then(() => {
        console.log("Coordinates copied to clipboard.");
    }).catch(err => {
        console.error("Error copying coordinates: ", err);
    });
});

// Function to add the geolocation button
const addLocationButton = (map) => {
    const locationButton = L.control({ position: 'topright' });

    locationButton.onAdd = function(map) {
        const button = L.DomUtil.create('button', 'btn btn-success');
        button.innerHTML = 'Ma Position';
        button.onclick = function() {
            map.locate({setView: true, maxZoom: 16});
        };
        return button;
    };

    locationButton.addTo(map);
};

// Écouter l'événement de géolocalisation réussie
map.on('locationfound', function(e) {
    const location = e.latlng;
    const radius = e.accuracy / 2;
    
    // Conversion des coordonnées en Lambert93
    var coordsLambert93 = proj4('EPSG:4326', lambert93, [location.lng, location.lat]);
    var coordsLambert93Formatted = `${coordsLambert93[0].toFixed(3)}, ${coordsLambert93[1].toFixed(3)}`;

    const content = `Vous êtes à moins de ${radius} mètres de ce point: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}<br/>Coord. Lambert 93: <b>${coordsLambert93Formatted}</b>`;

    L.marker(location).addTo(map)
        .bindPopup(content)
        .openPopup();

    // Copier les coordonnées Lambert93 dans le presse-papiers
    navigator.clipboard.writeText(coordsLambert93Formatted).then(() => {
        console.log("Coordinates copied to clipboard.");
    }).catch(err => {
        console.error("Error copying coordinates: ", err);
    });
});

// Listen for failed geolocation event
map.on('locationerror', function(e) {
    alert(e.message);
});

// Add the geolocation button to the map
addLocationButton(map);
