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
        const targetPage = hashArray.reduce((currentPage, id) => {
            return currentPage?.children?.find(child => child.id === id) || null;
        }, page);
        if (targetPage) renderPage(targetPage);
    }

    // Render the current page with title, content, and children buttons
    function renderPage(page) {
        const contentDiv = document.getElementById('content');
        contentDiv.innerHTML = '';  // Clear existing content

        contentDiv.appendChild(createElement('h1', page.title));
        contentDiv.appendChild(createElement('div', page.content, true));

        populateHeader(page);

        if (page.children?.length > 0) {
            const buttonContainer = createElement('div', '', false, 'button-container');
            page.children.forEach(child => buttonContainer.appendChild(createElement('button', child.title, false, '', () => navigateHash(page, child))));
            contentDiv.appendChild(buttonContainer);
        }
    }

    // Populate the header (breadcrumb style)
    function populateHeader(page) {
        const headerDiv = document.getElementById('header');
        headerDiv.innerHTML = '';  // Clear existing header content

        // Add home button without "Hi!" (just the SVG)
        const homeButton = createElement('button', homeSvg, true);
        homeButton.onclick = () => window.location.hash = '';
        headerDiv.appendChild(homeButton);

        // Breadcrumb trail (skip "Hi!" for home, only show theme/article titles)
        let breadcrumbTrail = [];
        let currentPage = page;

        while (currentPage && currentPage !== homePage) {
            breadcrumbTrail.unshift(currentPage);  // Add pages in reverse order
            currentPage = findParent(currentPage);
        }

        breadcrumbTrail.forEach((breadcrumbPage, index) => {
            const separator = createElement('span', separatorSvg, true, 'separator');
            headerDiv.appendChild(separator);

            const pageButton = createElement('button', breadcrumbPage.title);
            if (index === breadcrumbTrail.length - 1 && breadcrumbPage.children?.length) {
                // Last page in breadcrumb, add dropdown functionality
                const dropdownSeparator = createElement('span', separatorSvg, true, 'dropdown-separator');
                dropdownSeparator.onclick = () => createDropdown(breadcrumbPage.children, dropdownSeparator);
                headerDiv.appendChild(pageButton);
                headerDiv.appendChild(dropdownSeparator);
            } else {
                // Normal breadcrumb button
                pageButton.onclick = () => navigateHash(findParent(breadcrumbPage), breadcrumbPage);
                headerDiv.appendChild(pageButton);
            }
        });
    }

    // Create dropdown for sibling pages
    function createDropdown(children, separatorElement) {
        const dropdown = createElement('div', '', false, 'dropdown');
        children.forEach(child => {
            const dropdownItem = createElement('div', child.title);
            dropdownItem.onclick = () => navigateHash(findParent(child), child);
            dropdown.appendChild(dropdownItem);
        });

        // Position and display the dropdown near the separator
        dropdown.style.position = 'absolute';
        dropdown.style.left = `${separatorElement.offsetLeft}px`;
        separatorElement.appendChild(dropdown);
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

    // Find the parent of a given page
    function findParent(page) {
        const findInParent = (parent) => parent.children?.find(child => child === page);
        let foundParent = homePage?.children?.find(findInParent);
        if (!foundParent) {
            homePage?.children?.forEach(theme => {
                if (findInParent(theme)) foundParent = theme;
            });
        }
        return foundParent || homePage;
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

    // Home SVG and Separator SVGs
    const homeSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" class="icon-md">
        <path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
        </svg>`;
    const separatorSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" class="icon-md text-token-text-tertiary">
        <path fill="currentColor" fill-rule="evenodd" d="M5.293 9.293a1 1 0 0 1 1.414 0L12 14.586l5.293-5.293a1 1 0 1 1 1.414 1.414l-6 6a1 1 0 0 1-1.414 0l-6-6a1 1 0 0 1 0-1.414" clip-rule="evenodd"></path>
        </svg>`;
});
