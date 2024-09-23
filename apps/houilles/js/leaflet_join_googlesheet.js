// Fonction pour charger la configuration depuis le fichier JSON
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

// Fonction pour charger les données du Google Sheet
const loadSheetData = (googleSheetUrl) => {
  console.log("Chargement des données du Google Sheet...");
  return fetch(googleSheetUrl)
    .then(response => response.text())
    .then(data => {
      console.log("Données du Google Sheet chargées, parsing en cours...");
      // Utiliser PapaParse pour analyser correctement le CSV
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

// Fonction pour charger le GeoJSON et afficher les polygones sur la carte
const loadGeoJsonData = (geojsonFeature, sheetData, map) => {
  console.log("Chargement du GeoJSON...");
  fetch(geojsonFeature)
    .then(response => response.json())
    .then(geojsonData => {
      console.log("GeoJSON chargé, ajout des polygones à la carte...");
      L.geoJson(geojsonData, {
        style: feature => {
          // Convertir l'ID du GeoJSON en chaîne pour correspondre aux IDs du Google Sheet
          const data = sheetData.find(d => d.id === String(feature.properties.id));
          console.log(`Style appliqué pour le polygone avec ID ${feature.properties.id} :`, data);
          return {
            color: data ? data.couleur : '#666666',
            fillColor: data ? data.couleur : '#FFFFFF',
            fillOpacity: 0.3,
            weight: 1,
          };
        },
        onEachFeature: (feature, layer) => {
          // Convertir l'ID du GeoJSON en chaîne pour correspondre aux IDs du Google Sheet
          const data = sheetData.find(d => d.id === String(feature.properties.id));
          console.log(`Traitement du polygone avec ID ${feature.properties.id} :`, data);
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
              console.log('Polygone cliqué :', data);
              showOverlay(data);
            });
          } else {
            console.warn(`Aucune donnée trouvée pour le polygone avec ID ${feature.properties.id}`);
          }
        }
      }).addTo(map);
    })
    .catch(error => {
      console.error("Erreur lors du chargement du GeoJSON :", error);
    });
};

// Fonction pour afficher l'overlay avec les images, l'ambiance et le texte
const showOverlay = (data) => {
    console.log('Affichage de l\'overlay pour :', data);

    // Crée le voile coloré
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.style.backgroundColor = data.couleur + '80'; // Couleur semi-transparente
    document.body.appendChild(overlay);

    // Crée l'élément pour l'ambiance
    const ambianceBox = document.createElement('div');
    ambianceBox.className = 'ambiance-box';
    ambianceBox.textContent = data.ambiance;
    ambianceBox.style.color = data.couleur; // Applique la couleur non transparente
    overlay.appendChild(ambianceBox);

    // Crée le carousel pour les images
    const carousel = document.createElement('div');
    carousel.className = 'carousel';
    const baseURL = 'https://raw.githubusercontent.com/erw-1/erw.one/main/files/img/apps/houilles/';
    let currentIndex = 0;

    // Crée les images et ajoute-les au carousel
    data.images.forEach((image, index) => {
        const img = document.createElement('img');
        img.src = `${baseURL}${image.trim()}`;
        img.style.display = index === 0 ? 'block' : 'none'; // Affiche uniquement la première image
        carousel.appendChild(img);
    });

    // Bouton gauche
    const leftButton = document.createElement('button');
    leftButton.className = 'carousel-button left';
    leftButton.innerHTML = '❮';
    leftButton.onclick = () => {
        const images = carousel.querySelectorAll('img');
        images[currentIndex].style.display = 'none';
        currentIndex = (currentIndex - 1 + images.length) % images.length;
        images[currentIndex].style.display = 'block';
    };

    // Bouton droit
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

    // Crée l'encart pour le texte
    const textBox = document.createElement('div');
    textBox.className = 'text-box';
    textBox.innerHTML = `<p>${data.texte}</p>`;
    overlay.appendChild(textBox);
    console.log('Texte ajouté à l\'overlay :', data.texte);

    // Ferme l'overlay en cliquant en dehors du contenu
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            console.log('Fermeture de l\'overlay');
            overlay.classList.add('hide'); // Ajoute la classe hide pour l'animation de fermeture
            setTimeout(() => overlay.remove(), 500); // Retire l'overlay après l'animation
        }
    });
};

// Fonction pour initialiser la carte
const initMap = (config) => {
  console.log("Initialisation de la carte avec la configuration :", config);
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
