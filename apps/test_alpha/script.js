// Get references to DOM elements
const fileInput = document.getElementById('fileInput');
const logDiv = document.getElementById('log');
const outputDiv = document.getElementById('output');

// Event listener for file input change
fileInput.addEventListener('change', handleFiles);

/**
 * Handles the files selected by the user.
 * @param {Event} event - The change event from the file input.
 */
function handleFiles(event) {
    const files = event.target.files;

    // Clear previous output and logs
    outputDiv.innerHTML = '';
    logDiv.innerHTML = '';

    // Process each selected file
    for (let i = 0; i < files.length; i++) {
        processImage(files[i]);
    }
}

/**
 * Processes a single image file.
 * @param {File} file - The image file to process.
 */
function processImage(file) {
    // Create a processing item in the log
    const processingItem = document.createElement('div');
    processingItem.textContent = `Processing ${file.name}...`;
    logDiv.appendChild(processingItem);

    // Create a FileReader to read the image file
    const reader = new FileReader();

    reader.onload = function(event) {
        const originalSrc = event.target.result;

        // Create an Image object for the processed image
        const img = new Image();
        img.src = originalSrc;
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Set canvas dimensions to the image dimensions
            canvas.width = img.width;
            canvas.height = img.height;

            // Draw the image onto the canvas
            ctx.drawImage(img, 0, 0);

            // Get image data from the canvas
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // Process each pixel (apply black to alpha conversion)
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];     // Red channel
                const g = data[i + 1]; // Green channel
                const b = data[i + 2]; // Blue channel
                const a = data[i + 3]; // Alpha channel

                // Compute the maximum of the RGB channels
                const maxRGB = Math.max(r, g, b);

                // If the pixel is black, make it fully transparent
                if (maxRGB === 0) {
                    data[i + 3] = 0; // Set alpha to 0 (fully transparent)
                }
            }

            // Put the processed data back onto the canvas
            ctx.putImageData(imageData, 0, 0);

            // Convert the canvas to a data URL (PNG format)
            const processedSrc = canvas.toDataURL('image/png');

            // Create the comparison slider
            createComparisonSlider(originalSrc, processedSrc, file.name);

            // Update the log
            logDiv.removeChild(processingItem);
            const logItem = document.createElement('div');
            logItem.textContent = `Processed image: ${file.name}`;
            logDiv.appendChild(logItem);
        };
    };

    // Read the image file as a data URL
    reader.readAsDataURL(file);
}

/**
 * Creates a comparison slider between the original and processed images.
 * @param {string} originalSrc - The source of the original image.
 * @param {string} processedSrc - The source of the processed image.
 * @param {string} fileName - The name of the image file.
 */
function createComparisonSlider(originalSrc, processedSrc, fileName) {
    const container = document.createElement('div');
    container.className = 'img-comp-container';

    const originalDiv = document.createElement('div');
    originalDiv.className = 'img-comp-img';
    const originalImg = document.createElement('img');
    originalImg.src = originalSrc;
    originalDiv.appendChild(originalImg);

    const processedDiv = document.createElement('div');
    processedDiv.className = 'img-comp-img img-comp-overlay';
    const processedImg = document.createElement('img');
    processedImg.src = processedSrc;
    processedDiv.appendChild(processedImg);

    container.appendChild(originalDiv);
    container.appendChild(processedDiv);
    outputDiv.appendChild(container);

    // Initialize the comparison slider
    initComparisons();
}

/**
 * Initializes the comparison slider functionality.
 */
function initComparisons() {
    var x, i;
    x = document.getElementsByClassName("img-comp-overlay");
    for (i = 0; i < x.length; i++) {
        compareImages(x[i]);
    }
}

/**
 * Compares two images and sets up the slider functionality.
 * @param {HTMLElement} img - The image element to compare.
 */
function compareImages(img) {
    var slider, img, clicked = 0, w, h;
    w = img.offsetWidth;
    h = img.offsetHeight;
    img.style.width = (w / 2) + "px";

    slider = document.createElement("DIV");
    slider.setAttribute("class", "img-comp-slider");
    img.parentElement.insertBefore(slider, img);

    slider.style.top = (h / 2) - (slider.offsetHeight / 2) + "px";
    slider.style.left = (w / 2) - (slider.offsetWidth / 2) + "px";

    slider.addEventListener("mousedown", slideReady);
    window.addEventListener("mouseup", slideFinish);
    slider.addEventListener("touchstart", slideReady);
    window.addEventListener("touchend", slideFinish);

    function slideReady(e) {
        e.preventDefault();
        clicked = 1;
        window.addEventListener("mousemove", slideMove);
        window.addEventListener("touchmove", slideMove);
    }

    function slideFinish() {
        clicked = 0;
    }

    function slideMove(e) {
        var pos;
        if (clicked == 0) return false;
        pos = getCursorPos(e);
        if (pos < 0) pos = 0;
        if (pos > w) pos = w;
        slide(pos);
    }

    function getCursorPos(e) {
        var a, x = 0;
        e = (e.changedTouches) ? e.changedTouches[0] : e;
        a = img.getBoundingClientRect();
        x = e.pageX - a.left;
        x = x - window.pageXOffset;
        return x;
    }

    function slide(x) {
        img.style.width = x + "px";
        slider.style.left = img.offsetWidth - (slider.offsetWidth / 2) + "px";
    }
}
