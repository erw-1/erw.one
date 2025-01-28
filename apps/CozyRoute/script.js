/***********************************************
 * Variables globales
 ***********************************************/

// Stockage des réponses utilisateur (0 à 5)
let userData = {
    odorat: 0,
    marchabilite: 0,
    // ... complèter les autres thèmes
    claustrophobie: 0,
    agoraphobie: 0,
    pollution: 0,
    bruit: 0,
    eclairage: 0,
    handicap: 0,
    trafic_routier: 0,
  };
  
  // Référence au radarChart (Chart.js)
  let radarChart = null;
  
  // Référence à la couche GeoJSON
  let cozyRouteLayer = null;
  
  // Ordre des thèmes et couleurs pour le radar
  const themes = [
    "odorat",
    "marchabilite",
    "claustrophobie",
    "agoraphobie",
    "pollution",
    "bruit",
    "eclairage",
    "handicap",
    "trafic_routier"
  ];
  const themeColors = {
    odorat: getComputedStyle(document.documentElement).getPropertyValue('--odorat-color'),
    marchabilite: getComputedStyle(document.documentElement).getPropertyValue('--marchabilite-color'),
    claustrophobie: getComputedStyle(document.documentElement).getPropertyValue('--claustrophobie-color'),
    agoraphobie: getComputedStyle(document.documentElement).getPropertyValue('--agoraphobie-color'),
    pollution: getComputedStyle(document.documentElement).getPropertyValue('--pollution-color'),
    bruit: getComputedStyle(document.documentElement).getPropertyValue('--bruit-color'),
    eclairage: getComputedStyle(document.documentElement).getPropertyValue('--eclairage-color'),
    handicap: getComputedStyle(document.documentElement).getPropertyValue('--handicap-color'),
    trafic_routier: getComputedStyle(document.documentElement).getPropertyValue('--trafic_routier-color'),
  };
  
  /***********************************************
   * Initialisation de la carte Leaflet
   ***********************************************/
  
  const map = L.map('map', {
    zoomControl: true,
    attributionControl: false,
    // Pas de fond de carte (fond blanc)
  }).setView([49.0389, 2.0760], 13); // Centre approximatif sur Cergy
  
  // Exemple de chargement d'un GeoJSON (à adapter avec ton vrai fichier / URL)
  fetch('cozyroute.geojson')
    .then(response => response.json())
    .then(geojsonData => {
      // Création de la couche
      cozyRouteLayer = L.geoJSON(geojsonData, {
        style: feature => {
          // Style de base : blanc
          return {
            color: '#FFFFFF',
            weight: 3,
          };
        }
      }).addTo(map);
      map.fitBounds(cozyRouteLayer.getBounds());
    });
  
  /***********************************************
   * Gestion du "bloom" (intensité) 
   * On applique du style dynamique en fonction 
   * des notes questionnaire
   ***********************************************/
  function updateRoadStyle() {
    if (!cozyRouteLayer) return;
  
    cozyRouteLayer.setStyle(feature => {
      // Récupère les notes route
      // ex: feature.properties.odorat, .marchabilite, etc.
      let roadOdorat = feature.properties ? feature.properties.odorat : 0;
      // ... faire de même pour chaque thème
      
      // Calcul d'une "tache" composite (ex. max, ou addition, etc.)
      // Ici, on fait un exemple sur odorat seulement. 
      // Adapter la logique pour mixer toutes les taches, 
      // ou générer un "filtre" plus complexe.
      
      const userOdorat = userData.odorat;
      const intensityOdorat = roadOdorat * userOdorat * 4; 
      // intensitéOdorat = pourcentage (0 à 100) 
      // On pourrait le normaliser: Math.min(intensityOdorat, 100)
      
      // On va créer un style CSS "shadow" ou "glow" en jouant sur l'opacity.
      // Dans Leaflet, on peut utiliser des options type "color", "opacity", "weight",
      // mais pour un effet “bloom” plus poussé, on peut injecter un "className" + CSS.
      
      // On va injecter une classe paramétrée en fonction des notes
      // ex: .odorat_5, .odorat_3, etc.
      // On contruit un champ "className" pour la feature
      let className = '';
      themes.forEach(t => {
        const roadValue = feature.properties[t] || 0;    // note route
        const userValue = userData[t];                  // note user
        if (roadValue > 0) {
          const intensity = roadValue * userValue * 4;  // 0 à 100
          // arrondi
          const intensity100 = Math.min(intensity, 100);
          // On forme un ID ex: "odorat_5" => "odorat-5"
          className += `${t}-${roadValue} intensity-${intensity100} `;
        }
      });
      
      return {
        className: className.trim(),
        color: '#FFFFFF', // ligne de base
        weight: 3,
      };
    });
  }
  
  /***********************************************
   * Radar Chart
   ***********************************************/
  function initRadarChart() {
    const ctx = document.getElementById('radarChart').getContext('2d');
    radarChart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: themes.map(t => t.charAt(0).toUpperCase() + t.slice(1)),
        datasets: [{
          label: 'Mon niveau de gêne',
          data: themes.map(t => userData[t]),
          backgroundColor: 'rgba(103, 58, 183, 0.2)',
          borderColor: 'rgba(103, 58, 183, 1)',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        scales: {
          r: {
            min: 0,
            max: 5,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  }
  
  function updateRadarChart() {
    if (!radarChart) return;
    radarChart.data.datasets[0].data = themes.map(t => userData[t]);
    radarChart.update();
  }
  
  /***********************************************
   * Gestion questionnaire
   ***********************************************/
  function updateQuestionValue(theme, value) {
    // Met à jour la valeur interne
    userData[theme] = parseInt(value, 10);
    
    // Met à jour le label <span> (ex: odorat-value)
    document.getElementById(`${theme}-value`).textContent = value;
    
    // Met à jour le radar chart
    updateRadarChart();
    
    // Met à jour le style des routes (bloom)
    updateRoadStyle();
  }
  
  /***********************************************
   * Gestions des événements
   ***********************************************/
  // Bouton "Accéder à la carte"
  document.getElementById('goto-map').addEventListener('click', () => {
    // on cache l'overlay questionnaire (slide left)
    document.getElementById('questionnaire-overlay').classList.add('hidden');
  });
  
  // Bouton burger (ouvre/ferme le questionnaire)
  document.getElementById('burger-menu').addEventListener('click', () => {
    document.getElementById('questionnaire-overlay').classList.toggle('hidden');
  });
  
  // Bouton search
  document.getElementById('search-button').addEventListener('click', () => {
    // Récupère l’adresse (sans geocodage complet ici, c’est un exemple)
    const address = document.getElementById('search-input').value;
    // TODO: appeller un service de geocodage si besoin
    alert("Recherche d'adresse: " + address);
  });
  
  /***********************************************
   * Initialisation au chargement
   ***********************************************/
  initRadarChart();
  
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        // place un marker 
        L.marker([lat,lng]).addTo(map);
        map.setView([lat, lng], 14);
      },
      (err) => { console.warn(err) },
      { enableHighAccuracy: true }
    );
  