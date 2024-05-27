// Define Lambert93 Projection
proj4.defs("EPSG:2154","+proj=lcc +lat_1=44.100000 +lat_2=49.200000 +lat_0=46.800000 +lon_0=3.000000 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
var lambert93 = new L.Proj.CRS('EPSG:2154',
    proj4.defs("EPSG:2154"),
    {
        resolutions: [8192, 4096, 2048, 1024, 512, 256, 128], // Adjust according to needs
        origin: [0, 0]
    }
);

// Initialize the map
var map = L.map('map', {
    crs: lambert93,
    continuousWorld: true,
    worldCopyJump: false,
});

// Set the view to a given place and zoom
map.setView([46.52863469527167, 2.43896484375], 5);

// Base Layer
var osm = L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'Map data © OpenStreetbook contributors'
}).addTo(map);

// Function to handle click events on the map
map.on('click', function(e) {
    var coords = e.latlng;
    var transformedCoords = proj4('EPSG:4326', 'EPSG:2154', [coords.lng, coords.lat]);

    // Create a popup at the location of the click
    L.popup()
        .setLatLng(coords)
        .setContent("Coordonnées Lambert93 : " + transformedCoords.join(', '))
        .openOn(map);

    // Copy to clipboard
    navigator.clipboard.writeText(transformedCoords.join(', ')).then(function() {
        console.log('Coordinates copied to clipboard successfully!');
    }, function(err) {
        console.error('Could not copy coordinates: ', err);
    });
});
