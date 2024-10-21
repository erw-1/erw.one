const owner = 'erw-1';
const repo = 'erw.one';
const basePath = 'files/img/photo/';
const branch = 'main';

const galleryContainer = document.getElementById('gallery');
const backButton = document.getElementById('back-button');
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

// Show folders and images within a specific directory
async function showFolderContents(folderPath) {
    clearGallery();
    currentFolder = folderPath;
    const tree = await fetchGitHubTree();
    if (!tree) return;

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
            const photoDiv = createDivElement(
                'photo',
                `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}')`,
                () => openLightbox(currentImages.indexOf(item.path)) // Clicking opens the image in lightbox
            );
            galleryContainer.appendChild(photoDiv);
            currentImages.push(item.path); // Add the image to the list for lightbox navigation
        }
    });

    backButton.style.display = 'block';
}

// Clear gallery content and hide errors
function clearGallery() {
    galleryContainer.innerHTML = '';
    errorMessage.style.display = 'none';
}

// Create and display lightbox for images
function openLightbox(index) {
    currentIndex = index;
    const selectedImage = galleryContainer.querySelectorAll('.photo')[index];
    if (!lightbox) createLightbox();
    updateLightbox(selectedImage.style.backgroundImage);
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

// Update lightbox with the current image
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

// Return to folder view
function goBack() {
    showFolderContents(basePath);
}

backButton.onclick = goBack;
showFolderContents(basePath); // Initialize with the root folder
