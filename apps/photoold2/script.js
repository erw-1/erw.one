const owner = 'erw-1';
const repo = 'erw.one';
const basePath = 'files/img/photo/';
const branch = 'main';

const galleryContainer = document.getElementById('gallery');
const breadcrumbContainer = document.getElementById('breadcrumb');
const errorMessage = document.getElementById('error-message');

let currentFolder = '';
let currentIndex = 0;
let currentImages = [];
let lightbox, lightboxImg;
let cachedTree = null; // Cached tree structure to prevent multiple API calls

// Fetch the recursive file tree from GitHub and handle errors
async function fetchGitHubTree() {
    if (cachedTree) {
        return cachedTree; // Use cached tree if available
    }

    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    try {
        const response = await fetch(treeUrl);
        if (!response.ok) throw new Error('Failed to fetch recursive tree');
        const data = await response.json();
        cachedTree = data.tree; // Cache the tree for future use
        return cachedTree;
    } catch (error) {
        showError(`Error fetching data: ${error.message}`);
        return null;
    }
}

// Create a breadcrumb navigation dynamically
function createBreadcrumbs(folderPath) {
    breadcrumbContainer.innerHTML = ''; // Clear previous breadcrumbs

    // Add a "Home" link to go back to the top level
    const homeLink = document.createElement('a');
    homeLink.href = '#';
    homeLink.textContent = 'Home';
    breadcrumbContainer.appendChild(homeLink);

    const parts = folderPath.replace(basePath, '').split('/').filter(Boolean);
    let accumulatedPath = '';

    parts.forEach((part, index) => {
        accumulatedPath += (accumulatedPath ? '/' : '') + part;

        const breadcrumbLink = document.createElement('a');
        breadcrumbLink.href = `#${encodeURIComponent(accumulatedPath)}`;
        breadcrumbLink.textContent = part;

        breadcrumbContainer.appendChild(breadcrumbLink);

        // Add separator (if not the last item)
        if (index < parts.length - 1) {
            const separator = document.createElement('span');
            separator.textContent = '/';
            separator.className = 'separator';
            breadcrumbContainer.appendChild(separator);
        }
    });
}

// Display error messages
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

// Create a gallery item (folder or image)
function createGalleryItem(className, imageUrl, onClick, titleText = null) {
    const div = document.createElement('div');
    div.className = className;
    div.onclick = onClick;

    // Since we're dealing with .jxl images, we'll use a canvas to display them after decoding
    const canvas = document.createElement('canvas');
    canvas.className = 'gallery-image';
    div.appendChild(canvas);

    // Decode the .jxl image using the WASM module
    decodeJXL(imageUrl, canvas);

    // Add title text (for folders)
    if (titleText) {
        const titleDiv = document.createElement('div');
        titleDiv.className = 'title';
        titleDiv.textContent = titleText;
        div.appendChild(titleDiv);
    }

    return div;
}

// Decode .jxl images and draw them on a canvas
function decodeJXL(imageUrl, canvas) {
    // Assume `decodeJXLImage` is a function provided by your WASM module
    fetch(imageUrl)
        .then(response => response.arrayBuffer())
        .then(buffer => decodeJXLImage(buffer)) // This function should return an ImageData object
        .then(imageData => {
            const ctx = canvas.getContext('2d');
            canvas.width = imageData.width;
            canvas.height = imageData.height;
            ctx.putImageData(imageData, 0, 0);
        })
        .catch(error => {
            console.error('Error decoding JXL image:', error);
        });
}

