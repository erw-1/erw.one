document.addEventListener('DOMContentLoaded', () => {
    let homePage = null;
    let currentPage = null;
    let currentTheme = null;

    // Fetch and parse the markdown
    fetch('content.md')
        .then(response => response.text())
        .then(parseMarkdown)
        .then(() => {
            convertContentToHtml(homePage);
            renderPage(homePage);
            console.log('Final Parsed Data with HTML Content:', JSON.stringify(homePage, null, 2));
        })
        .catch(err => console.error('Error loading markdown:', err));

    // Handle hash changes for navigation
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.split('#').filter(Boolean);
        if (hash.length > 0) {
            navigateToPage(homePage, hash);
        } else {
            renderPage(homePage);
        }
    });

    // Navigate to a page based on the URL hash
    function navigateToPage(page, hashArray) {
        let targetPage = resolvePageFromHash(page, hashArray);
        if (targetPage) renderPage(targetPage);
    }

    // Resolve page based on the hash array
    function resolvePageFromHash(page, hashArray) {
        return hashArray.reduce((currentPage, id) => {
            return currentPage?.children?.find(child => child.id === id) || null;
        }, page);
    }

    // Render the current page with title, content, and children buttons
    function renderPage(page) {
        const contentDiv = document.getElementById('content');
        contentDiv.innerHTML = '';  // Clear existing content

        const titleElement = createElement('h1', page.title);
        const contentElement = createElement('div', page.content, true);

        contentDiv.appendChild(titleElement);
        contentDiv.appendChild(contentElement);

        if (page.children && page.children.length > 0) {
            const buttonContainer = createElement('div', '', false, 'button-container');
            page.children.forEach(childPage => buttonContainer.appendChild(createButton(page, childPage)));
            contentDiv.appendChild(buttonContainer);
        }
    }

    // Create a button for navigating to child pages
    function createButton(parentPage, childPage) {
        const button = createElement('button', childPage.title);
        const newHash = parentPage === homePage ? `#${childPage.id}` : `#${parentPage.id}#${childPage.id}`;
        button.onclick = () => window.location.hash = newHash;
        return button;
    }

    // Create a generic HTML element with optional innerHTML
    function createElement(tag, content = '', isHtml = false, className = '') {
        const element = document.createElement(tag);
        if (isHtml) element.innerHTML = content;
        else element.textContent = content;
        if (className) element.className = className;
        return element;
    }

    // Parse the markdown into structured data
    function parseMarkdown(markdown) {
        markdown.split('\n').forEach(line => {
            line.startsWith('<!--') ? parseComment(line) : addContent(line);
        });
    }

    // Parse comments to create pages (home, theme, article)
    function parseComment(line) {
        const type = extractFromComment(line, 'type');
        const title = extractFromComment(line, 'title');
        const id = extractFromComment(line, 'id');

        if (!type || !id || !title) return;

        // Initialize the children array only for home and theme pages
        const newPage = { 
            type, 
            id, 
            title, 
            content: '', 
            children: type === 'theme' || type === 'home' ? [] : undefined 
        };

        addPageToStructure(newPage, type);
    }

    // Add the page to the correct place in the structure
    function addPageToStructure(newPage, type) {
        switch (type) {
            case 'home':
                homePage = newPage;
                currentPage = homePage;
                console.log('Created Home:', homePage);
                break;
            case 'theme':
                currentPage = newPage;  // Ensure we're switching to the new theme
                addChildPage(homePage, newPage);  // Add the theme to home
                currentTheme = newPage;  // Track the current theme for adding articles
                console.log('Added Theme to Home:', newPage);
                break;
            case 'article':
                if (currentTheme) {
                    addChildPage(currentTheme, newPage);  // Add articles to the current theme
                    console.log('Added Article to Theme:', newPage);
                } else {
                    console.error('No theme found to attach the article to');
                }
                currentPage = newPage;
                break;
            default:
                console.error('Unknown type:', type);
        }
    }

    // Add a child page (article or theme) to a parent page (home or theme)
    function addChildPage(parent, child) {
        if (!parent.children) {
            parent.children = [];  // Ensure the parent has a children array
        }
        parent.children.push(child);
    }

    // Add content to the current page
    function addContent(line) {
        if (currentPage) {
            currentPage.content += line + '\n';
        }
    }

    // Extract data from comment lines
    function extractFromComment(line, key) {
        const regex = new RegExp(`${key}:"([^"]+)"`);
        const match = line.match(regex);
        return match ? match[1].trim() : null;
    }

    // Convert markdown content to HTML for all pages recursively
    function convertContentToHtml(page) {
        if (page.content) {
            page.content = MarkdownParser(page.content);
        }

        if (page.children && page.children.length > 0) {
            page.children.forEach(convertContentToHtml);
        }
    }

    // Convert markdown to HTML
    function MarkdownParser(markdown) {
        return markdown
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>')
            .replace(/\*(.*?)\*/gim, '<i>$1</i>')
            .replace(/!\[(.*?)\]\((.*?)\)/gim, (match, altText, imagePath) => {
                if (!imagePath.startsWith('/files/img/blog/')) {
                    imagePath = `/files/img/blog/${imagePath}`;
                }
                return `<img alt='${altText}' src='${imagePath}' />`;
            })
            .replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2'>$1</a>")
            .replace(/\n\s*\n/gim, '</p><p>')
            .replace(/\n$/gim, '<br />')
            .replace(/\n/gim, '<br />')
            .trim();
    }
});
