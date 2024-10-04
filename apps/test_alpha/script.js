// script.js

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
    processingItem.className = 'processing-item';
    processingItem.textContent = `Processing ${file.name}`;
    const progressBarContainer = document.createElement('div');
    progressBarContainer.className = 'progress-bar-container';
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressBarContainer.appendChild(progressBar);
    processingItem.appendChild(progressBarContainer);
    logDiv.appendChild(processingItem);

    // Create a FileReader to read the image file
    const reader = new FileReader();

    // Load event handler for the FileReader
    reader.onload = function(event) {
        // Create an Image object
        const img = new Image();

        // Ensure CORS is handled for cross-origin images
        img.crossOrigin = 'Anonymous';

        // Load event handler for the Image
        img.onload = function() {
            // Create an off-screen canvas
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

            // Process each pixel
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
                    continue;
                }

                // Compute alpha factor
                const alphaFactor = maxRGB / 255;

                // Compute new alpha
                const newAlpha = a * alphaFactor;

                // Avoid division by zero
                if (newAlpha === 0) {
                    data[i + 3] = 0;
                    continue;
                }

                // Adjust RGB values to preserve appearance
                data[i] = (r * a) / newAlpha;
                data[i + 1] = (g * a) / newAlpha;
                data[i + 2] = (b * a) / newAlpha;

                // Clamp RGB values
                data[i] = Math.min(255, Math.max(0, data[i]));
                data[i + 1] = Math.min(255, Math.max(0, data[i + 1]));
                data[i + 2] = Math.min(255, Math.max(0, data[i + 2]));

                // Update alpha channel
                data[i + 3] = newAlpha;
            }

            // Put the processed data back onto the canvas
            ctx.putImageData(imageData, 0, 0);

            // Convert the canvas to a data URL (PNG format)
            const dataURL = canvas.toDataURL('image/png');

            // Create a container for the processed image and comparison slider
            const container = document.createElement('div');
            container.className = 'image-container';

            // Create a heading for the image
            const imageHeading = document.createElement('h3');
            imageHeading.textContent = `Processed Image: ${file.name}`;
            container.appendChild(imageHeading);

            // Create the black background for the original image
            const blackBackground = document.createElement('div');
            blackBackground.className = 'black-background';

            // Create the checkerboard background for the processed image
            const checkerboard = document.createElement('div');
            checkerboard.className = 'checkerboard';

            // Create the comparison slider
            const sliderWrapper = document.createElement('div');
            sliderWrapper.className = 'slider-wrapper';

            // Original image
            const originalImg = document.createElement('img');
            originalImg.src = event.target.result;

            // Processed image
            const processedImg = document.createElement('img');
            processedImg.src = dataURL;

            // Overlay for processed image
            const overlay = document.createElement('div');
            overlay.className = 'overlay';
            overlay.appendChild(processedImg);

            // Handle for the slider
            const handle = document.createElement('div');
            handle.className = 'handle';

            // Append images and handle to the slider wrapper
            sliderWrapper.appendChild(originalImg);
            sliderWrapper.appendChild(overlay);
            sliderWrapper.appendChild(handle);

            // Append backgrounds and slider to the container
            container.appendChild(blackBackground);  // Original black background
            container.appendChild(checkerboard);     // Checkerboard behind processed image
            container.appendChild(sliderWrapper);    // Image slider

            // Create a download link for the processed image
            const downloadLink = document.createElement('a');
            downloadLink.href = dataURL;
            downloadLink.download = `processed_${file.name.replace(/\.\w+$/, '.png')}`;
            downloadLink.textContent = `Download Processed Image (${downloadLink.download})`;
            downloadLink.className = 'download-link';

            // Append the download link to the container
            container.appendChild(downloadLink);

            // Append the container to the output div
            outputDiv.appendChild(container);

            // Remove the processing item from the log
            logDiv.removeChild(processingItem);

            // Initialize the comparison slider
            initComparisonSlider(sliderWrapper);

            // Log the processing of this image
            log(`Processed image: ${file.name}`);
        };

        // Error handling for image loading
        img.onerror = function() {
            log(`Failed to load image: ${file.name}`);
            // Remove the processing item from the log
            logDiv.removeChild(processingItem);
        };

        // Set the Image source to the data URL from the FileReader
        img.src = event.target.result;
    };

    // Read the image file as a data URL
    reader.readAsDataURL(file);

    // Simulate progress (since processing is synchronous)
    simulateProgress(progressBar);
}

/**
 * Logs messages to the logDiv and console.
 * @param {string} message - The message to log.
 */
function log(message) {
    // Create a new paragraph element for the message
    const p = document.createElement('p');
    p.textContent = message;

    // Append the message to the logDiv
    logDiv.appendChild(p);

    // Also log to the console
    console.log(message);
}

/**
 * Simulates a progress bar for the image processing.
 * @param {HTMLElement} progressBar - The progress bar element.
 */
function simulateProgress(progressBar) {
    let width = 0;
    const interval = setInterval(() => {
        if (width >= 100) {
            clearInterval(interval);
        } else {
            width += 10;
            progressBar.style.width = width + '%';
        }
    }, 100);
}

/**
 * Initializes the comparison slider for the given slider wrapper.
 * @param {HTMLElement} sliderWrapper - The slider wrapper element.
 */
function initComparisonSlider(sliderWrapper) {
    const overlay = sliderWrapper.querySelector('.overlay');
    const handle = sliderWrapper.querySelector('.handle');

    let isDragging = false;

    const onMouseMove = (e) => {
        if (!isDragging) return;
        const rect = sliderWrapper.getBoundingClientRect();
        let offsetX = e.clientX - rect.left;
        offsetX = Math.max(0, Math.min(offsetX, rect.width));
        const percentage = (offsetX / rect.width) * 100;
        overlay.style.width = percentage + '%';
        handle.style.left = percentage + '%';
    };

    const onMouseDown = (e) => {
        isDragging = true;
        onMouseMove(e);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const onMouseUp = () => {
        isDragging = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    };

    handle.addEventListener('mousedown', onMouseDown);
    sliderWrapper.addEventListener('mousedown', onMouseDown);
}

