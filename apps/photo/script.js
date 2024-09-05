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

async function fetchGitHubContents(path) {
    try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
        if (response.status === 403) {
            throw new Error('Rate limit exceeded');
        }
        return response.json();
    } catch (error) {
        console.error(error.message);
        errorMessage.style.display = 'block';
        return null;
    }
}

async function showFolders() {
    galleryContainer.innerHTML = '';
    errorMessage.style.display = 'none';
    const folders = await fetchGitHubContents(basePath);
    if (!folders) return;

    folders.forEach(folder => {
        if (folder.type === 'dir') {
            const folderDiv = document.createElement('div');
            folderDiv.className = 'folder';
            folderDiv.style.backgroundImage = `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${folder.path}/preview.jxl')`;
            folderDiv.innerHTML = `<div class="title">${folder.name}</div>`;
            folderDiv.onclick = () => showPhotos(folder.path);
            galleryContainer.appendChild(folderDiv);
        }
    });

    backButton.style.display = 'none';
}

// Function to watch for changes in the background-image of a div
function observeBackgroundImageChange(targetElement) {
    const observer = new MutationObserver((mutationsList) => {
        mutationsList.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                const bgImage = targetElement.style.backgroundImage;
                if (bgImage && bgImage.startsWith('url("blob:')) {
                    const blobUrl = bgImage.slice(5, -2); // Extract blob URL

                    // Create an Image object to load the blob and get its dimensions
                    const img = new Image();
                    img.src = blobUrl;
                    img.onload = function() {
                        console.log(`Image loaded from ${blobUrl}: width = ${img.naturalWidth}, height = ${img.naturalHeight}`);
                    };
                }
            }
        });
    });

    // Start observing the target element for attribute changes
    observer.observe(targetElement, { attributes: true });
}

// Apply the observer to each .folder or .photo element after they are added to the DOM
function showPhotos(folderPath) {
    currentFolder = folderPath;
    galleryContainer.innerHTML = '';
    errorMessage.style.display = 'none';
    fetchGitHubContents(folderPath).then((files) => {
        if (!files) return;

        currentImages = files.filter(file => file.name.endsWith('.jxl'));

        currentImages.forEach((image, index) => {
            const photoDiv = document.createElement('div');
            photoDiv.className = 'photo';
            const imageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${image.path}`;
            photoDiv.style.backgroundImage = `url('${imageUrl}')`;

            // Observe changes in the background image of this photoDiv
            observeBackgroundImageChange(photoDiv);

            photoDiv.onclick = () => openLightbox(index);
            galleryContainer.appendChild(photoDiv);
        });

        backButton.style.display = 'block';
    });
}

function openLightbox(index) {
    currentIndex = index;

    // Reusing the existing gallery elements
    const photoDivs = galleryContainer.querySelectorAll('.photo');
    const selectedImage = photoDivs[currentIndex];

    createLightbox(selectedImage);
    updateLightbox();
    lightbox.style.display = 'flex';
}

function createLightbox(selectedImage) {
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'lightbox';
        lightbox.className = 'lightbox';
        lightbox.style.display = 'none'; // Initially hidden
        document.body.appendChild(lightbox);

        // Lightbox image (we will use the same style of the photoDiv's background image)
        lightboxImg = document.createElement('div');
        lightboxImg.id = 'lightbox-img';
        lightboxImg.className = 'lightbox-img';
        lightboxImg.style.backgroundImage = selectedImage.style.backgroundImage; // Use the same image
        lightbox.appendChild(lightboxImg);

        // Previous button
        prevBtn = document.createElement('span');
        prevBtn.id = 'prev';
        prevBtn.innerHTML = '&#10094;';
        prevBtn.className = 'nav';
        prevBtn.onclick = (event) => {
            event.stopPropagation();
            navigate(-1);
        };
        lightbox.appendChild(prevBtn);

        // Next button
        nextBtn = document.createElement('span');
        nextBtn.id = 'next';
        nextBtn.innerHTML = '&#10095;';
        nextBtn.className = 'nav';
        nextBtn.onclick = (event) => {
            event.stopPropagation();
            navigate(1);
        };
        lightbox.appendChild(nextBtn);

        // Close lightbox when clicking outside of the image
        lightbox.onclick = closeLightbox;
    } else {
        // Update existing lightbox with new image from the gallery
        lightboxImg.style.backgroundImage = selectedImage.style.backgroundImage;
    }
}

function updateLightbox() {
    const photoDivs = galleryContainer.querySelectorAll('.photo');
    const selectedImage = photoDivs[currentIndex];
    lightboxImg.style.backgroundImage = selectedImage.style.backgroundImage;
}

function closeLightbox() {
    if (lightbox) {
        lightbox.style.display = 'none';
    }
}

function navigate(direction) {
    currentIndex = (currentIndex + direction + currentImages.length) % currentImages.length;
    updateLightbox();
}

function goBack() {
    showFolders();
}

backButton.onclick = goBack;

showFolders();
