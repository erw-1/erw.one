document.addEventListener('DOMContentLoaded', function() {
    // Define the map
    var map = L.map('map').setView([48.8566, 2.3522], 13); // Centered on Paris

    // Add CartoDB basemap
    L.tileLayer('https://{s}.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    // Initialize Proj4
    proj4.defs("EPSG:2154","+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
    var lambert93 = new proj4.Proj('EPSG:2157');

    // Event listener for map clicks
    map.on('click', function(e) {
        var latlng = e.latlng;
        var transformed = proj4(proj4.WGS84, lambert93, [latlng.lng, latlng.lat]);
        var popupContent = `Coordonnées Lambert93 : ${transformed[0].toFixed(2)}, ${transformed[1].toFixed(2)}`;

        // Show popup
        L.popup()
            .setLatLng(latlng)
            .setContent(popupContent)
            .openOn(map);

        // Copy coordinates to clipboard
        navigator.clipboard.writeText(`${transformed[0].toFixed(2)}, ${transformed[1].toFixed(2)}`)
            .then(() => alert('Coordonnées copiées dans le presse-papier!'))
            .catch(err => console.error('Erreur lors de la copie: ', err));
    });
});
