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

// Create a div for images, with a background and an event handler
function createDivElement(className, backgroundImage, onClick, titleText = null) {
    const div = document.createElement('div');
    div.className = className;
    div.style.backgroundImage = backgroundImage;
    div.onclick = onClick;

    // Add title text (for images)
    if (titleText) {
        const titleDiv = document.createElement('div');
        titleDiv.className = 'title';
        titleDiv.textContent = titleText;
        div.appendChild(titleDiv);
    }

    // Observe background image change to adjust size if necessary
    return div;
}

// Create folder element with sampled images
function createFolderElement(folderName, images, onClick) {
    const folderDiv = document.createElement('div');
    folderDiv.className = 'folder';
    folderDiv.onclick = onClick;

    // Folder shape
    const folderShape = document.createElement('div');
    folderShape.className = 'folder-shape';

    // Images inside the folder
    images.forEach((imageItem, index) => {
        const imagePath = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${imageItem.path}`;
        const backgroundImage = `url('${imagePath}')`;
        const imageDiv = createDivElement(
            `folder-image image-${index}`,
            backgroundImage,
            null // No onclick
        );
        folderShape.appendChild(imageDiv);
    });

    folderDiv.appendChild(folderShape);

    // Add folder name
    const titleDiv = document.createElement('div');
    titleDiv.className = 'title';
    titleDiv.textContent = folderName;
    folderDiv.appendChild(titleDiv);

    return folderDiv;
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

    for (const folder of topLevelFolders) {
        const folderName = folder.path.replace(basePath, '');

        // Get all images in the folder (including subfolders if desired)
        const imagesInFolder = tree.filter((item) => {
            return (
                item.type === 'blob' &&
                item.path.startsWith(folder.path) &&
                item.path.endsWith('.jxl')
            );
        });

        // Sample up to 3 random images
        const sampledImages = [];
        const imagesCopy = [...imagesInFolder];
        const numImages = Math.min(3, imagesCopy.length);
        for (let i = 0; i < numImages; i++) {
            const randomIndex = Math.floor(Math.random() * imagesCopy.length);
            sampledImages.push(imagesCopy.splice(randomIndex, 1)[0]);
        }

        const folderDiv = createFolderElement(
            folderName,
            sampledImages,
            () => showFolderContents(folder.path)
        );
        galleryContainer.appendChild(folderDiv);
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

    const folderContents = tree.filter((item) => {
        const relativePath = item.path.replace(`${folderPath}/`, '');
        return (
            item.path.startsWith(folderPath) &&
            relativePath.indexOf('/') === -1
        );
    });

    for (const item of folderContents) {
        if (item.type === 'tree') {
            const folderName = item.path.replace(`${folderPath}/`, '');

            // Get all images in the subfolder
            const imagesInFolder = tree.filter((subItem) => {
                return (
                    subItem.type === 'blob' &&
                    subItem.path.startsWith(item.path) &&
                    subItem.path.endsWith('.jxl')
                );
            });

            // Sample up to 3 random images
            const sampledImages = [];
            const imagesCopy = [...imagesInFolder];
            const numImages = Math.min(3, imagesCopy.length);
            for (let i = 0; i < numImages; i++) {
                const randomIndex = Math.floor(Math.random() * imagesCopy.length);
                sampledImages.push(imagesCopy.splice(randomIndex, 1)[0]);
            }

            const folderDiv = createFolderElement(
                folderName,
                sampledImages,
                () => showFolderContents(item.path)
            );
            galleryContainer.appendChild(folderDiv);
        } else if (item.type === 'blob' && item.path.endsWith('.jxl')) {
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
    }
}

// Open the lightbox for a specific image
function openLightbox(index) {
    currentIndex = index;
    createNewLightbox();
    loadImage(currentIndex);
    lightbox.style.display = 'flex';
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

// Close the lightbox
function closeLightbox() {
    lightbox.style.display = 'none';
}

// Initialize the gallery on page load
showTopLevelFolders();
