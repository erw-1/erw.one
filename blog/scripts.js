document.addEventListener('DOMContentLoaded', () => {
    let homePage = null;
    let currentContext = null;
    let currentTheme = null;  // Track the current theme to attach articles as siblings

    // Fetch and parse the markdown
    fetch('content.md')
        .then(response => response.text())
        .then(parseMarkdown)
        .then(() => {
            convertContentToHtml(homePage);  // Convert content of all pages to HTML after parsing
            renderPage(homePage);  // Initially render the home page
            console.log('Final Parsed Data with HTML Content:', JSON.stringify(homePage, null, 2));  // Log data structure with HTML content
        })
        .catch(err => console.error('Error loading markdown:', err));

    // Handle hash changes for navigation
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.split('#').filter(Boolean);
        hash.length > 0 ? navigateToPage(homePage, hash) : renderPage(homePage);  // If no hash, render home
    });

    // Navigate to a page based on the URL hash
    function navigateToPage(page, hashArray) {
        let targetPage = hashArray.reduce((currentPage, id) => {
            return currentPage?.children?.find(child => child.id === id) || null;
        }, page);

        if (targetPage) {
            renderPage(targetPage);
        } else {
            console.error('Page not found for the given hash:', hashArray);
        }
    }

    // Render the current page with title, content, and children buttons
    function renderPage(page) {
        const contentDiv = document.getElementById('content');
        contentDiv.innerHTML = '';  // Clear existing content

        populateHeader(page);  // Populate the header

        contentDiv.appendChild(createElement('h1', page.title));
        contentDiv.appendChild(createElement('div', page.content, true));

        if (page.children?.length > 0) {
            const buttonContainer = createElement('div', '', false, 'button-container');
            page.children.forEach(child => buttonContainer.appendChild(createElement('button', child.title, false, '', () => navigateHash(page, child))));
            contentDiv.appendChild(buttonContainer);
        }
    }

    // Simplified button hash creation
    function navigateHash(parentPage, childPage) {
        const newHash = parentPage === homePage ? `#${childPage.id}` : `#${parentPage.id}#${childPage.id}`;
        window.location.hash = newHash;
    }

    // Create a generic HTML element with optional innerHTML and event
    function createElement(tag, content = '', isHtml = false, className = '', eventListener = null) {
        const element = document.createElement(tag);
        if (isHtml) element.innerHTML = content;
        else element.textContent = content;
        if (className) element.className = className;
        if (eventListener) element.onclick = eventListener;
        return element;
    }

    // Parse the markdown into structured data
    function parseMarkdown(markdown) {
        markdown.split('\n').forEach(line => line.startsWith('<!--') ? parseComment(line) : addContent(line));
    }

    // Parse comments to create pages (home, theme, article)
    function parseComment(line) {
        const type = extractFromComment(line, 'type');
        const title = extractFromComment(line, 'title');
        const id = extractFromComment(line, 'id');
        if (!type || !id || !title) return;

        const newPage = { type, id, title, content: '', children: type === 'theme' || type === 'home' ? [] : undefined };

        if (type === 'home') {
            homePage = newPage;
            currentContext = homePage;
            currentTheme = null;  // Reset current theme
            console.log('Created Home:', homePage);
        } else if (type === 'theme') {
            addChildPage(homePage, newPage);  // Themes are direct children of home
            currentContext = newPage;  // Change context to current theme for articles
            currentTheme = newPage;  // Track the current theme for adding articles
            console.log('Added Theme to Home:', newPage);
        } else if (type === 'article') {
            if (currentTheme) {
                addChildPage(currentTheme, newPage);  // Articles are added as children to the current theme
                console.log('Added Article to Theme:', newPage);
            } else {
                console.error('No theme found to attach the article to');
            }
            currentContext = newPage;  // Set the current context to the article
        }
    }

    // Add a child page (article or theme) to a parent page (home or theme)
    function addChildPage(parent, child) {
        parent.children ??= [];  // Ensure the parent has a children array
        parent.children.push(child);
    }

    // Add content to the current page
    function addContent(line) {
        if (currentContext) {
            currentContext.content += line + '\n';
        }
    }

    // Extract data from comment lines
    function extractFromComment(line, key) {
        const regex = new RegExp(`${key}:"([^"]+)"`);
        return (line.match(regex)?.[1] || '').trim();
    }

    // Convert markdown content to HTML for all pages recursively
    function convertContentToHtml(page) {
        if (page.content) page.content = MarkdownParser(page.content);
        page.children?.forEach(convertContentToHtml);
    }

    // Convert markdown to HTML
    function MarkdownParser(markdown) {
        return markdown
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>')
            .replace(/\*(.*?)\*/gim, '<i>$1</i>')
            .replace(/!\[(.*?)\]\((.*?)\)/gim, (match, altText, imagePath) => `<img alt='${altText}' src='${!imagePath.startsWith('/files/img/blog/') ? `/files/img/blog/${imagePath}` : imagePath}' />`)
            .replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2'>$1</a>")
            .replace(/\n\s*\n/gim, '</p><p>')
            .replace(/\n$/gim, '<br />')
            .replace(/\n/gim, '<br />')
            .trim();
    }

    // Populate the header with navigation breadcrumbs and dropdowns
    function populateHeader(page) {
        const headerDiv = document.getElementById('header');
        headerDiv.innerHTML = ''; // Clear existing header

        // Home icon
        const homeIcon = createElement('div', homeSvg, true, 'header-item');
        homeIcon.onclick = () => {
            window.location.hash = ''; // Navigate to home
        };
        headerDiv.appendChild(homeIcon);

        // Check if page exists before populating
        if (!page) {
            console.error('Page is undefined in populateHeader.');
            return; // Exit if page is undefined
        }

        // Add breadcrumbs for themes and articles
        let currentPage = page;
        const breadcrumbs = [];

        while (currentPage) {
            breadcrumbs.unshift(currentPage); // Collect breadcrumb trail from current to home
            currentPage = findParent(homePage, currentPage);
        }

        breadcrumbs.forEach((crumb, index) => {
            const separator = createElement('div', separatorSvg, true, 'separator-item');
            const crumbElement = createElement('div', crumb.title, false, 'header-item');

            crumbElement.onclick = () => {
                // Navigate to the corresponding page
                window.location.hash = breadcrumbs.slice(0, index + 1).map(b => b.id).join('#');
            };

            headerDiv.appendChild(separator);
            headerDiv.appendChild(crumbElement);
        });

        // Handle last breadcrumb dropdown (if applicable)
        const lastPage = breadcrumbs[breadcrumbs.length - 1];
        if (lastPage && lastPage.children?.length > 0) {
            const dropdownButton = createElement('div', separatorSvg, true, 'dropdown');
            dropdownButton.classList.add('rotated-separator');
            const dropdownContent = createElement('div', '', false, 'dropdown-content');

            lastPage.children.forEach(sibling => {
                const siblingElement = createElement('div', sibling.title, false);
                siblingElement.onclick = () => {
                    window.location.hash = breadcrumbs.map(b => b.id).join('#') + `#${sibling.id}`;
                };
                dropdownContent.appendChild(siblingElement);
            });

            dropdownButton.appendChild(dropdownContent);
            headerDiv.appendChild(dropdownButton);

            dropdownButton.onclick = () => {
                dropdownContent.classList.toggle('visible');
            };
        }
    }

    // Helper function to find the parent page of a given page
    function findParent(rootPage, targetPage) {
        if (!rootPage || !rootPage.children) return null;
        if (rootPage.children.includes(targetPage)) return rootPage;
        for (let child of rootPage.children) {
            const parent = findParent(child, targetPage);
            if (parent) return parent;
        }
        return null;
    }

    // SVG for home icon and separator
    const homeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" class="icon-md"><path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`;
    const separatorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" class="icon-md"><path fill="currentColor" fill-rule="evenodd" d="M5.293 9.293a1 1 0 0 1 1.414 0L12 14.586l5.293-5.293a1 1 0 1 1 1.414 1.414l-6 6a1 1 0 0 1-1.414 0l-6-6a1 1 0 0 1 0-1.414" clip-rule="evenodd"></path></svg>`;
});
