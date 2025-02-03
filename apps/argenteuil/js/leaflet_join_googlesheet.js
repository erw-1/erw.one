// --- Chargement de la configuration ---
const loadConfig = () => {
  console.log("Chargement de la configuration...");
  return fetch('config/config.json')
    .then(response => {
      if (!response.ok) {
        console.error("Erreur lors du chargement de la configuration :", response.statusText);
      }
      return response.json();
    })
    .then(config => {
      console.log("Configuration chargée avec succès :", config);
      return config;
    })
    .catch(error => {
      console.error("Erreur lors de la lecture de la configuration :", error);
    });
};

// --- Chargement des données du Google Sheet ---
const loadSheetData = (googleSheetUrl) => {
  console.log("Chargement des données du Google Sheet...", googleSheetUrl);
  return fetch(googleSheetUrl)
    .then(response => response.text())
    .then(data => {
      console.log("Données du Google Sheet chargées, parsing en cours...");
      const parsed = Papa.parse(data, { header: true, skipEmptyLines: true });
      const sheetData = parsed.data.map((row, index) => {
        const id = row['id'] ? row['id'].trim() : '';
        const couleur = row['couleur'] ? row['couleur'].trim() : '#FFFFFF';
        const ambiance = row['ambiance'] ? row['ambiance'].trim() : '';
        const images = row['images'] ? row['images'].trim().split(',') : [];
        const texte = row['texte'] ? row['texte'].trim() : '';
        console.log(`Ligne ${index + 1} traitée :`, { id, couleur, ambiance, images, texte });
        return { id, couleur, ambiance, images, texte };
      });
      console.log("Parsing terminé, données traitées :", sheetData);
      return sheetData;
    })
    .catch(error => {
      console.error("Erreur lors du chargement des données du Google Sheet :", error);
    });
};

// --- Chargement du GeoJSON et création d'un FeatureGroup pour un couple ---
const loadGeoJsonDataPromise = (geojsonUrl, sheetData, sheetName) => {
  console.log("Chargement du GeoJSON depuis :", geojsonUrl);
  return fetch(geojsonUrl)
    .then(response => response.json())
    .then(geojsonData => {
      // Utilisation d'un FeatureGroup pour bénéficier de getBounds()
      const group = L.featureGroup();
      
      geojsonData.features.forEach(feature => {
        // Recherche de la donnée correspondante dans le Google Sheet
        const data = sheetData.find(d => d.id === String(feature.properties.id));
        const style = {
          color: data ? data.couleur : '#666666',
          fillColor: data ? data.couleur : '#FFFFFF',
          fillOpacity: 0.3,
          weight: 1,
        };
        
        const polygonLayer = L.geoJSON(feature, { style: style });
        polygonLayer.eachLayer(layer => {
          layer.on('click', () => {
            showOverlay(data);
          });
        });
        group.addLayer(polygonLayer);
        
        // Création du marqueur pour afficher l'ID
        if (data) {
          const centroid = turf.booleanPointInPolygon(turf.centerOfMass(feature), feature)
            ? turf.centerOfMass(feature)
            : turf.pointOnFeature(feature);
          const marker = L.circleMarker(
            [centroid.geometry.coordinates[1], centroid.geometry.coordinates[0]], {
              color: data.couleur,
              fillColor: data.couleur,
              fillOpacity: 1,
              radius: 10
            }
          ).bindTooltip(data.id.toString(), { permanent: true, direction: 'center', className: 'id-label' });
          group.addLayer(marker);
        }
      });
      
      console.log(`GeoJSON pour "${sheetName}" chargé et traité.`);
      return group;
    })
    .catch(error => {
      console.error("Erreur lors du chargement du GeoJSON pour sheet", sheetName, ":", error);
    });
};

