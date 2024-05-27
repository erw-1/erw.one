// Définition de la projection Lambert93
proj4.defs("EPSG:2154","+proj=lcc +lat_1=44.100000 +lat_2=49.200000 +lat_0=46.800000 +lon_0=3.000000 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
var lambert93 = new L.Proj.CRS('EPSG:2154',
    proj4.defs("EPSG:2154"),
    {
        resolutions: [8192, 4096, 2048, 1024, 512, 256, 128],
        origin: [0, 0]
    }
);

// Initialisation de la carte avec la projection personnalisée
var map = L.map('map', {
    crs: lambert93,
    continuousWorld: true,
    worldCopyJump: false,
});

// Définition de la vue initiale (ajuster selon le besoin)
map.setView([46.52863469527167, 2.43896484375], 5);

// Couche de base CartoDB sans étiquettes
var baseLayer = L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    attribution: 'Map data © OpenStreetMap contributors, CartoDB'
}).addTo(map);

// Gestion des événements de clic sur la carte
map.on('click', function(e) {
    var coords = e.latlng;
    var transformedCoords = proj4('EPSG:4326', 'EPSG:2154', [coords.lng, coords.lat]);

    // Création d'un popup au point de clic
    L.popup()
        .setLatLng(coords)
        .setContent("Coordonnées Lambert93 : " + transformedCoords.join(', '))
        .openOn(map);

    // Copie des coordonnées dans le presse-papiers
    navigator.clipboard.writeText(transformedCoords.join(', ')).then(function() {
        console.log('Coordonnées copiées avec succès !');
    }, function(err) {
        console.error('Erreur lors de la copie des coordonnées : ', err);
    });
});