// Show top-level folders when the page loads or root directory is accessed
async function showTopLevelFolders() {
    clearGallery();
    const tree = await fetchGitHubTree();
    if (!tree) return;

    const topLevelFolders = tree.filter(item =>
        item.type === 'tree' &&
        item.path.startsWith(basePath) &&
        item.path.split('/').length === 4
    );

    topLevelFolders.forEach(folder => {
        const folderName = folder.path.replace(basePath, '');
        const imageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${folder.path}/preview.jxl`;
        const folderDiv = createGalleryItem(
            'folder',
            imageUrl,
            () => showFolderContents(folder.path),
            folderName
        );
        galleryContainer.appendChild(folderDiv);
    });

    createBreadcrumbs(basePath); // Initialize with "Home" breadcrumb for the base path
}

// Show folders and images within a specific directory
async function showFolderContents(folderPath) {
    clearGallery();
    currentFolder = folderPath;
    currentImages = []; // Reset currentImages for the new folder
    const tree = await fetchGitHubTree();
    if (!tree) return;

    createBreadcrumbs(folderPath);

    const folderContents = tree.filter(item => {
        const relativePath = item.path.replace(`${folderPath}/`, '');
        return item.path.startsWith(folderPath) && !relativePath.includes('/');
    });

    folderContents.forEach(item => {
        if (item.type === 'tree') {
            const folderName = item.path.replace(`${folderPath}/`, '');
            const imageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}/preview.jxl`;
            const folderDiv = createGalleryItem(
                'folder',
                imageUrl,
                () => showFolderContents(item.path),
                folderName
            );
            galleryContainer.appendChild(folderDiv);
        } else if (item.type === 'blob' && item.path.endsWith('.jxl')) {
            currentImages.push(item.path);
            const imageIndex = currentImages.length - 1;
            const imageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`;
            const photoDiv = createGalleryItem(
                'photo',
                imageUrl,
                () => openLightbox(imageIndex)
            );
            galleryContainer.appendChild(photoDiv);
        }
    });
}

// Clear gallery content and hide errors
function clearGallery() {
    galleryContainer.innerHTML = '';
    errorMessage.style.display = 'none';
}

// Open the lightbox for a specific image
function openLightbox(index) {
    currentIndex = index;
    createNewLightbox();
    loadImage(currentIndex);
    lightbox.style.display = 'flex';
}

// Create the new lightbox
function createNewLightbox() {
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'lightbox';
        lightbox.className = 'lightbox';
        document.body.appendChild(lightbox);

        // Since we're dealing with .jxl images, we'll use a canvas
        lightboxImg = document.createElement('canvas');
        lightboxImg.id = 'lightbox-img';
        lightboxImg.className = 'lightbox-img';
        lightbox.appendChild(lightboxImg);

        // Create Previous and Next navigation buttons
        createNavButton('prev', '&#10094;', -1);
        createNavButton('next', '&#10095;', 1);

        // Close lightbox on click outside of image
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) closeLightbox();
        });
    }
}

// Load image into the lightbox based on the current index
function loadImage(index) {
    const selectedImage = currentImages[index];
    const imageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${selectedImage}`;
    decodeJXL(imageUrl, lightboxImg);
}

// Create navigation buttons for the lightbox
function createNavButton(id, content, direction) {
    const btn = document.createElement('span');
    btn.id = id;
    btn.className = 'nav';
    btn.innerHTML = content;
    btn.onclick = (e) => {
        e.stopPropagation(); // Prevent closing the lightbox when clicking the nav button
        navigate(direction);
    };
    lightbox.appendChild(btn);
}

// Navigate between images in the lightbox
function navigate(direction) {
    currentIndex = (currentIndex + direction + currentImages.length) % currentImages.length;
    loadImage(currentIndex);
}

// Close the lightbox
function closeLightbox() {
    lightbox.style.display = 'none';
}

// Handle fragment-based navigation (e.g., #nature/insects)
function navigateToHash() {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) {
        const folderPath = `${basePath}${hash}/`;
        showFolderContents(folderPath);
    } else {
        showTopLevelFolders();
    }
}

// Initialize page with fragment navigation
window.addEventListener('hashchange', navigateToHash); // Respond to hash changes
navigateToHash(); // On initial page load, navigate based on hash
