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

// Fetch contents from GitHub's recursive tree API and handle errors
async function fetchGitHubTree() {
    if (cachedTree) {
        return cachedTree; // Return cached tree if it exists
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

// Show error message
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

// Create a div with a background image and event handler
function createDivElement(className, backgroundImage, onClick, titleText = null) {
    const div = document.createElement('div');
    div.className = className;
    div.style.backgroundImage = backgroundImage;
    div.onclick = onClick;

    // Optionally add a title element
    if (titleText) {
        const titleDiv = document.createElement('div');
        titleDiv.className = 'title';
        titleDiv.textContent = titleText;
        div.appendChild(titleDiv);
    }

    observeBackgroundImageChange(div);
    return div;
}

// Observe background image change to adjust the size
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

// Display folders in the gallery
async function showFolders() {
    clearGallery();
    const tree = await fetchGitHubTree();
    if (!tree) return;

    // Filter only the directories from the tree
    const folders = tree.filter(item => item.type === 'tree' && item.path.startsWith(basePath));

    folders.forEach(folder => {
        const folderName = folder.path.replace(basePath, ''); // Extract folder name
        const folderDiv = createDivElement(
            'folder',
            `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${folder.path}/preview.jxl')`,
            () => showPhotos(folder.path),
            folderName.split('/').pop() // Display only the last part of the path as the folder name
        );
        galleryContainer.appendChild(folderDiv);
    });

    backButton.style.display = 'none';
}

// Display photos inside a folder
async function showPhotos(folderPath) {
    clearGallery();
    currentFolder = folderPath;
    const tree = await fetchGitHubTree();
    if (!tree) return;

    // Filter the files in the current folder
    const files = tree.filter(item => item.type === 'blob' && item.path.startsWith(folderPath) && item.path.endsWith('.jxl'));

    currentImages = files.map(file => file.path);
    currentImages.forEach((imagePath, index) => {
        const photoDiv = createDivElement(
            'photo',
            `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${imagePath}')`,
            () => openLightbox(index)
        );
        galleryContainer.appendChild(photoDiv);
    });

    backButton.style.display = 'block';
}

// Clear the gallery container and hide the error message
function clearGallery() {
    galleryContainer.innerHTML = '';
    errorMessage.style.display = 'none';
}

// Create and display lightbox
function openLightbox(index) {
    currentIndex = index;
    const selectedImage = galleryContainer.querySelectorAll('.photo')[index];
    if (!lightbox) createLightbox();
    updateLightbox(selectedImage.style.backgroundImage);
    lightbox.style.display = 'flex';
}

// Create lightbox if it doesn't exist
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

// Helper function to create navigation buttons
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

// Update lightbox with new image
function updateLightbox(imageUrl) {
    lightboxImg.style.backgroundImage = imageUrl;
}

// Close lightbox
function closeLightbox() {
    if (lightbox) lightbox.style.display = 'none';
}

// Navigate through lightbox images
function navigate(direction) {
    currentIndex = (currentIndex + direction + currentImages.length) % currentImages.length;
    const selectedImage = galleryContainer.querySelectorAll('.photo')[currentIndex];
    updateLightbox(selectedImage.style.backgroundImage);
}

// Return to folder view
function goBack() {
    showFolders();
}

backButton.onclick = goBack;
showFolders();
