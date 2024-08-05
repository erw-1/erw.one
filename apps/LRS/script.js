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
        weight: 3,
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
        radius: 3,
        fillColor: "#ffff00", // Yellow color
        color: "none",
        fillOpacity: 1
    };
}

// Style for the points created by a click
function clickPointStyle() {
    return {
        radius: 3,
        fillColor: "#00ff00",
        color: "none",
        fillOpacity: 1
    };
}

// Style for the closest PR points
function closestPrStyle() {
    return {
        radius: 3,
        fillColor: "#ffa500", // Orange color
        color: "none",
        fillOpacity: 1
    };
}

// Initialize the map
var map = L.map('map', {
    center: [47.6205, 6.3498],
    zoom: 10,
    zoomControl: false
});

// Add cartodb tiles
L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    attribution: 'HSN | OSM',
    maxNativeZoom: 19,
    maxZoom: 22
}).addTo(map);

let routesLayer;
let pointsLayer;
let previewPoint;
let closestPrLayer = L.layerGroup().addTo(map);
let clickedPointsLayer = L.layerGroup().addTo(map); // Layer group for clicked points
let highlightedLayer;
let highlightedTooltip;
let originalData; // Store the original data for reloading
const simplificationThreshold = 0.01; // Simplification threshold for zoom levels
const magnetismRange = 600; // Reduced range to 600 meters
const zoomRequirement = 12; // Zoom level requirement for enabling dot layers and magnetism

// Function to simplify geometry based on zoom level
function simplifyGeometry(data, zoom) {
    const tolerance = zoom < zoomRequirement ? simplificationThreshold : 0; // Simplify more at lower zoom levels
    return turf.simplify(data, { tolerance, highQuality: true });
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
        originalData = data; // Store the original data
        const simplifiedData = simplifyGeometry(data, map.getZoom());
        routesLayer = L.geoJson(simplifiedData, {
            style: routes70Style
        }).addTo(map);
        console.log("Routes layer added");

        // Fetch and add the first layer (pr70.geojson) with red dot styling
        return fetch('data/pr70.geojson');
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        pointsLayer = L.geoJson(data, {
            pointToLayer: function (feature, latlng) {
                return L.circleMarker(latlng, pr70Style(feature));
            }
        }).addTo(map);
        console.log("PR layer added");

        // Add event listeners after everything is initialized
        map.on('mousemove', throttle(handleMouseMove, 100)); // Throttle to 100ms
        map.on('click', handleMapClick);
        map.on('zoomend', handleZoomEnd); // Simplify geometry on zoom
    })
    .catch(error => console.error('Error fetching geojson:', error));

