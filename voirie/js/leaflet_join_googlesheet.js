// Fonction pour charger la configuration générale
function loadConfig() {
    return fetch('config/config.json').then(response => response.json());
}

// Fonction pour charger les types d'icônes
function loadTypesConfig(iconConfigPath) {
    return fetch(iconConfigPath).then(response => response.json());
}

// Fonction pour initialiser la carte
function initMap(config) {
    var map = L.map('map').setView(config.mapSettings.center, config.mapSettings.zoomLevel);
    L.tileLayer(config.tileLayer.url, config.tileLayer.options).addTo(map);

    loadTypesConfig(config.iconConfigPath).then(typesConfig => {
        createLegend(map, typesConfig);
        loadSheetData(config.googleSheetUrl).then(sheetData => {
            addGeoJsonToMap(map, sheetData, typesConfig, config);
        });
    });
}

// Fonction pour charger les données du Google Sheets
function loadSheetData(googleSheetUrl) {
    return fetch(googleSheetUrl)
        .then(response => response.text())
        .then(data => {
            const jsonText = data.substring(47).slice(0, -2);
            const rows = JSON.parse(jsonText).table.rows;
            return rows.map(row => ({
                nom: row.c[0] ? row.c[0].v : '',
                code_dep: row.c[1] ? row.c[1].v.toString() : '',
                type: row.c[2] ? row.c[2].v : '',
                lien: row.c[3] ? row.c[3].v : ''
            })).filter(item => item.code_dep);
        });
}

// Fonction pour ajouter le GeoJSON à la carte avec style personnalisé
function addGeoJsonToMap(map, sheetsData, typesConfig, config) {
    fetch(config.geojsonFeature)
        .then(response => response.json())
        .then(data => {
            L.geoJson(data, {
                style: config.geoJsonStyle,
                onEachFeature: function (feature, layer) {
                    const departmentCode = feature.properties.code;
                    const matches = sheetsData.filter(row => row[config.joinField].padStart(2, '0') === departmentCode);

                    if (!clusterGroupsByDepartment[departmentCode]) {
                        clusterGroupsByDepartment[departmentCode] = new L.MarkerClusterGroup();
                        map.addLayer(clusterGroupsByDepartment[departmentCode]);
                    }

                    matches.forEach(match => {
                        const customIcon = getCustomIcon(match.type, typesConfig);
                        const marker = L.marker(layer.getBounds().getCenter(), { icon: customIcon }).bindPopup(
                            config.popupFields.map(field => `${field}: ${match[field]}`).join('<br>') +
                            `<a href="${match.lien}" target="_blank">Plus d'infos</a>`
                        );
                        clusterGroupsByDepartment[departmentCode].addLayer(marker);
                    });
                }
            }).addTo(map);
        }).catch(error => {
            console.error('Erreur lors de l’ajout du GeoJSON à la carte :', error);
        });
}

// Fonction pour créer la légende avec le fichier de configuration
function createLegend(map, typesConfig) {
    var legend = L.control({ position: 'bottomright' });

    legend.onAdd = function () {
        var div = L.DomUtil.create('div', 'info legend');
        div.innerHTML += '<div class="title">Fonction des outils</div>';
        Object.keys(typesConfig).forEach(type => {
            const iconUrl = typesConfig[type].icon;
            div.innerHTML += `<i style="background-image: url(${iconUrl}); background-repeat: no-repeat; background-position: center center;"></i><span>${type}</span><br>`;
        });
        return div;
    };

    legend.addTo(map);
}

// Fonction pour obtenir une icône personnalisée en fonction du type
function getCustomIcon(type, typesConfig) {
    const iconInfo = typesConfig.find(t => t.type === type) || typesConfig.find(t => t.type === 'Autre');
    return L.icon({
        iconUrl: iconInfo.icon,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
    });
}

// Limite de la clusterisation au département
var clusterGroupsByDepartment = {};

// Charger la configuration et initialiser la carte
loadConfig().then(initMap);
