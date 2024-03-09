// Initialiser la carte
var map = L.map('map').setView([46.603354, 1.888334], 6);

// Ajouter un calque de tuiles à la carte
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Ajouter le GeoJSON
var geojsonFeature = 'data/dpt.geojson'; // Mettez le chemin vers votre fichier GeoJSON

// Utiliser AJAX pour charger le GeoJSON externe
var xhr = new XMLHttpRequest();
xhr.open('GET', geojsonFeature, true);
xhr.responseType = 'json';
xhr.onload = function() {
    if (xhr.status === 200) {
        var data = xhr.response;
        L.geoJson(data, {
            onEachFeature: function (feature, layer) {
                layer.bindPopup(feature.properties.nom);
            }
        }).addTo(map);
    }
};
xhr.send();
