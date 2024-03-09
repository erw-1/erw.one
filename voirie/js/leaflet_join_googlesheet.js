// Fonction pour charger la configuration générale
const loadConfig = () => fetch('config/config.json').then(response => response.json());

// Fonction pour charger les types d'icônes
const loadTypesConfig = (iconConfigPath) => fetch(iconConfigPath).then(response => response.json());

// Fonction pour charger les données du Google Sheets et trouver les entrées non appariées
const loadSheetDataAndFindUnmatched = (googleSheetUrl, geojsonFeature) => {
    return fetch(googleSheetUrl)
        .then(response => response.text())
        .then(data => {
            const jsonText = data.substring(47).slice(0, -2);
            const sheetData = JSON.parse(jsonText).table.rows.map(row => ({
                nom: row.c[0] ? row.c[0].v : '',
                code_dep: row.c[1] ? row.c[1].v.toString() : '',
                type: row.c[2] ? row.c[2].v : '',
                lien: row.c[3] ? row.c[3].v : ''
            }));

            return fetch(geojsonFeature)
                .then(response => response.json())
                .then(geojsonData => {
                    const unmatchedEntries = sheetData.slice(); // Créer une copie des données de la feuille
                    geojsonData.features.forEach(feature => {
                        const departmentCode = feature.properties.code;
                        const matchedIndex = unmatchedEntries.findIndex(entry => entry.code_dep.padStart(2, '0') === departmentCode);
                        if (matchedIndex !== -1) {
                            unmatchedEntries.splice(matchedIndex, 1); // Supprimer l'entrée correspondante
                        }
                    });
                    return {
                        sheetData,
                        unmatchedEntries,
                        geojsonData
                    };
                });
        });
};

// Fonction pour obtenir une icône personnalisée en fonction du type
const getCustomIcon = (type, typesConfig) => {
    const iconInfo = typesConfig.find(t => t.type === type) || typesConfig.find(t => t.type === 'Autre');
    return L.icon({
        iconUrl: iconInfo.icon,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
    });
};

// Créer une fonction pour générer le contenu de la popup
const createPopupContent = (match, config) => {
    return config.popupTemplate.replace(/\{(\w+)\}/g, (_, key) => match[key] || '');
};

// Fonction pour ajouter le GeoJSON à la carte avec style personnalisé
const clusterGroupsByDepartment = {}; // pour stocker les cluster par dpt
const unmatchedEntries = []; // pour stocker les entrées non appariées
const addGeoJsonToMap = (map, sheetData, unmatchedEntries, typesConfig, config, geojsonData) => {
    L.geoJson(geojsonData, {
        style: config.geoJsonStyle,
        onEachFeature: (feature, layer) => {
            const departmentCode = feature.properties.code;
            const matches = sheetData.filter(row => row[config.joinField].padStart(2, '0') === departmentCode);
            const clusterGroup = clusterGroupsByDepartment[departmentCode] || new L.MarkerClusterGroup();

            matches.forEach(match => {
                const marker = L.marker(layer.getBounds().getCenter(), { icon: getCustomIcon(match.type, typesConfig) })
                    .bindPopup(createPopupContent(match, config));
                clusterGroup.addLayer(marker);
            });

            clusterGroupsByDepartment[departmentCode] = clusterGroup;
            map.addLayer(clusterGroup);
        }
    }).addTo(map);

    // Log des entrées non appariées
    if (unmatchedEntries.length > 0) {
        console.log('Entrées du Google Sheet sans correspondance:', unmatchedEntries);
    }
};

// Fonction pour créer la légende avec le fichier de configuration
const createLegend = (map, typesConfig) => {
    const legend = L.control({ position: 'bottomright' });

    legend.onAdd = () => {
        const div = L.DomUtil.create('div', 'info legend');
        div.innerHTML += '<div class="title">Fonction des outils</div>';
        typesConfig.forEach(configItem => {
            div.innerHTML += `<i style="background-image: url(${configItem.icon}); background-repeat: no-repeat; background-position: center center;"></i><span>${configItem.type}</span><br>`;
        });
        return div;
    };

    legend.addTo(map);
};

// Fonction pour initialiser la carte
const initMap = (config) => {
    const map = L.map('map').setView(config.mapSettings.center, config.mapSettings.zoomLevel);
    L.tileLayer(config.tileLayerUrl, config.tileLayerOptions).addTo(map);

    loadTypesConfig(config.iconConfigPath).then(typesConfig => {
        loadSheetDataAndFindUnmatched(config.googleSheetUrl, config.geojsonFeature)
            .then(({ sheetData, unmatchedEntries, geojsonData }) => {
                createLegend(map, typesConfig);
                addGeoJsonToMap(map, sheetData, unmatchedEntries, typesConfig, config, geojsonData);
            });
    });
};
    
// Charger la configuration et initialiser la carte et l'UI
loadConfig()
    .then(initMap)
    .catch(error => {
        console.error('Erreur lors du chargement de la configuration :', error);
    });
