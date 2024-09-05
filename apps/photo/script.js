const owner = 'erw-1';
const repo = 'erw.one';
const basePath = 'files/img/photo/';
const branch = 'main';

const galleryContainer = document.getElementById('gallery');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const backButton = document.getElementById('back-button');
const errorMessage = document.getElementById('error-message');

let currentFolder = '';
let currentIndex = 0;
let currentImages = [];

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

    currentImages = files.filter(file => file.name.endsWith('.jxl')) ;

    currentImages.forEach((image, index) => {
        const photoDiv = document.createElement('div');
        photoDiv.className = 'photo';
        photoDiv.style.backgroundImage = `url('https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${image.path}')`;
        photoDiv.onclick = () => openLightbox(index);
        galleryContainer.appendChild(photoDiv);
    });

    backButton.style.display = 'block';
}

function openLightbox(index) {
    currentIndex = index;
    updateLightbox();
    lightbox.style.display = 'flex';
}

function updateLightbox() {
    const imagePath = currentImages[currentIndex].path;
    lightboxImg.src = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${imagePath}`;
}

function closeLightbox() {
    lightbox.style.display = 'none';
}

function navigate(direction) {
    currentIndex = (currentIndex + direction + currentImages.length) % currentImages.length;
    updateLightbox();
}

// Prevent the click event on arrows from closing the lightbox
prevBtn.onclick = (event) => {
    event.stopPropagation();
    navigate(-1);
};

nextBtn.onclick = (event) => {
    event.stopPropagation();
    navigate(1);
};

lightbox.onclick = closeLightbox;

function goBack() {
    showFolders();
}

backButton.onclick = goBack;

showFolders();
