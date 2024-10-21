const owner = 'erw-1';
const repo = 'erw.one';
const basePath = 'files/img/photo/';
const branch = 'main';

const galleryContainer = document.getElementById('gallery');
const backButton = document.getElementById('back-button');
const errorMessage = document.getElementById('error-message');

let currentFolder = '';
let currentIndex = 0;
let currentImages = [];
let lightbox, lightboxImg, prevBtn, nextBtn;
let cachedTree = null; // Cache the tree data for later use

// Fetch the entire repository tree using the GitHub API
async function fetchGitHubTree() {
    if (cachedTree) {
        return cachedTree; // Use the cached data if available
    }
    try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
        if (response.status === 403) {
            throw new Error('Rate limit exceeded');
        }
        const data = await response.json();
        cachedTree = data.tree; // Cache the tree data after fetching
        return cachedTree;
    } catch (error) {
        console.error(error.message);
        errorMessage.style.display = 'block';
        return null;
    }
}

// Handle hash change (fragment) for direct folder navigation
window.addEventListener('hashchange', handleHashChange);
window.addEventListener('load', handleHashChange);

async function handleHashChange() {
    const hash = window.location.hash;
    if (hash) {
        const folderPath = hash.replace(/#/g, '/'); // Convert #nature#insects to /nature/insects
        const fullPath = basePath + folderPath;

        const tree = await fetchGitHubTree();
        if (!tree) return;

        // Check if the folder exists in the tree
        const folderExists = tree.some(item => item.type === 'tree' && item.path === fullPath);
        if (folderExists) {
            showFoldersUsingTree(fullPath); // Load the folder
        } else {
            showErrorMessage('The folder you are trying to access does not exist.');
        }
    } else {
        showFoldersUsingTree(basePath); // Show root folder if no hash
    }
}

// Show an error message
function showErrorMessage(message) {
    errorMessage.innerText = message;
    errorMessage.style.display = 'block'; // Make the error message visible
}

// Show folders using the cached or fetched tree
async function showFoldersUsingTree(folderPath = basePath) {
    const tree = await fetchGitHubTree();
    if (!tree) return;

    // Clear error message
    errorMessage.style.display = 'none';

    // Update the URL fragment based on the folder path
    const folderHash = folderPath.replace(basePath, '').replace(/\//g, '#'); // Convert /nature/insects to #nature#insects
    window.location.hash = folderHash;

    // Filter for folders and files in the current folder path
    const folders = tree.filter(item => item.type === 'tree' && item.path.startsWith(folderPath));
    
    galleryContainer.innerHTML = '';
    folders.forEach(folder => {
        const folderDiv = document.createElement('div');
        folderDiv.className = 'folder';
        folderDiv.style.backgroundImage = `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${folder.path}/preview.jxl')`;
        folderDiv.innerHTML = `<div class="title">${folder.path.split('/').pop()}</div>`;
        folderDiv.onclick = () => showFoldersUsingTree(folder.path); // Recursive navigation into subfolder
        galleryContainer.appendChild(folderDiv);
    });

    // Show images in this folder
    const images = tree.filter(item => item.type === 'blob' && item.path.startsWith(folderPath) && item.path.endsWith('.jxl'));
    images.forEach((image, index) => {
        const photoDiv = document.createElement('div');
        photoDiv.className = 'photo';
        const imageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${image.path}`;
        photoDiv.style.backgroundImage = `url('${imageUrl}')`;
        observeBackgroundImageChange(photoDiv);
        photoDiv.onclick = () => openLightbox(index);
        galleryContainer.appendChild(photoDiv);
    });

    backButton.style.display = folderPath === basePath ? 'none' : 'block'; // Show back button if not in root folder
}

// Observe and resize background images based on their aspect ratio
function observeBackgroundImageChange(targetElement) {
    const observer = new MutationObserver((mutationsList) => {
        mutationsList.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                const bgImage = targetElement.style.backgroundImage;
                if (bgImage && bgImage.startsWith('url("blob:')) {
                    const blobUrl = bgImage.slice(5, -2); // Extract blob URL

                    // Create an Image object to load the blob and get its dimensions
                    const img = new Image();
                    img.src = blobUrl;
                    img.onload = function() {
                        const aspectRatio = img.naturalWidth / img.naturalHeight;

                        // Resize the div to match the aspect ratio
                        targetElement.style.width = `${200 * aspectRatio}px`; // Keeping the initial height as 200px
                        targetElement.style.height = 'auto';
                    };
                }
            }
        });
    });

    // Start observing the target element for attribute changes
    observer.observe(targetElement, { attributes: true });
}

// Display the photos in the lightbox when clicked
function openLightbox(index) {
    currentIndex = index;

    // Reusing the existing gallery elements
    const photoDivs = galleryContainer.querySelectorAll('.photo');
    const selectedImage = photoDivs[currentIndex];

    createLightbox(selectedImage);
    updateLightbox();
    lightbox.style.display = 'flex';
}

// Create or update the lightbox with the selected image
function createLightbox(selectedImage) {
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'lightbox';
        lightbox.className = 'lightbox';
        lightbox.style.display = 'none'; // Initially hidden
        document.body.appendChild(lightbox);

        // Lightbox image
        lightboxImg = document.createElement('div');
        lightboxImg.id = 'lightbox-img';
        lightboxImg.className = 'lightbox-img';
        lightboxImg.style.backgroundImage = selectedImage.style.backgroundImage; // Use the same image
        lightbox.appendChild(lightboxImg);

        // Previous button
        prevBtn = document.createElement('span');
        prevBtn.id = 'prev';
        prevBtn.innerHTML = '&#10094;';
        prevBtn.className = 'nav';
        prevBtn.onclick = (event) => {
            event.stopPropagation();
            navigate(-1);
        };
        lightbox.appendChild(prevBtn);

        // Next button
        nextBtn = document.createElement('span');
        nextBtn.id = 'next';
        nextBtn.innerHTML = '&#10095;';
        nextBtn.className = 'nav';
        nextBtn.onclick = (event) => {
            event.stopPropagation();
            navigate(1);
        };
        lightbox.appendChild(nextBtn);

        // Close lightbox when clicking outside of the image
        lightbox.onclick = closeLightbox;
    } else {
        // Update existing lightbox with new image from the gallery
        lightboxImg.style.backgroundImage = selectedImage.style.backgroundImage;
    }
}

// Update the lightbox with the selected image
function updateLightbox() {
    const photoDivs = galleryContainer.querySelectorAll('.photo');
    const selectedImage = photoDivs[currentIndex];
    lightboxImg.style.backgroundImage = selectedImage.style.backgroundImage;
}

// Close the lightbox
function closeLightbox() {
    if (lightbox) {
        lightbox.style.display = 'none';
    }
}

// Navigate between images in the lightbox
function navigate(direction) {
    currentIndex = (currentIndex + direction + currentImages.length) % currentImages.length;
    updateLightbox();
}

// Go back to the previous folder
function goBack() {
    showFoldersUsingTree(basePath);
}

backButton.onclick = goBack;

// Initial load of the root folder
showFoldersUsingTree(basePath);
