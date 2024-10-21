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
let lightbox, lightboxImg, prevBtn, nextBtn;

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
        showError('Rate limit exceeded or API error');
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
    homeLink.onclick = (event) => {
        event.preventDefault();
        window.location.hash = ''; // Clear the hash to go to the home view
        showTopLevelFolders();
    };
    breadcrumbContainer.appendChild(homeLink);

    const parts = folderPath.replace(basePath, '').split('/').filter(Boolean);
    let accumulatedPath = '';

    parts.forEach((part, index) => {
        accumulatedPath += part;

        const breadcrumbLink = document.createElement('a');
        breadcrumbLink.href = `#${accumulatedPath.replace(/\//g, '#')}`; // Use fragment for navigation
        breadcrumbLink.textContent = part;
        breadcrumbLink.onclick = (event) => {
            event.preventDefault();
            window.location.hash = breadcrumbLink.href.split('#')[1]; // Update URL hash
            navigateToHash(); // Navigate to the folder
        };

        breadcrumbContainer.appendChild(breadcrumbLink);

        // Add separator (if not the last item)
        if (index < parts.length - 1) {
            const separator = document.createElement('span');
            separator.textContent = '/';
            separator.className = 'separator';
            breadcrumbContainer.appendChild(separator);
        }

        accumulatedPath += '/';
    });
}

// Display error messages
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

// Create a div for either folders or images, with a background and an event handler
function createDivElement(className, backgroundImage, onClick, titleText = null) {
    const div = document.createElement('div');
    div.className = className;
    div.style.backgroundImage = backgroundImage;
    div.onclick = onClick;

    // Add title text (for folders or images)
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
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                const bgImage = targetElement.style.backgroundImage;
                if (bgImage && bgImage.startsWith('url("blob:')) {
                    const img = new Image();
                    img.src = bgImage.slice(5, -2);
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

    // Filter to show only top-level folders within the basePath
    const topLevelFolders = tree.filter(item => item.type === 'tree' && item.path.startsWith(basePath) && item.path.split('/').length === 4);

    topLevelFolders.forEach(folder => {
        const folderName = folder.path.replace(basePath, ''); // Extract the folder name
        const folderDiv = createDivElement(
            'folder',
            `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${folder.path}/preview.jxl')`,
            () => showFolderContents(folder.path), // Clicking navigates into the folder
            folderName // Show folder name as title
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

    // Create breadcrumbs for the current folder path
    createBreadcrumbs(folderPath);

    // Filter contents of the current folder (both subfolders and images)
    const folderContents = tree.filter(item => {
        const relativePath = item.path.replace(`${folderPath}/`, '');
        return item.path.startsWith(folderPath) && relativePath.indexOf('/') === -1;
    });

    folderContents.forEach(item => {
        if (item.type === 'tree') {
            // Handle subfolders
            const folderName = item.path.replace(`${folderPath}/`, ''); // Get the folder name
            const folderDiv = createDivElement(
                'folder',
                `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}/preview.jxl')`,
                () => showFolderContents(item.path), // Clicking navigates into the folder
                folderName // Display the folder name
            );
            galleryContainer.appendChild(folderDiv);
        } else if (item.type === 'blob' && item.path.endsWith('.jxl')) {
            // Handle images
            currentImages.push(item.path); // Add the image to the list for lightbox navigation
            const imageIndex = currentImages.length - 1; // Get the index of this image
            const photoDiv = createDivElement(
                'photo',
                `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}')`,
                () => openLightbox(imageIndex) // Use the correct image index for the lightbox
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
    const selectedImage = currentImages[currentIndex];
    if (!lightbox) createLightbox();
    updateLightbox(`url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${selectedImage}')`);
    lightbox.style.display = 'flex';
}

// Create lightbox for image viewing
function createLightbox() {
    lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    lightbox.className = 'lightbox';
    document.body.appendChild(lightbox);

    lightboxImg = document.createElement('div');
    lightboxImg.id = 'lightbox-img';
    lightboxImg.className = 'lightbox-img';
    lightbox.appendChild(lightboxImg);

    createNavButton('prev', '&#10094;', -1);
    createNavButton('next', '&#10095;', 1);

    lightbox.onclick = closeLightbox;
}

// Create navigation buttons for lightbox
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

// Update the lightbox with the current image
function updateLightbox(imageUrl) {
    lightboxImg.style.backgroundImage = imageUrl;
}

// Close the lightbox
function closeLightbox() {
    if (lightbox) lightbox.style.display = 'none';
}

// Navigate between lightbox images
function navigate(direction) {
    currentIndex = (currentIndex + direction + currentImages.length) % currentImages.length;
    const selectedImage = galleryContainer.querySelectorAll('.photo')[currentIndex];
    updateLightbox(selectedImage.style.backgroundImage);
}

// Handle fragment-based navigation (e.g., #nature#insects)
function navigateToHash() {
    const hash = window.location.hash.slice(1); // Remove the leading '#'
    if (hash) {
        const folderPath = `${basePath}${hash.replace(/#/g, '/')}/`; // Convert hash to folder path
        showFolderContents(folderPath);
    } else {
        showTopLevelFolders(); // If no hash, show the top level
    }
}

// Initialize page with fragment navigation
window.addEventListener('hashchange', navigateToHash); // Respond to hash changes
navigateToHash(); // On initial page load, navigate based on hash