// --- Fonction pour afficher l'overlay avec images, ambiance et texte ---
const showOverlay = (data) => {
  console.log('Affichage de l\'overlay pour :', data);

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.style.backgroundColor = data.couleur + '80'; // Couleur semi-transparente
  document.body.appendChild(overlay);

  const ambianceBox = document.createElement('div');
  ambianceBox.className = 'ambiance-box';
  ambianceBox.textContent = data.ambiance;
  ambianceBox.style.color = data.couleur;
  overlay.appendChild(ambianceBox);

  const carousel = document.createElement('div');
  carousel.className = 'carousel';
  const baseURL = window.myConfig.imgfolder;
  let currentIndex = 0;
  data.images.forEach((image, index) => {
    const img = document.createElement('img');
    img.src = `${baseURL}${image.trim()}`;
    img.style.display = index === 0 ? 'block' : 'none';
    carousel.appendChild(img);
  });

  const leftButton = document.createElement('button');
  leftButton.className = 'carousel-button left';
  leftButton.innerHTML = '❮';
  leftButton.onclick = () => {
    const images = carousel.querySelectorAll('img');
    images[currentIndex].style.display = 'none';
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    images[currentIndex].style.display = 'block';
  };

  const rightButton = document.createElement('button');
  rightButton.className = 'carousel-button right';
  rightButton.innerHTML = '❯';
  rightButton.onclick = () => {
    const images = carousel.querySelectorAll('img');
    images[currentIndex].style.display = 'none';
    currentIndex = (currentIndex + 1) % images.length;
    images[currentIndex].style.display = 'block';
  };

  overlay.appendChild(leftButton);
  overlay.appendChild(rightButton);
  overlay.appendChild(carousel);

  const textBox = document.createElement('div');
  textBox.className = 'text-box';
  textBox.innerHTML = `<p>${data.texte}</p>`;
  overlay.appendChild(textBox);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.add('hide');
      setTimeout(() => overlay.remove(), 500);
    }
  });

  console.log('Overlay affiché pour :', data);
};

// --- Contrôle pour switcher de couple (boutons en haut à droite) ---
const addSwitchControl = (config, sheetsArray, map, coupleLayers) => {
  const controlDiv = L.DomUtil.create('div', 'switch-control');
  controlDiv.style.background = 'white';
  controlDiv.style.padding = '5px';
  controlDiv.style.borderRadius = '5px';
  controlDiv.style.boxShadow = '0 0 5px rgba(0,0,0,0.5)';
  controlDiv.style.zIndex = 1000;

  config.sheets.forEach(sheet => {
    const button = L.DomUtil.create('button', '', controlDiv);
    button.innerText = sheet.name;
    button.style.margin = '2px';
    button.dataset.sheet = sheet.name;
    L.DomEvent.on(button, 'click', function(e) {
      L.DomEvent.stopPropagation(e);
      switchCouple(this.dataset.sheet, map, coupleLayers, controlDiv);
    });
  });

  const CustomControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function() { return controlDiv; }
  });
  map.addControl(new CustomControl());
};

let currentActiveSheet = null;
const switchCouple = (sheetName, map, coupleLayers, controlDiv) => {
  if (currentActiveSheet === sheetName) return; // déjà actif
  if (currentActiveSheet && coupleLayers[currentActiveSheet]) {
    map.removeLayer(coupleLayers[currentActiveSheet]);
  }
  map.addLayer(coupleLayers[sheetName]);
  currentActiveSheet = sheetName;
  // Recentre la carte sur l'étendue du nouveau couple
  map.fitBounds(coupleLayers[sheetName].getBounds());
  
  // Mise à jour visuelle des boutons
  const buttons = controlDiv.getElementsByTagName('button');
  for (let btn of buttons) {
    btn.style.backgroundColor = (btn.dataset.sheet === sheetName) ? '#ccc' : '';
  }
};

// --- Initialisation de la carte et chargement des couples ---
const initMap = (config) => {
  console.log("Initialisation de la carte avec la configuration :", config);
  // Rendre la config accessible globalement (pour le baseURL par exemple)
  window.myConfig = config;
  
  // Création de la carte sans center/zoom fixe (on s'appuiera sur fitBounds)
  const map = L.map('map', { zoomControl: config.mapSettings.zoomControl });
  L.tileLayer(config.tileLayerUrl, config.tileLayerOptions).addTo(map);

  // Stocke les FeatureGroups pour chaque couple
  const coupleLayers = {};
  const sheetPromises = config.sheets.map(sheet => {
    return loadSheetData(sheet.googleSheetUrl)
      .then(sheetData => {
        const geojsonUrl = `${config.geojsonfolder}/${sheet.name}.geojson`;
        return loadGeoJsonDataPromise(geojsonUrl, sheetData, sheet.name);
      })
      .then(layer => {
        coupleLayers[sheet.name] = layer;
        return { name: sheet.name, layer: layer };
      });
  });
  
  Promise.all(sheetPromises).then(results => {
    addSwitchControl(config, results, map, coupleLayers);
    if (results.length > 0) {
      // Affiche par défaut le premier couple et recentre sur son étendue
      map.addLayer(results[0].layer);
      currentActiveSheet = results[0].name;
      map.fitBounds(results[0].layer.getBounds());
    }
  });
};

loadConfig().then(config => {
  initMap(config);
});
