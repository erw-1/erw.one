// Configuration variables
const owner = 'erw-1';
const repo = 'erw.one';
const basePath = 'files/img/photo/';
const branch = 'main';

// DOM elements
const galleryContainer = document.getElementById('gallery');
const breadcrumbContainer = document.getElementById('breadcrumb');
const errorMessage = document.getElementById('error-message');

// State variables
let currentFolder = '';
let currentIndex = 0;
let currentImages = [];
let lightbox, lightboxImg;
let cachedTree = null; // Cached tree structure to prevent multiple API calls

// Variables for event handlers
let keydownHandler;
let touchStartX = 0;
let touchEndX = 0;

// Fetch the recursive file tree from GitHub and handle errors
async function fetchGitHubTree() {
    if (cachedTree) return cachedTree;

    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    try {
        const response = await fetch(treeUrl, {
            headers: { 'Accept': 'application/vnd.github.v3+json' },
        });
        if (!response.ok) throw new Error('Failed to fetch recursive tree');
        const data = await response.json();
        cachedTree = data.tree;
        return cachedTree;
    } catch (error) {
        showError('Rate limit exceeded or API error');
        return null;
    }
}

// Display error messages
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

// Clear gallery content and hide errors
function clearGallery() {
    galleryContainer.innerHTML = '';
    errorMessage.style.display = 'none';
}

// Create a breadcrumb navigation dynamically
function createBreadcrumbs(folderPath) {
    breadcrumbContainer.innerHTML = '';

    const homeLink = createLink('Home', '#', (event) => {
        event.preventDefault();
        showTopLevelFolders();
    });
    breadcrumbContainer.appendChild(homeLink);

    const parts = folderPath.replace(basePath, '').split('/').filter(Boolean);
    let accumulatedParts = [];

    parts.forEach((part, index) => {
        accumulatedParts.push(part);
        const accumulatedPath = `${basePath}${accumulatedParts.join('/')}`;

        breadcrumbContainer.appendChild(createSeparator());
        const breadcrumbLink = createLink(part, '#', (event) => {
            event.preventDefault();
            showFolderContents(accumulatedPath);
        });
        breadcrumbContainer.appendChild(breadcrumbLink);
    });
}

// Create a separator for breadcrumbs
function createSeparator() {
    const separator = document.createElement('span');
    separator.textContent = '/';
    separator.className = 'separator';
    return separator;
}

// Create a link element
function createLink(text, href, onClick) {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = text;
    link.onclick = onClick;
    return link;
}

// Create a div for either folders or images, with a background and an event handler
function createDivElement({ className, backgroundImage, onClick, titleText = null }) {
    const div = document.createElement('div');
    div.className = className;
    div.style.backgroundImage = backgroundImage;
    div.onclick = onClick;

    if (titleText) {
        const titleDiv = document.createElement('div');
        titleDiv.className = 'title';
        titleDiv.textContent = titleText;
        div.appendChild(titleDiv);
    }

    observeBackgroundImageChange(div);
    return div;
}

// Adjust div size based on background image's aspect ratio
function observeBackgroundImageChange(targetElement) {
    const observer = new MutationObserver(() => {
        const bgImage = targetElement.style.backgroundImage;
        if (bgImage && bgImage.startsWith('url("')) {
            const imageUrl = bgImage.slice(5, -2);
            const img = new Image();
            img.src = imageUrl;
            img.onload = () => {
                const aspectRatio = img.naturalWidth / img.naturalHeight;
                targetElement.style.width = `${200 * aspectRatio}px`;
                targetElement.style.height = 'auto';
            };
        }
    });
    observer.observe(targetElement, { attributes: true });
}

// Show top-level folders when the page loads or root directory is accessed
async function showTopLevelFolders() {
    clearGallery();
    const tree = await fetchGitHubTree();
    if (!tree) return;

    const folders = getFilteredItems(tree, basePath, 'tree', false);
    folders.forEach((folder) => {
        const folderName = folder.path.replace(basePath, '');
        const backgroundImage = getBackgroundImage(folder.path, 'preview.jxl');
        const folderDiv = createDivElement({
            className: 'folder',
            backgroundImage,
            onClick: () => showFolderContents(folder.path),
            titleText: folderName,
        });
        galleryContainer.appendChild(folderDiv);
    });

    createBreadcrumbs(basePath);
}

