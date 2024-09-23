// Fonction pour charger la configuration depuis le fichier JSON
const loadConfig = () => fetch('config/config.json').then(response => response.json());

// Fonction pour charger les données du Google Sheet
const loadSheetData = (googleSheetUrl) => {
  return fetch(googleSheetUrl)
    .then(response => response.text())
    .then(data => {
      // Parse le CSV en JSON
      const rows = data.split('\n').slice(1); // Ignorer l'en-tête
      const sheetData = rows.map(row => {
        const [id, couleur, images, texte] = row.split(',');
        return {
          id: id.trim(),
          couleur: couleur.trim(),
          images: images ? images.trim().split(',') : [],
          texte: texte ? texte.trim() : ''
        };
      });
      return sheetData;
    });
};

// Fonction pour charger le GeoJSON et afficher les polygones sur la carte
const loadGeoJsonData = (geojsonFeature, sheetData, map) => {
  fetch(geojsonFeature)
    .then(response => response.json())
    .then(geojsonData => {
      // Ajoute des polygones stylisés
      L.geoJson(geojsonData, {
        style: feature => {
          const data = sheetData.find(d => d.id === feature.properties.id);
          return {
            color: data ? data.couleur : '#666666',
            fillColor: data ? data.couleur : '#FFFFFF',
            fillOpacity: 0.3,
            weight: 1,
          };
        },
        onEachFeature: (feature, layer) => {
          const data = sheetData.find(d => d.id === feature.properties.id);
          if (data) {
            // Crée un cercle avec l'ID au centre
            const centroid = turf.centroid(feature); // Utilise Turf.js pour calculer le centre
            const marker = L.circleMarker([centroid.geometry.coordinates[1], centroid.geometry.coordinates[0]], {
              color: data.couleur,
              fillColor: data.couleur,
              fillOpacity: 1,
              radius: 10
            }).addTo(map).bindTooltip(data.id.toString(), {
              permanent: true,
              direction: 'center',
              className: 'id-label'
            });

            // Ouvre l'overlay en cliquant sur le polygone
            layer.on('click', () => {
              showOverlay(data);
            });
          }
        }
      }).addTo(map);
    });
};

// Fonction pour afficher l'overlay avec les images et le texte
const showOverlay = (data) => {
  // Crée le voile coloré
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.style.backgroundColor = data.couleur + 'CC'; // Couleur semi-transparente
  document.body.appendChild(overlay);

  // Crée le carousel pour les images
  const carousel = document.createElement('div');
  carousel.className = 'carousel';
  data.images.forEach(image => {
    const img = document.createElement('img');
    img.src = `https://drive.google.com/uc?export=view&id=${image.trim()}`; // Format de l'image Drive
    carousel.appendChild(img);
  });
  overlay.appendChild(carousel);

  // Crée l'encart pour le texte
  const textBox = document.createElement('div');
  textBox.className = 'text-box';
  textBox.innerHTML = `<p>${data.texte}</p>`;
  overlay.appendChild(textBox);

  // Ferme l'overlay en cliquant en dehors du contenu
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
};

// Fonction pour initialiser la carte
const initMap = (config) => {
  const map = L.map('map', {
    center: config.mapSettings.center,
    zoom: config.mapSettings.zoomLevel,
    zoomControl: config.mapSettings.zoomControl
  });

  L.tileLayer(config.tileLayerUrl, config.tileLayerOptions).addTo(map);

  // Charger les données du Sheet et du GeoJSON
  loadSheetData(config.googleSheetUrl).then(sheetData => {
    loadGeoJsonData(config.geojsonFeature, sheetData, map);
  });
};

// Charger la configuration et initialiser la carte
loadConfig().then(config => {
  initMap(config);
});
