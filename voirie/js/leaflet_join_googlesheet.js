// Initialiser la carte
var map = L.map('map').setView([46.603354, 1.888334], 6);

// Ajouter un calque de tuiles à la carte
L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.jpg', {
    maxZoom: 19
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
