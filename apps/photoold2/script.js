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
    div.onclick = onClick;

    if (className === 'folder') {
        // Create animated folder structure
        const titleDiv = document.createElement('div');
        titleDiv.className = 'title';
        titleDiv.textContent = titleText;
        div.appendChild(titleDiv);

        // Create paper elements with classes 'one', 'two', 'three'
        const paperClasses = ['one', 'two', 'three'];
        for (let i = 0; i < 3; i++) {
            const paperDiv = document.createElement('div');
            paperDiv.className = `paper ${paperClasses[i]}`;
            div.appendChild(paperDiv);
        }
    } else {
        // For images
        div.style.backgroundImage = `url('${imageUrl}')`;
        observeBackgroundImageChange(div);
    }

    return div;
}

// Adjust div size based on background image's aspect ratio
function observeBackgroundImageChange(targetElement) {
    const observer = new MutationObserver(() => {
        const bgImage = targetElement.style.backgroundImage;
        if (bgImage && bgImage.startsWith('url(')) {
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
    for (const folder of folders) {
        const folderName = folder.path.replace(basePath, '');
        const folderDiv = createDivElement({
            className: 'folder',
            onClick: () => showFolderContents(folder.path),
            titleText: folderName,
        });

        // Append the folder to the gallery first
        galleryContainer.appendChild(folderDiv);

        // Populate the folder with images
        const images = await getFirstThreeImages(folder.path);
        populateFolderImages(folderDiv, images);
    }

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
    for (const treeItem of items) {
        const relativeName = treeItem.path.replace(`${folderPath}/`, '');
        if (treeItem.type === 'tree') {
            const folderDiv = createDivElement({
                className: 'folder',
                onClick: () => showFolderContents(treeItem.path),
                titleText: relativeName,
            });

            // Append the folder to the gallery first
            galleryContainer.appendChild(folderDiv);

            // Populate the folder with images
            const images = await getFirstThreeImages(treeItem.path);
            populateFolderImages(folderDiv, images);
        } else if (treeItem.type === 'blob' && treeItem.path.endsWith('.jxl')) {
            currentImages.push(treeItem.path);
            const imageIndex = currentImages.length - 1;
            const imageUrl = getGitHubRawUrl(treeItem.path);
            const photoDiv = createDivElement({
                className: 'photo',
                imageUrl,
                onClick: () => openLightbox(imageIndex),
            });
            galleryContainer.appendChild(photoDiv);
        }
    }
}

// Get filtered items from the tree
function getFilteredItems(tree, path, type) {
    return tree.filter((treeItem) => {
        const relativePath = treeItem.path.substring(path.length);
        const isDirectChild = relativePath.indexOf('/') === -1 || relativePath === '';
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
        const relativePath = treeItem.path.substring(folderPath.length + 1);
        return (
            treeItem.path.startsWith(folderPath + '/') &&
            !relativePath.includes('/')
        );
    });
}

// Get GitHub raw URL
function getGitHubRawUrl(path) {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

// Simplified getFirstThreeImages function
async function getFirstThreeImages(folderPath) {
    const tree = await fetchGitHubTree();
    if (!tree) return [];

    const images = tree
        .filter((treeItem) =>
            treeItem.type === 'blob' &&
            treeItem.path.endsWith('.jxl') &&
            treeItem.path.startsWith(folderPath + '/')
        )
        .map((treeItem) => getGitHubRawUrl(treeItem.path))
        .slice(0, 3);

    return images;
}

// Populate the folder with images
function populateFolderImages(folderDiv, imageUrls) {
    const papersNodeList = folderDiv.querySelectorAll('.paper');
    const papers = Array.from(papersNodeList); // Convert NodeList to Array

    papers.forEach((paper, index) => {
        if (imageUrls[index]) {
            const url = imageUrls[index];
            // Set background image and call observeBackgroundImageChange
            paper.style.backgroundImage = `url('${url}')`;
            observeBackgroundImageChange(paper);
        } else {
            // If no image, do not set background image (solid color paper)
        }
    });

    // Make the folder visible
    // If you hid the folder initially, you can set visibility here
    // folderDiv.style.visibility = 'visible';
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
