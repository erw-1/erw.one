var map = L.map('map').setView([46.603354, 1.888334], 6);

// calque de tuiles
L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    maxZoom: 19
}).addTo(map);

// les clusters pour regrouper les marqueurs
var markerClusters = L.markerClusterGroup();

// Chemin vers le GeoJSON
var geojsonFeature = 'data/dpt.geojson';

// Fonction pour transformer le texte réponse en JSON (spécifique à Google Sheets API)
function sheetToJson(response) {
    const jsonText = response.substring(47).slice(0, -2);
    return JSON.parse(jsonText);
}

// URL Google Sheets publié au format JSON
var googleSheetUrl = 'https://docs.google.com/spreadsheets/d/194dyKaJGB2RPur_vnqCgrnAJDlrhhxyLe4MLAyjb2S0/gviz/tq?tqx=out:json';

// Fonction pour charger les données du Google Sheets
function loadSheetData() {
  return fetch(googleSheetUrl)
    .then(response => response.text())
    .then(data => {
      // Convertir les données en JSON et les mapper
      const rows = sheetToJson(data).table.rows;
      return rows.map(row => {
        return {
          nom: row.c[0] ? row.c[0].v : '', // Utiliser un string vide si la valeur est null
          code_dep: row.c[1] ? row.c[1].v.toString() : '',
          type: row.c[2] ? row.c[2].v : '',
          lien: row.c[3] ? row.c[3].v : ''
        };
      }).filter(item => item.code_dep); // Filtrer les entrées sans code_dep
    });
}

// Fonction pour ajouter le GeoJSON à la carte + style personnalisé
function addGeoJsonToMap(sheetsData) {
    fetch(geojsonFeature)
        .then(response => response.json())
        .then(data => {
            L.geoJson(data, {
                style: {
                    color: '#404040',
                    weight: 1,
                    fillColor: '#FFF',
                    fillOpacity: 0.5
                },
                onEachFeature: function (feature, layer) {
                    var departmentCode = feature.properties.code;
                    var matches = sheetsData.filter(row => row.code_dep.padStart(2, '0') === departmentCode);

                    if (matches.length) {
                        var center = layer.getBounds().getCenter();
                        matches.forEach(match => {
                            var marker = L.marker(center).bindPopup(
                                `Nom: ${match.nom}<br>Type: ${match.type}<br>` +
                                `<a href="${match.lien}" target="_blank">Plus d'infos</a>`
                            );
                            markerClusters.addLayer(marker);
                        });
                    }
                }
            }).addTo(map);

            map.addLayer(markerClusters);
        })
        .catch(error => {
            console.error('Erreur lors de l’ajout du GeoJSON à la carte :', error);
        });
}

// add data
loadSheetData().then(addGeoJsonToMap);
