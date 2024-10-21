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

// Helper function to fetch content from GitHub
async function fetchGitHubContents(path) {
    try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
        if (response.status === 403) throw new Error('Rate limit exceeded');
        return response.json();
    } catch (error) {
        showError(error.message);
        return null;
    }
}

// Helper function to show error messages
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

// Helper function to create div elements (for folders and photos)
function createDivElement(className, backgroundImage, onClick) {
    const div = document.createElement('div');
    div.className = className;
    div.style.backgroundImage = backgroundImage;
    div.onclick = onClick;
    galleryContainer.appendChild(div);
    observeBackgroundImageChange(div); // Adjust size based on image
}

// Observe background image changes and adjust div size
function observeBackgroundImageChange(targetElement) {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                const bgImage = targetElement.style.backgroundImage;
                if (bgImage && bgImage.startsWith('url("blob:')) {
                    const img = new Image();
                    img.src = bgImage.slice(5, -2); // Extract blob URL
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

// Display folders from the GitHub repository
async function showFolders() {
    clearGallery();
    const folders = await fetchGitHubContents(basePath);
    if (!folders) return;
    folders.forEach(folder => {
        if (folder.type === 'dir') {
            createDivElement(
                'folder',
                `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${folder.path}/preview.jxl')`,
                () => showPhotos(folder.path)
            );
        }
    });
    backButton.style.display = 'none';
}

// Display photos inside a folder
async function showPhotos(folderPath) {
    currentFolder = folderPath;
    clearGallery();
    const files = await fetchGitHubContents(folderPath);
    if (!files) return;

    currentImages = files.filter(file => file.name.endsWith('.jxl'));
    currentImages.forEach((image, index) => {
        createDivElement(
            'photo',
            `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${image.path}')`,
            () => openLightbox(index)
        );
    });

    backButton.style.display = 'block';
}

// Clear the gallery container and hide the error message
function clearGallery() {
    galleryContainer.innerHTML = '';
    errorMessage.style.display = 'none';
}

// Open lightbox for viewing images
function openLightbox(index) {
    currentIndex = index;
    const selectedImage = galleryContainer.querySelectorAll('.photo')[currentIndex];
    createLightbox(selectedImage);
    updateLightbox();
    lightbox.style.display = 'flex';
}

// Create lightbox if not already created
function createLightbox(selectedImage) {
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'lightbox';
        lightbox.className = 'lightbox';
        document.body.appendChild(lightbox);

        lightboxImg = document.createElement('div');
        lightboxImg.id = 'lightbox-img';
        lightboxImg.className = 'lightbox-img';
        lightbox.appendChild(lightboxImg);

        prevBtn = createNavButton('prev', '&#10094;', -1);
        nextBtn = createNavButton('next', '&#10095;', 1);

        lightbox.onclick = closeLightbox;
    }
    lightboxImg.style.backgroundImage = selectedImage.style.backgroundImage;
}

// Helper function to create navigation buttons for the lightbox
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
    return btn;
}

// Update lightbox content with the current image
function updateLightbox() {
    const selectedImage = galleryContainer.querySelectorAll('.photo')[currentIndex];
    lightboxImg.style.backgroundImage = selectedImage.style.backgroundImage;
}

// Close lightbox
function closeLightbox() {
    if (lightbox) lightbox.style.display = 'none';
}

// Navigate through images in the lightbox
function navigate(direction) {
    currentIndex = (currentIndex + direction + currentImages.length) % currentImages.length;
    updateLightbox();
}

// Go back to the folder view
function goBack() {
    showFolders();
}

backButton.onclick = goBack;
showFolders();