// Show folders and images within a specific directory
async function showFolderContents(folderPath) {
    clearGallery();
    currentFolder = folderPath;
    currentImages = [];
    const tree = await fetchGitHubTree();
    if (!tree) return;

    createBreadcrumbs(folderPath);

    const items = getFolderContents(tree, folderPath);
    items.forEach((item) => {
        const relativeName = item.path.replace(`${folderPath}/`, '');
        if (item.type === 'tree') {
            const backgroundImage = getBackgroundImage(item.path, 'preview.jxl');
            const folderDiv = createDivElement({
                className: 'folder',
                backgroundImage,
                onClick: () => showFolderContents(item.path),
                titleText: relativeName,
            });
            galleryContainer.appendChild(folderDiv);
        } else if (item.type === 'blob' && item.path.endsWith('.jxl')) {
            currentImages.push(item.path);
            const imageIndex = currentImages.length - 1;
            const backgroundImage = `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}')`;
            const photoDiv = createDivElement({
                className: 'photo',
                backgroundImage,
                onClick: () => openLightbox(imageIndex),
            });
            galleryContainer.appendChild(photoDiv);
        }
    });
}

// Get filtered items from the tree
function getFilteredItems(tree, path, type, includeSubfolders) {
    return tree.filter((item) => {
        const relativePath = item.path.replace(`${path}`, '');
        const isDirectChild = relativePath.indexOf('/') === -1;
        return (
            item.type === type &&
            item.path.startsWith(path) &&
            (includeSubfolders || isDirectChild)
        );
    });
}

// Get contents of a folder
function getFolderContents(tree, folderPath) {
    return tree.filter((item) => {
        const relativePath = item.path.replace(`${folderPath}/`, '');
        return (
            item.path.startsWith(folderPath) &&
            relativePath.indexOf('/') === -1
        );
    });
}

// Get background image URL
function getBackgroundImage(path, imageName) {
    return `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}/${imageName}')`;
}

// Open the lightbox for a specific image
function openLightbox(index) {
    currentIndex = index;
    createLightbox();
    loadImage(currentIndex);
    lightbox.style.display = 'flex';

    // Add event listeners
    document.addEventListener('keydown', handleKeyDown);
    lightbox.addEventListener('touchstart', handleTouchStart, false);
    lightbox.addEventListener('touchend', handleTouchEnd, false);
}

// Close the lightbox
function closeLightbox() {
    lightbox.style.display = 'none';

    // Remove event listeners
    document.removeEventListener('keydown', handleKeyDown);
    lightbox.removeEventListener('touchstart', handleTouchStart, false);
    lightbox.removeEventListener('touchend', handleTouchEnd, false);
}

// Handle keyboard navigation
function handleKeyDown(e) {
    if (e.key === 'ArrowLeft') navigate(-1);
    else if (e.key === 'ArrowRight') navigate(1);
    else if (e.key === 'Escape') closeLightbox();
}

// Handle touch events
function handleTouchStart(e) {
    touchStartX = e.changedTouches[0].screenX;
}

function handleTouchEnd(e) {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipeGesture();
}

// Determine swipe direction and navigate
function handleSwipeGesture() {
    const swipeThreshold = 50; // Minimum distance for a swipe action
    if (touchEndX < touchStartX - swipeThreshold) navigate(1);
    else if (touchEndX > touchStartX + swipeThreshold) navigate(-1);
}

// Create the lightbox
function createLightbox() {
    if (lightbox) return;

    lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    lightbox.className = 'lightbox';
    document.body.appendChild(lightbox);

    lightboxImg = document.createElement('img');
    lightboxImg.id = 'lightbox-img';
    lightboxImg.className = 'lightbox-img';
    lightbox.appendChild(lightboxImg);

    createNavButton('prev', '&#10094;', -1);
    createNavButton('next', '&#10095;', 1);

    // Close lightbox when clicking outside the image
    lightbox.onclick = (e) => {
        if (e.target === lightbox) closeLightbox();
    };
}

// Load image into the lightbox based on the current index
function loadImage(index) {
    const selectedImage = currentImages[index];
    const imageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${selectedImage}`;
    lightboxImg.src = imageUrl;
}

// Create navigation buttons for the lightbox
function createNavButton(id, content, direction) {
    const btn = document.createElement('span');
    btn.id = id;
    btn.className = 'nav';
    btn.innerHTML = content;
    btn.onclick = (e) => {
        e.stopPropagation();
        navigate(direction);
    };
    lightbox.appendChild(btn);
}

// Navigate between images in the lightbox
function navigate(direction) {
    currentIndex = (currentIndex + direction + currentImages.length) % currentImages.length;
    loadImage(currentIndex);
}

// Initialize the gallery on page load
showTopLevelFolders();
