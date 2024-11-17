// Initialize the Leaflet map
const map = L.map('map').setView([0, 0], 2);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Function to fetch and parse GeoParquet file
async function loadGeoParquet(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        
        // Parse the Parquet data using Apache Arrow
        const table = arrow.Table.from(arrayBuffer, { format: 'parquet' });

        // Check if 'geometry' column exists
        if (!table.schema.fields.some(field => field.name === 'geometry')) {
            throw new Error("No 'geometry' column found in the GeoParquet file.");
        }

        const geometryColumn = table.getColumn('geometry');
        const geoJSONFeatures = [];

        // Iterate through rows and extract geometries
        for (let i = 0; i < table.numRows; i++) {
            const geometry = geometryColumn.get(i);
            const properties = {}; // Extract other properties as needed

            let geoJSON;

            // Determine the format of the geometry (GeoJSON string, WKT, WKB, etc.)
            if (typeof geometry === 'string') {
                try {
                    // Try parsing as GeoJSON
                    geoJSON = JSON.parse(geometry);
                } catch (e) {
                    // If failed, try parsing as WKT
                    geoJSON = wellknown.parse(geometry);
                    if (!geoJSON) {
                        console.warn(`Row ${i}: Unable to parse geometry.`);
                        continue; // Skip this feature
                    }
                }
            } else if (geometry instanceof Uint8Array) {
                // If geometry is in WKB format, you'll need a WKB parser
                // Example: Using the 'wkb' library (not included here)
                console.warn(`Row ${i}: WKB geometry parsing not implemented.`);
                continue; // Skip this feature
            } else {
                console.warn(`Row ${i}: Unknown geometry format.`);
                continue; // Skip this feature
            }

            geoJSONFeatures.push({
                type: "Feature",
                geometry: geoJSON,
                properties: properties
            });
        }

        const geoJSON = {
            type: "FeatureCollection",
            features: geoJSONFeatures
        };

        // Add GeoJSON layer to the map
        const geoLayer = L.geoJSON(geoJSON).addTo(map);

        // Fit the map to the GeoJSON layer bounds
        map.fitBounds(geoLayer.getBounds());

    } catch (error) {
        console.error("Error loading GeoParquet:", error);
        alert("Failed to load GeoParquet data. Check the console for details.");
    }
}

// Replace with the URL to your GeoParquet file
const geoParquetURL = 'data/data.parquet';

// Load the GeoParquet file
loadGeoParquet(geoParquetURL);
