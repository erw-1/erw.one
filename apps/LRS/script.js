// Style function for routes70 layer (dark grey lines)
function routes70Style(feature) {
    return {
        color: "#4d4d4d",
        weight: 5, // Reduced weight for smaller hitbox
        opacity: 0.8
    };
}

// Style function for highlighted route
function highlightStyle(feature) {
    return {
        color: "#000000",
        weight: 8, // Increased weight for highlight
        opacity: 1
    };
}

// Style function for pr70 layer (simple red dots)
function pr70Style(feature) {
    return {
        radius: 3,
        fillColor: "#ff0000",
        color: "none",
        fillOpacity: 1
    };
}

// Style for the future point preview
function previewPointStyle() {
    return {
        radius: 4,
        fillColor: "#0000ff", // Blue color
        color: "none",
        fillOpacity: 0.8
    };
}

// Style for the points created by a click
function clickPointStyle() {
    return {
        radius: 4,
        fillColor: "#00ff00", // Green color
        color: "none",
        fillOpacity: 0.8
    };
}

// Initialize the map
var map = L.map('map', {
    center: [47.6205, 6.3498], // Set to the desired center coordinates
    zoom: 10,                  // Set to the desired initial zoom level
    zoomControl: false         // Disables the default zoom controls
});

// Add cartodb tiles
L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    attribution: 'HSN | OSM',
    maxNativeZoom: 19,
    maxZoom: 22
}).addTo(map);

let routesLayer;
let previewPoint;
let highlightedLayer;

// Fetch and add the second layer (routes70.geojson) with dark grey line styling
fetch('data/routes70.geojson')
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        routesLayer = L.geoJson(data, {
            style: routes70Style
        }).addTo(map);
    })
    .then(() => {
        // Fetch and add the first layer (pr70.geojson) with red dot styling
        fetch('data/pr70.geojson')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => L.geoJson(data, {
                pointToLayer: function (feature, latlng) {
                    return L.circleMarker(latlng, pr70Style(feature));
                }
            }).addTo(map))
            .catch(error => console.error('Error fetching pr70.geojson:', error));
    })
    .catch(error => console.error('Error fetching routes70.geojson:', error));

// Function to find the nearest point on the line within 100 meters
function getNearestPoint(latlng) {
    const point = turf.point([latlng.lng, latlng.lat]);
    let nearestPoint = null;
    let minDistance = 100; // 100 meters
    let nearestLayer = null;

    routesLayer.eachLayer(layer => {
        const line = turf.feature(layer.feature.geometry);
        const snapped = turf.nearestPointOnLine(line, point);
        const distance = turf.distance(point, snapped, { units: 'meters' });

        if (distance < minDistance) {
            minDistance = distance;
            nearestPoint = snapped;
            nearestLayer = layer;
        }
    });

    return { nearestPoint, nearestLayer };
}

// Add move event listener to the map for hover effect
map.on('mousemove', function(e) {
    const { nearestPoint, nearestLayer } = getNearestPoint(e.latlng);

    if (nearestPoint) {
        // Highlight the nearest road segment
        if (highlightedLayer && highlightedLayer !== nearestLayer) {
            routesLayer.resetStyle(highlightedLayer);
        }
        if (nearestLayer) {
            nearestLayer.setStyle(highlightStyle());
            highlightedLayer = nearestLayer;
        }

        // Preview the future point
        if (previewPoint) {
            previewPoint.setLatLng([nearestPoint.geometry.coordinates[1], nearestPoint.geometry.coordinates[0]]);
        } else {
            previewPoint = L.circleMarker([nearestPoint.geometry.coordinates[1], nearestPoint.geometry.coordinates[0]], previewPointStyle()).addTo(map);
        }
    } else {
        // Remove the highlight and preview point if not within 100 meters
        if (highlightedLayer) {
            routesLayer.resetStyle(highlightedLayer);
            highlightedLayer = null;
        }
        if (previewPoint) {
            map.removeLayer(previewPoint);
            previewPoint = null;
        }
    }

    map.getContainer().style.cursor = nearestPoint ? 'pointer' : '';
});

// Add click event listener to the map
map.on('click', function(e) {
    const { nearestPoint } = getNearestPoint(e.latlng);
    if (nearestPoint) {
        L.circleMarker([nearestPoint.geometry.coordinates[1], nearestPoint.geometry.coordinates[0]], clickPointStyle()).addTo(map);
        if (previewPoint) {
            map.removeLayer(previewPoint);
            previewPoint = null;
        }
    }
});