// Throttle function to limit the frequency of updates
function throttle(func, limit) {
    let lastFunc;
    let lastRan;
    return function() {
        const context = this;
        const args = arguments;
        if (!lastRan) {
            func.apply(context, args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(function() {
                if ((Date.now() - lastRan) >= limit) {
                    func.apply(context, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
}

// Function to find the nearest point on the line within the specified range
function getNearestPoint(latlng) {
    const point = turf.point([latlng.lng, latlng.lat]);
    let nearestPoint = null;
    let minDistance = magnetismRange; // Use the specified magnetism range
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

// Function to find the closest PR points in each direction
function findClosestPRs(previewPoint, routeId) {
    const point = turf.point([previewPoint[0], previewPoint[1]]);
    const prPoints = [];
    pointsLayer.eachLayer(layer => {
        if (layer.feature.properties.route_pr === routeId) {
            const prPoint = turf.point([layer.getLatLng().lng, layer.getLatLng().lat]);
            prPoints.push({
                layer: layer,
                distance: turf.distance(point, prPoint, { units: 'meters' }),
                properties: layer.feature.properties,
                coordinates: [layer.getLatLng().lng, layer.getLatLng().lat]
            });
        }
    });

    prPoints.sort((a, b) => a.distance - b.distance);

    // Find the closest PR points in each direction
    let closestAhead = null;
    let closestBehind = null;

    prPoints.forEach(pr => {
        const prLatLng = pr.layer.getLatLng();
        if (prLatLng.lng > previewPoint[0] && !closestAhead) {
            closestAhead = pr;
        } else if (prLatLng.lng < previewPoint[0] && !closestBehind) {
            closestBehind = pr;
        }
    });

    return [closestAhead, closestBehind].filter(Boolean);
}

// Function to handle mouse move event
function handleMouseMove(e) {
    if (map.getZoom() >= zoomRequirement) {
        const { nearestPoint, nearestLayer } = getNearestPoint(e.latlng);

        if (nearestPoint) {
            // Highlight the nearest road segment
            if (highlightedLayer && highlightedLayer !== nearestLayer) {
                routesLayer.resetStyle(highlightedLayer);
                if (highlightedTooltip) {
                    map.removeLayer(highlightedTooltip);
                }
                closestPrLayer.clearLayers();
            }
            if (nearestLayer) {
                nearestLayer.setStyle(highlightStyle());
                highlightedLayer = nearestLayer;

                // Display road name tooltip
                const roadName = nearestLayer.feature.properties.nom_route;
                if (highlightedTooltip) {
                    map.removeLayer(highlightedTooltip);
                }
                highlightedTooltip = L.tooltip({
                    permanent: true,
                    direction: 'top',
                    offset: [0, -10],
                    className: 'highlighted-tooltip'
                })
                .setContent(roadName)
                .setLatLng([nearestPoint.geometry.coordinates[1], nearestPoint.geometry.coordinates[0]])
                .addTo(map);

                // Highlight the closest PR points in each direction with matching route_pr
                const closestPRs = findClosestPRs(nearestPoint.geometry.coordinates, roadName);
                closestPRs.forEach(pr => {
                    const prMarker = L.circleMarker(pr.layer.getLatLng(), closestPrStyle()).addTo(closestPrLayer);
                    L.tooltip({
                        permanent: true,
                        direction: 'top',
                        offset: [0, -10],
                        className: 'pr-tooltip'
                    })
                    .setContent(pr.properties.num_pr)
                    .setLatLng(pr.layer.getLatLng())
                    .addTo(prMarker);
                });
            }

            // Preview the future point
            if (previewPoint) {
                previewPoint.setLatLng([nearestPoint.geometry.coordinates[1], nearestPoint.geometry.coordinates[0]]);
            } else {
                previewPoint = L.circleMarker([nearestPoint.geometry.coordinates[1], nearestPoint.geometry.coordinates[0]], previewPointStyle()).addTo(map);
            }
        } else {
            // Remove the highlight and preview point if not within the specified range
            if (highlightedLayer) {
                routesLayer.resetStyle(highlightedLayer);
                highlightedLayer = null;
            }
            if (highlightedTooltip) {
                map.removeLayer(highlightedTooltip);
                highlightedTooltip = null;
            }
            if (previewPoint) {
                map.removeLayer(previewPoint);
                previewPoint = null;
            }
            closestPrLayer.clearLayers();
        }

        map.getContainer().style.cursor = nearestPoint ? 'pointer' : '';
    }
}

// Function to handle map click event
function handleMapClick(e) {
    if (map.getZoom() >= zoomRequirement) {
        const { nearestPoint } = getNearestPoint(e.latlng);
        if (nearestPoint) {
            L.circleMarker([nearestPoint.geometry.coordinates[1], nearestPoint.geometry.coordinates[0]], clickPointStyle()).addTo(clickedPointsLayer);
            if (previewPoint) {
                map.removeLayer(previewPoint);
                previewPoint = null;
            }
        }
    }
}

// Function to handle zoom end event
function handleZoomEnd() {
    const currentZoom = map.getZoom();
    let data;
    if (currentZoom >= zoomRequirement) {
        // Use original data when zoom level is high
        data = originalData;
        pointsLayer.addTo(map); // Add points layer when zoomed in
        clickedPointsLayer.addTo(map); // Add clicked points layer when zoomed in
        closestPrLayer.addTo(map); // Add closest PR layer when zoomed in
    } else {
        // Simplify geometry when zoom level is low
        data = simplifyGeometry(originalData, currentZoom);
        map.removeLayer(pointsLayer); // Remove points layer when zoomed out
        map.removeLayer(clickedPointsLayer); // Remove clicked points layer when zoomed out
        map.removeLayer(closestPrLayer); // Remove closest PR layer when zoomed out
    }
    map.removeLayer(routesLayer);
    routesLayer = L.geoJson(data, {
        style: routes70Style
    }).addTo(map);
    // Ensure pointsLayer, clickedPointsLayer, and closestPrLayer are always on top
    if (map.hasLayer(pointsLayer)) {
        map.removeLayer(pointsLayer);
        pointsLayer.addTo(map);
    }
    if (map.hasLayer(clickedPointsLayer)) {
        map.removeLayer(clickedPointsLayer);
        clickedPointsLayer.addTo(map);
    }
    if (map.hasLayer(closestPrLayer)) {
        map.removeLayer(closestPrLayer);
        closestPrLayer.addTo(map);
    }
}
