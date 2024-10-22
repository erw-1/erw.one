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

    parts.forEach((part) => {
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

// Get filtered items from the tree
function getFilteredItems(tree, path, type) {
    return tree.filter((treeItem) => {
        const relativePath = treeItem.path.replace(`${path}`, '');
        const isDirectChild = relativePath.indexOf('/') === -1;
        return (
            treeItem.type === type &&
            treeItem.path.startsWith(path) &&
            isDirectChild
        );
    });
}

// Get contents of a folder
function getFolderContents(tree, folderPath) {
    return tree.filter((treeItem) => {
        const relativePath = treeItem.path.replace(`${folderPath}/`, '');
        return (
            treeItem.path.startsWith(folderPath) &&
            relativePath.indexOf('/') === -1
        );
    });
}

// Get GitHub raw URL
function getGitHubRawUrl(path) {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

// Render gallery items using innerHTML
function renderGallery(items) {
    let html = '';

    items.forEach((item) => {
        if (item.type === 'tree') {
            // Get the first three images in the folder for previews
            const folderContents = getFolderContents(cachedTree, item.path);
            const imagesInFolder = folderContents.filter(
                (i) => i.type === 'blob' && i.path.endsWith('.jxl')
            );
            const previewImages = imagesInFolder.slice(0, 3).map((i) => getGitHubRawUrl(i.path));

            html += `
                <div class="folder" onclick="showFolderContents('${item.path}')">
                    <div class="title">${item.path.replace(basePath, '').split('/').pop()}</div>
                    <div class="folder-preview one" style="background-image: url('${previewImages[0] || ''}');"></div>
                    <div class="folder-preview two" style="background-image: url('${previewImages[1] || ''}');"></div>
                    <div class="folder-preview three" style="background-image: url('${previewImages[2] || ''}');"></div>
                </div>
            `;
        } else if (item.type === 'blob' && item.path.endsWith('.jxl')) {
            const imageUrl = getGitHubRawUrl(item.path);
            const imageIndex = currentImages.length;
            currentImages.push(item.path);
            html += `
                <div class="photo" style="background-image: url('${imageUrl}');" onclick="openLightbox(${imageIndex})"></div>
            `;
        }
    });

    galleryContainer.innerHTML = html;

    // After setting innerHTML, observe background image changes for dynamic width calculation
    observeAllBackgroundImages();
}

// Observe all background images for dynamic width calculation
function observeAllBackgroundImages() {
    const elements = galleryContainer.querySelectorAll('.photo, .folder-preview');
    elements.forEach((element) => {
        const bgImage = element.style.backgroundImage;
        if (bgImage && bgImage.startsWith('url("')) {
            const imageUrl = bgImage.slice(5, -2);
            const img = new Image();
            img.src = imageUrl;
            img.onload = () => {
                const aspectRatio = img.naturalWidth / img.naturalHeight;
                // Only adjust width for photos and folder-previews, not folders themselves
                if (element.classList.contains('photo') || element.classList.contains('folder-preview')) {
                    element.style.width = `${200 * aspectRatio}px`;
                    element.style.height = 'auto';
                }
            };
        }
    });
}

// Show top-level folders when the page loads or root directory is accessed
async function showTopLevelFolders() {
    clearGallery();
    currentImages = []; // Reset current images
    const tree = await fetchGitHubTree();
    if (!tree) return;

    const folders = getFilteredItems(tree, basePath, 'tree');
    renderGallery(folders);

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
    renderGallery(items);
}

// Open the lightbox for a specific image
function openLightbox(index) {
    currentIndex = index;
    createLightbox();
    loadImage(currentIndex);
    lightbox.style.display = 'flex';

    // Add event listeners
    document.addEventListener('keydown', handleKeyDown);
    lightbox.addEventListener('touchstart', handleTouchStart);
    lightbox.addEventListener('touchend', handleTouchEnd);
}

// Close the lightbox
function closeLightbox() {
    lightbox.style.display = 'none';

    // Remove event listeners
    document.removeEventListener('keydown', handleKeyDown);
    lightbox.removeEventListener('touchstart', handleTouchStart);
    lightbox.removeEventListener('touchend', handleTouchEnd);
}

// Handle keyboard navigation
function handleKeyDown(e) {
    if (e.key === 'ArrowLeft') navigate(-1);
    else if (e.key === 'ArrowRight') navigate(1);
    else if (e.key === 'Escape') closeLightbox();
}

// Handle touch events
let touchStartX = 0;

function handleTouchStart(e) {
    touchStartX = e.changedTouches[0].screenX;
}

function handleTouchEnd(e) {
    const touchEndX = e.changedTouches[0].screenX;
    handleSwipeGesture(touchStartX, touchEndX);
}

// Determine swipe direction and navigate
function handleSwipeGesture(touchStartX, touchEndX) {
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

    // Create navigation buttons
    lightbox.innerHTML += `
        <span id="prev" class="nav">&#10094;</span>
        <span id="next" class="nav">&#10095;</span>
    `;

    // Attach event listeners to navigation buttons
    lightbox.querySelector('#prev').addEventListener('click', navigateLightbox);
    lightbox.querySelector('#next').addEventListener('click', navigateLightbox);

    // Close lightbox when clicking outside the image
    lightbox.onclick = (e) => {
        if (e.target === lightbox) closeLightbox();
    };
}

// Load image into the lightbox based on the current index
function loadImage(index) {
    const selectedImage = currentImages[index];
    const imageUrl = getGitHubRawUrl(selectedImage);
    lightboxImg.src = imageUrl;
}

// Navigate lightbox
function navigateLightbox(e) {
    e.stopPropagation();
    const direction = e.target.id === 'next' ? 1 : -1;
    navigate(direction);
}

// Navigate between images in the lightbox
function navigate(direction) {
    currentIndex = (currentIndex + direction + currentImages.length) % currentImages.length;
    loadImage(currentIndex);
}

// Initialize the gallery on page load
showTopLevelFolders();
