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

// Create a div for either folders or images
function createDivElement({ className, imageUrl, onClick, titleText = null }) {
    const div = document.createElement('div');
    div.className = className;
    div.style.backgroundImage = `url('${imageUrl}')`;
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
                targetElement.style.width = `${120 * aspectRatio}px`;
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

    const folders = getFilteredItems(tree, basePath, 'tree');
    folders.forEach((folder) => {
        const folderName = folder.path.replace(basePath, '');
        const imageUrl = getRandomImageUrl(folder.path);
        const folderDiv = createDivElement({
            className: 'folder',
            imageUrl,
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
    items.forEach((treeItem) => {
        const relativeName = treeItem.path.replace(`${folderPath}/`, '');
        if (treeItem.type === 'tree') {
            renderGalleryItem({
                type: 'folder',
                path: treeItem.path,
                name: relativeName,
                onClick: () => showFolderContents(treeItem.path),
            });
        } else if (treeItem.type === 'blob' && treeItem.path.endsWith('.jxl')) {
            currentImages.push(treeItem.path);
            const imageIndex = currentImages.length - 1;
            renderGalleryItem({
                type: 'photo',
                path: treeItem.path,
                onClick: () => openLightbox(imageIndex),
            });
        }
    });
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

// Get a random image URL from a folder
function getRandomImageUrl(folderPath) {
    const tree = cachedTree.filter(item => {
        const relativePath = item.path.replace(`${folderPath}/`, '');
        return item.path.startsWith(folderPath) && item.path.endsWith('.jxl') && !relativePath.includes('/');
    });
    if (tree.length > 0) {
        const randomIndex = Math.floor(Math.random() * tree.length);
        return getGitHubRawUrl(tree[randomIndex].path);
    }
}

// Render gallery item (folder or photo)
function renderGalleryItem({ type, path, name, onClick }) {
    const className = type === 'folder' ? 'folder' : 'photo';
    const imageUrl = type === 'folder' ? getRandomImageUrl(path) : getGitHubRawUrl(path);
    const div = createDivElement({
        className,
        imageUrl,
        onClick,
        titleText: type === 'folder' ? name : null,
    });
    galleryContainer.appendChild(div);
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
function handleTouchStart(e) {
    const touchStartX = e.changedTouches[0].screenX;
    lightbox.dataset.touchStartX = touchStartX;
}

function handleTouchEnd(e) {
    const touchEndX = e.changedTouches[0].screenX;
    const touchStartX = parseFloat(lightbox.dataset.touchStartX);
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

    createNavButton('prev', '&#10094;');
    createNavButton('next', '&#10095;');

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

// Create navigation buttons for the lightbox
function createNavButton(id, content) {
    const btn = document.createElement('span');
    btn.id = id;
    btn.className = 'nav';
    btn.innerHTML = content;
    btn.onclick = navigateLightbox;
    lightbox.appendChild(btn);
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
