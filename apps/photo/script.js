const owner = 'erw-1';
const repo = 'erw.one';
const basePath = 'files/img/photo/';
const branch = 'main';
const cacheDuration = 3600 * 1000; // Cache duration in milliseconds (1 hour)

const galleryContainer = document.getElementById('gallery');
const backButton = document.getElementById('back-button');
const errorMessage = document.getElementById('error-message');

let currentFolder = '';
let currentIndex = 0;
let currentImages = [];
let lightbox, lightboxImg, prevBtn, nextBtn;

// Function to fetch contents using GitHub GraphQL API
async function fetchGitHubContentsGraphQL(path) {
    const query = `
    {
      repository(owner: "${owner}", name: "${repo}") {
        object(expression: "${branch}:${path}") {
          ... on Tree {
            entries {
              name
              type
              path
            }
          }
        }
      }
    }`;

    try {
        const response = await fetch(`https://api.github.com/graphql`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer YOUR_PERSONAL_ACCESS_TOKEN`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
        });

        if (response.status === 403) {
            throw new Error('Rate limit exceeded');
        }

        const json = await response.json();
        return json.data.repository.object.entries;
    } catch (error) {
        console.error(error.message);
        errorMessage.style.display = 'block';
        return null;
    }
}

// Cache function using localStorage
function cacheData(key, data) {
    const cacheEntry = {
        data: data,
        timestamp: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(cacheEntry));
}

// Retrieve cached data, validating expiration
function getCachedData(key) {
    const cached = localStorage.getItem(key);
    if (cached) {
        const cacheEntry = JSON.parse(cached);
        if (Date.now() - cacheEntry.timestamp < cacheDuration) {
            return cacheEntry.data;
        }
        localStorage.removeItem(key); // Remove outdated cache
    }
    return null;
}

// Fetch content with caching
async function fetchGitHubContentsWithCache(path) {
    const cacheKey = `github-${path}`;
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
        return cachedData;
    }

    const data = await fetchGitHubContentsGraphQL(path);
    if (data) {
        cacheData(cacheKey, data);
    }
    return data;
}

// Show the list of folders
async function showFolders() {
    galleryContainer.innerHTML = '';
    errorMessage.style.display = 'none';

    const folders = await fetchGitHubContentsWithCache(basePath);
    if (!folders) return;

    folders.forEach(folder => {
        if (folder.type === 'tree') {
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

// Observe background image changes (as in your original code)
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
                        const aspectRatio = img.naturalWidth / img.naturalHeight;

                        // Resize the div to match the aspect ratio
                        targetElement.style.width = `${200 * aspectRatio}px`; // Keeping the initial height as 200px
                        targetElement.style.height = 'auto';
                    };
                }
            }
        });
    });

    observer.observe(targetElement, { attributes: true });
}

// Show photos in a folder
function showPhotos(folderPath) {
    currentFolder = folderPath;
    galleryContainer.innerHTML = '';
    errorMessage.style.display = 'none';
    
    fetchGitHubContentsWithCache(folderPath).then((files) => {
        if (!files) return;

        currentImages = files.filter(file => file.name.endsWith('.jxl'));

        currentImages.forEach((image, index) => {
            const photoDiv = document.createElement('div');
            photoDiv.className = 'photo';
            const imageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${image.path}`;
            photoDiv.style.backgroundImage = `url('${imageUrl}')`;

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
