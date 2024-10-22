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

// Modified createDivElement with lazy loading
function createDivElement(className, backgroundImageUrl, onClick, titleText = null) {
    const div = document.createElement('div');
    div.className = className;
    div.onclick = onClick;

    // Add title text (for folders or images)
    if (titleText) {
        const titleDiv = document.createElement('div');
        titleDiv.className = 'title';
        titleDiv.textContent = titleText;
        div.appendChild(titleDiv);
    }

    // Lazy loading using Intersection Observer
    const observer = new IntersectionObserver(
        (entries, observer) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    div.style.backgroundImage = `url('${backgroundImageUrl}')`;
                    observeBackgroundImageChange(div);
                    observer.unobserve(div); // Stop observing once loaded
                }
            });
        },
        {
            root: null, // Use the viewport as the root
            rootMargin: '0px',
            threshold: 0.1, // Trigger when 10% of the element is visible
        }
    );
    observer.observe(div);

    return div;
}

// Adjust div size based on background image's aspect ratio
function observeBackgroundImageChange(targetElement) {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
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
            }
        });
    });
    observer.observe(targetElement, { attributes: true });
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
        const backgroundImage = `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${folder.path}/preview.jxl')`;

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
            const backgroundImage = `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}/preview.jxl')`;

            const folderDiv = createDivElement(
                'folder',
                backgroundImage,
                () => showFolderContents(item.path),
                folderName
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
    });
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

// Modified loadImage function with preloading
function loadImage(index) {
    const selectedImage = currentImages[index];
    const imageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${selectedImage}`;
    lightboxImg.src = imageUrl;

    // Preload next and previous images
    preloadAdjacentImages(index);
}

function preloadAdjacentImages(index) {
    // Preload next image
    const nextIndex = (index + 1) % currentImages.length;
    const nextImage = currentImages[nextIndex];
    const nextImageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${nextImage}`;
    const imgNext = new Image();
    imgNext.src = nextImageUrl;

    // Preload previous image
    const prevIndex = (index - 1 + currentImages.length) % currentImages.length;
    const prevImage = currentImages[prevIndex];
    const prevImageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${prevImage}`;
    const imgPrev = new Image();
    imgPrev.src = prevImageUrl;
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
