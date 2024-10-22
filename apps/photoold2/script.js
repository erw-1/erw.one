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
    if (cachedTree) {
        return cachedTree;
    }

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

    const homeLink = document.createElement('a');
    homeLink.href = '#';
    homeLink.textContent = 'Home';
    homeLink.onclick = (event) => {
        event.preventDefault();
        showTopLevelFolders();
    };
    breadcrumbContainer.appendChild(homeLink);

    const parts = folderPath.replace(basePath, '').split('/').filter(Boolean);
    let accumulatedParts = [];

    if (parts.length > 0) {
        const separator = document.createElement('span');
        separator.textContent = '/';
        separator.className = 'separator';
        breadcrumbContainer.appendChild(separator);
    }

    parts.forEach((part, index) => {
        accumulatedParts.push(part);
        const accumulatedPath = `${basePath}${accumulatedParts.join('/')}`;

        const breadcrumbLink = document.createElement('a');
        breadcrumbLink.href = '#';
        breadcrumbLink.textContent = part;
        breadcrumbLink.onclick = (event) => {
            event.preventDefault();
            showFolderContents(accumulatedPath);
        };

        breadcrumbContainer.appendChild(breadcrumbLink);

        if (index < parts.length - 1) {
            const separator = document.createElement('span');
            separator.textContent = '/';
            separator.className = 'separator';
            breadcrumbContainer.appendChild(separator);
        }
    });
}

// Create a div for either folders or images
function createDivElement(className, backgroundImage, onClick, titleText = null) {
    const div = document.createElement('div');
    div.className = className;
    div.style.backgroundImage = backgroundImage;
    div.onclick = onClick;

    // Add title text (for folders)
    if (titleText) {
        const titleDiv = document.createElement('div');
        titleDiv.className = 'title';
        titleDiv.textContent = titleText;
        div.appendChild(titleDiv);
    }

    return div;
}

// Show top-level folders when the page loads or root directory is accessed
async function showTopLevelFolders() {
    clearGallery();
    const tree = await fetchGitHubTree();
    if (!tree) return;

    const topLevelFolders = tree.filter((item) => {
        const relativePath = item.path.replace(`${basePath}`, '');
        return (
            item.type === 'tree' &&
            item.path.startsWith(basePath) &&
            relativePath.indexOf('/') === -1
        );
    });

    topLevelFolders.forEach((folder) => {
        const folderName = folder.path.replace(basePath, '');
        const backgroundImage = `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${folder.path}/preview.jpg')`;

        const folderDiv = createDivElement(
            'folder',
            backgroundImage,
            () => showFolderContents(folder.path),
            folderName
        );
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

    const folderContents = tree.filter((item) => {
        const relativePath = item.path.replace(`${folderPath}/`, '');
        return (
            item.path.startsWith(folderPath) &&
            relativePath.indexOf('/') === -1
        );
    });

    folderContents.forEach((item) => {
        if (item.type === 'tree') {
            const folderName = item.path.replace(`${folderPath}/`, '');
            const backgroundImage = `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}/preview.jpg')`;

            const folderDiv = createDivElement(
                'folder',
                backgroundImage,
                () => showFolderContents(item.path),
                folderName
            );
            galleryContainer.appendChild(folderDiv);
        } else if (
            item.type === 'blob' &&
            (item.path.endsWith('.jpg') ||
                item.path.endsWith('.png') ||
                item.path.endsWith('.webp'))
        ) {
            currentImages.push(item.path);
            const imageIndex = currentImages.length - 1;
            const backgroundImage = `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}')`;

            const photoDiv = createDivElement(
                'photo',
                backgroundImage,
                () => openLightbox(imageIndex)
            );
            galleryContainer.appendChild(photoDiv);
        }
    });
}

// Open the lightbox for a specific image
function openLightbox(index) {
    currentIndex = index;
    createNewLightbox();
    loadImage(currentIndex);
    lightbox.style.display = 'flex';

    // Add keyboard event listener when lightbox is open
    keydownHandler = handleKeyDown;
    document.addEventListener('keydown', keydownHandler);

    // Add touch event listeners for swipe gestures
    lightbox.addEventListener('touchstart', handleTouchStart, false);
    lightbox.addEventListener('touchend', handleTouchEnd, false);
}

// Close the lightbox
function closeLightbox() {
    lightbox.style.display = 'none';

    // Remove keyboard event listener when lightbox is closed
    document.removeEventListener('keydown', keydownHandler);

    // Remove touch event listeners
    lightbox.removeEventListener('touchstart', handleTouchStart, false);
    lightbox.removeEventListener('touchend', handleTouchEnd, false);
}

// Handle keyboard navigation
function handleKeyDown(e) {
    if (e.key === 'ArrowLeft') {
        // Navigate to previous image
        navigate(-1);
    } else if (e.key === 'ArrowRight') {
        // Navigate to next image
        navigate(1);
    } else if (e.key === 'Escape') {
        // Close the lightbox
        closeLightbox();
    }
}

// Handle touch start
function handleTouchStart(e) {
    touchStartX = e.changedTouches[0].screenX;
}

// Handle touch end
function handleTouchEnd(e) {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipeGesture();
}

// Determine swipe direction and navigate
function handleSwipeGesture() {
    const swipeThreshold = 50; // Minimum distance for a swipe action

    if (touchEndX < touchStartX - swipeThreshold) {
        // Swipe left to navigate to the next image
        navigate(1);
    } else if (touchEndX > touchStartX + swipeThreshold) {
        // Swipe right to navigate to the previous image
        navigate(-1);
    }
}

// Create the lightbox
function createNewLightbox() {
    if (!lightbox) {
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
