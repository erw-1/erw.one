const owner = 'erw-1';
const repo = 'erw.one';
const basePath = 'files/img/photo/';
const branch = 'main';

const galleryContainer = document.getElementById('gallery');
const backButton = document.getElementById('back-button');
const errorMessage = document.getElementById('error-message');

let currentFolder = '';
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

async function showPhotos(folderPath) {
    currentFolder = folderPath;
    galleryContainer.innerHTML = '';
    errorMessage.style.display = 'none';
    
    const files = await fetchGitHubContents(folderPath);
    if (!files) return;

    currentImages = files.filter(file => file.name.endsWith('.jxl'));

    // Load each image, fetch its dimensions, then create the grid item
    const promises = currentImages.map((image, index) => {
        return loadImageDimensions(image, index);
    });

    // Wait for all images to be loaded and sized
    Promise.all(promises).then(() => {
        backButton.style.display = 'block';
    });
}

function loadImageDimensions(image, index) {
    return new Promise((resolve) => {
        const img = new Image();
        const imgUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${image.path}`;

        // On image load, retrieve dimensions and append the photoDiv to the gallery
        img.onload = function () {
            const width = img.naturalWidth;
            const height = img.naturalHeight;

            const photoDiv = document.createElement('div');
            photoDiv.className = 'photo';

            // Set the dimensions based on the image's natural size
            photoDiv.style.width = `${width}px`;
            photoDiv.style.height = `${height}px`;

            // Set the background image
            photoDiv.style.backgroundImage = `url('${imgUrl}')`;

            // Add click event to open lightbox
            photoDiv.onclick = () => openLightbox(index);

            // Append the div to the gallery container
            galleryContainer.appendChild(photoDiv);

            resolve();
        };

        // Start loading the image
        img.src = imgUrl;
    });
}

function openLightbox(index) {
    currentIndex = index;
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

        // Lightbox image
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
