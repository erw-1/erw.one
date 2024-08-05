// Style function for routes70 layer (dark grey lines)
function routes70Style(feature) {
    return {
        color: "#4d4d4d",
        weight: 2,
        opacity: 0.8
    };
}

// Style function for highlighted route
function highlightStyle(feature) {
    return {
        color: "#2d2d2d",
        weight: 3, // Increased weight for highlight
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
let tree;
const maxDistance = 100; // 100 meters

// Debounce function to limit the rate of function calls
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

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
        tree = createTree(data);
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

// Create a spatial index tree for the routes data
function createTree(data) {
    const tree = rbush();
    const items = [];

    data.features.forEach(feature => {
        const coords = feature.geometry.coordinates;
        coords.forEach(coord => {
            if (Array.isArray(coord) && coord.length === 2 && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
                items.push({
                    minX: coord[0],
                    minY: coord[1],
                    maxX: coord[0],
                    maxY: coord[1],
                    feature
                });
            }
        });
    });

    tree.load(items);
    return tree;
}

// Function to find the nearest point on the line within 100 meters
function getNearestPoint(latlng) {
    const point = turf.point([latlng.lng, latlng.lat]);
    const nearest = tree.search({
        minX: latlng.lng - 0.001,
        minY: latlng.lat - 0.001,
        maxX: latlng.lng + 0.001,
        maxY: latlng.lat + 0.001
    });

    let minDistance = maxDistance;
    let nearestPoint = null;
    let nearestLayer = null;

    nearest.forEach(item => {
        const snapped = turf.nearestPointOnLine(item.feature, point);
        const distance = turf.distance(point, snapped, { units: 'meters' });

        if (distance < minDistance) {
            minDistance = distance;
            nearestPoint = snapped;
            nearestLayer = item.feature;
        }
    });

    return { nearestPoint, nearestLayer };
}

// Add move event listener to the map for hover effect
map.on('mousemove', debounce(function(e) {
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
}, 50));

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
