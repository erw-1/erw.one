// Initialiser la carte
var map = L.map('map').setView([46.603354, 1.888334], 6);

// Ajouter un calque de tuiles à la carte
L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.jpg', {
    maxZoom: 19
}).addTo(map);

// Chemin vers votre fichier GeoJSON
var geojsonFeature = 'data/dpt.geojson';

// Ajouter le GeoJSON avec un style personnalisé
fetch(geojsonFeature)
    .then(response => response.json())
    .then(data => {
        L.geoJson(data, {
            style: {
                color: '#404040',
                weight: 1,
                fillColor: '#FAFAF8',
                fillOpacity: 0.5
            },
            onEachFeature: function (feature, layer) {
                layer.bindPopup(feature.properties.nom);
            }
        }).addTo(map);
    }).catch(error => {
        console.error('Erreur GeoJSON :', error);
    });
