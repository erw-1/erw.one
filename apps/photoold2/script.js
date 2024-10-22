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

    const folders = getFilteredItems(tree, basePath, 'tree');
    folders.forEach((folder) => {
        const folderName = folder.path.replace(basePath, '');
        const folderDiv = createFolderPreview(folder.path, folderName);
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

// Create folder preview with three sampled images
function createFolderPreview(folderPath, folderName) {
    const div = document.createElement('div');
    div.className = 'folder';
    const titleDiv = document.createElement('div');
    titleDiv.className = 'title';
    titleDiv.textContent = folderName;
    div.appendChild(titleDiv);

    const tree = cachedTree || [];
    const folderItems = getFolderContents(tree, folderPath).filter(item => item.path.endsWith('.jxl')).slice(0, 3);
    
    folderItems.forEach((imageItem, index) => {
        const imageUrl = getGitHubRawUrl(imageItem.path);
        const previewDiv = document.createElement('div');
        previewDiv.className = `folder-preview ${['one', 'two', 'three'][index]}`;
        previewDiv.style.backgroundImage = `url('${imageUrl}')`;
        div.appendChild(previewDiv);
    });

    div.onclick = () => showFolderContents(folderPath);
    observeBackgroundImageChange(div);
    return div;
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

// Render gallery item (folder or photo)
function renderGalleryItem({ type, path, name, onClick }) {
    const className = type === 'folder' ? 'folder' : 'photo';
    const imageUrl = type === 'folder' ? '' : getGitHubRawUrl(path);
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

// Initialize the gallery on page load
showTopLevelFolders();
