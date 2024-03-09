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
                    // Initialiser les entrées non appariées
                    const unmatchedEntries = new Set(sheetData.map((entry, index) => index)); // Utilisez un Set pour stocker les indices des données non appariées

                    geojsonData.features.forEach(feature => {
                        const departmentCode = feature.properties.code;
                        sheetData.forEach((entry, index) => {
                            if (entry.code_dep.padStart(2, '0') === departmentCode) {
                                unmatchedEntries.delete(index); // Supprimer l'indice correspondant
                            }
                        });
                    });

                    // Transformer les indices non appariés en objets de données réelles
                    const unmatchedData = Array.from(unmatchedEntries).map(index => sheetData[index]);

                    return {
                        sheetData,
                        unmatchedEntries: unmatchedData, // Maintenant un tableau d'objets
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
                const marker = L.marker(layer.getBounds().getCenter(), {
                        icon: getCustomIcon(match.type, typesConfig)
                    })
                    .bindPopup(createPopupContent(match, config));
                clusterGroup.addLayer(marker);
            });

            clusterGroupsByDepartment[departmentCode] = clusterGroup;
            map.addLayer(clusterGroup);
        }
    }).addTo(map);

    // Log des entrées non appariées
    console.log('Entrées du Google Sheet sans correspondance:', unmatchedEntries);
};

// Fonction pour créer la légende avec le fichier de configuration
const createLegend = (map, typesConfig) => {
    const legend = L.control({
        position: 'bottomright'
    });

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

// Fonction pour afficher la modale avec les entrées non appariées
const showOtherToolsModal = (unmatchedEntries) => {
    const modal = document.getElementById('otherToolsModal');
    const list = document.getElementById('unmatchedList');
    const span = document.getElementsByClassName("close")[0];

    // Vide la liste précédente
    list.innerHTML = '';

    // Ajoute les entrées non appariées à la liste
    unmatchedEntries.forEach(entry => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `Nom: ${entry.nom}, Type: ${entry.type}, Lien: <a href="${entry.lien}" target="_blank">Plus d'infos</a>`;
        list.appendChild(listItem);
    });

    // Affiche la modale
    modal.style.display = "block";

    // Ferme la modale lorsque l'utilisateur clique sur (x)
    span.onclick = function() {
        modal.style.display = "none";
    };

    // Ferme la modale lorsque l'utilisateur clique n'importe où en dehors de la modale
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    };
};

// Fonction pour initialiser la carte
const initMap = (config) => {
    const map = L.map('map').setView(config.mapSettings.center, config.mapSettings.zoomLevel);
    L.tileLayer(config.tileLayerUrl, config.tileLayerOptions).addTo(map);

// Charger la configuration, initialiser la carte, puis montrer les entrées non appariées
loadConfig().then(config => {
    initMap(config); // initMap ne devrait pas avoir .then() après si elle ne retourne pas de promesse.
    loadTypesConfig(config.iconConfigPath).then(typesConfig => {
        loadSheetDataAndFindUnmatched(config.googleSheetUrl, config.geojsonFeature)
            .then(({
                sheetData,
                unmatchedEntries,
                geojsonData
            }) => {
                createLegend(map, typesConfig);
                addGeoJsonToMap(map, sheetData, unmatchedEntries, typesConfig, config, geojsonData);
                showOtherToolsModal(unmatchedEntries);
            });
    });
})
