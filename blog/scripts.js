document.addEventListener('DOMContentLoaded', () => {
    let homePage = null;
    let currentPageContext = null;

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
        hash.length > 0 ? navigateToPage(homePage, hash) : renderPage(homePage);
    });

    // Navigate to a page based on the URL hash
    function navigateToPage(page, hashArray) {
        const targetPage = resolvePageFromHash(page, hashArray);
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

        // Add the title and content
        contentDiv.appendChild(createElement('h1', page.title));
        contentDiv.appendChild(createElement('div', page.content, true));

        // Add buttons for children
        if (page.children?.length > 0) {
            const buttonContainer = createElement('div', '', false, 'button-container');
            page.children.forEach(child => buttonContainer.appendChild(createElement('button', child.title, false, '', () => navigateHash(page, child))));
            contentDiv.appendChild(buttonContainer);
        }
    }

    // Simplified button hash creation
    function navigateHash(parentPage, childPage) {
        const newHash = `#${parentPage === homePage ? '' : parentPage.id + '#'}${childPage.id}`;
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
        markdown.split('\n').forEach(line => {
            if (line.startsWith('<!--')) {
                parseComment(line);
            } else {
                addContent(line);
            }
        });
    }

    // Parse comments to create pages (home, theme, article)
    function parseComment(line) {
        const type = extractFromComment(line, 'type');
        const title = extractFromComment(line, 'title');
        const id = extractFromComment(line, 'id');

        if (!type || !id || !title) return;

        const newPage = { type, id, title, content: '', children: type === 'theme' || type === 'home' ? [] : undefined };

        switch (type) {
            case 'home':
                homePage = newPage;
                currentPageContext = homePage;
                console.log('Created Home:', homePage);
                break;
            case 'theme':
                homePage.children.push(newPage);  // Themes are direct children of home
                currentPageContext = newPage;
                console.log('Added Theme:', newPage);
                break;
            case 'article':
                if (currentPageContext?.type === 'theme') {
                    currentPageContext.children.push(newPage);  // Articles are children of the current theme
                    console.log('Added Article to Theme:', newPage);
                }
                break;
        }
    }

    // Add content to the current page
    function addContent(line) {
        if (currentPageContext) {
            currentPageContext.content += line + '\n';
        }
    }

    // Extract data from comment lines
    function extractFromComment(line, key) {
        const regex = new RegExp(`${key}:"([^"]+)"`);
        return (line.match(regex)?.[1] || '').trim();
    }

    // Convert markdown content to HTML for all pages recursively
    function convertContentToHtml(page) {
        if (page.content) {
            page.content = MarkdownParser(page.content);
        }

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
});
