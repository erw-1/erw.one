// Fonction pour charger la configuration générale
const loadConfig = () => fetch('config/config.json').then(response => response.json());

// Fonction pour charger les types d'icônes
const loadTypesConfig = (iconConfigPath) => fetch(iconConfigPath).then(response => response.json());

// Fonction pour charger les données du Google Sheets
const loadSheetData = (googleSheetUrl) => {
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
const addGeoJsonToMap = (map, sheetsData, typesConfig, config) => {
    // Marqueurs pour les entrées correspondantes
    const matchedEntries = new Set();

    fetch(config.geojsonFeature)
        .then(response => response.json())
        .then(data => {
            L.geoJson(data, {
                style: config.geoJsonStyle,
                onEachFeature: (feature, layer) => {
                    const departmentCode = feature.properties.code;
                    const matches = sheetsData.filter(row => {
                        const matchCondition = row[config.joinField].padStart(2, '0') === departmentCode;
                        if (matchCondition) matchedEntries.add(row);
                        return matchCondition;
                    });

                    if (matches.length > 0) {
                        const clusterGroup = clusterGroupsByDepartment[departmentCode] || new L.MarkerClusterGroup();
                        matches.forEach(match => {
                            const marker = L.marker(layer.getBounds().getCenter(), { icon: getCustomIcon(match.type, typesConfig) })
                                .bindPopup(createPopupContent(match, config));
                            clusterGroup.addLayer(marker);
                        });
                        clusterGroupsByDepartment[departmentCode] = clusterGroup;
                        map.addLayer(clusterGroup);
                    } else {
                        // S'il n'y a pas de correspondance, ajoutez-le à la liste des entrées non appariées
                        unmatchedEntries.push({ departmentCode, feature });
                    }
                }
            }).addTo(map);
            
            // Identifier les entrées non appariées après avoir traité tous les départements
            sheetsData.forEach(row => {
                if (!matchedEntries.has(row)) {
                    unmatchedEntries.push(row);
                }
            });

            if (unmatchedEntries.length > 0) {
                console.log('Entrées non appariées du Google Sheet:', unmatchedEntries);
            }
        }).catch(error => {
            console.error('Erreur lors de l’ajout du GeoJSON à la carte :', error);
        });
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

    Promise.all([
        loadTypesConfig(config.iconConfigPath),
        loadSheetData(config.googleSheetUrl)
    ]).then(([typesConfig, sheetData]) => {
        createLegend(map, typesConfig);
        addGeoJsonToMap(map, sheetData, typesConfig, config);
    });
};

// Charger la configuration et initialiser la carte et l'UI
loadConfig()
    .then(initMap)
    .catch(error => {
        console.error('Erreur lors du chargement de la configuration :', error);
    });
