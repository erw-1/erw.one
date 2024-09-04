document.addEventListener('DOMContentLoaded', () => {
    let currentPage = null;  // Track the current page being processed (home, theme, or article)
    
    // Fetch and parse the markdown
    fetch('content.md')
        .then(response => response.text())
        .then(parseMarkdown)
        .then(() => {
            convertContentToHtml(currentPage);  // Convert the content of all pages to HTML after parsing
            renderPage(currentPage);  // Render the home page initially
            console.log('Final Parsed Data:', JSON.stringify(currentPage, null, 2));
        })
        .catch(err => console.error('Error loading markdown:', err));

    // Handle hash changes in the URL for navigation
    window.addEventListener('hashchange', () => {
        const hashPath = getHashPath();
        const targetPage = findPageByHash(currentPage, hashPath);
        if (targetPage) renderPage(targetPage);
        else console.error('Page not found for hash:', hashPath);
    });

    // Function to get the hash path array (e.g., ["theme1", "article1-theme1"])
    function getHashPath() {
        return window.location.hash.split('#').filter(Boolean);
    }

    // Function to find a page by traversing the hash path
    function findPageByHash(page, hashPath) {
        return hashPath.reduce((current, id) => {
            return current?.children?.find(child => child.id === id) || null;
        }, page);
    }

    // Function to parse markdown into structured data
    function parseMarkdown(markdown) {
        const lines = markdown.split('\n');
        lines.forEach(line => {
            if (line.startsWith('<!--')) {
                parseComment(line);
            } else {
                addContent(line);
            }
        });
    }

    // Function to parse comment lines (for home, theme, or article)
    function parseComment(line) {
        const type = extractFromComment(line, 'type');
        const title = extractFromComment(line, 'title');
        const id = extractFromComment(line, 'id');

        if (!type || !id || !title) return;

        // Create a new page (home, theme, or article)
        const newPage = { type, id, title, content: '', children: type === 'theme' ? [] : undefined };

        if (type === 'home') {
            currentPage = newPage;  // Set the home page as the root
            console.log('Created Home:', newPage);
        } else if (type === 'theme') {
            addChildPage(currentPage, newPage);  // Add the theme to the current page (home)
            currentPage = newPage;  // Set the current page context to theme
        } else if (type === 'article') {
            addChildPage(currentPage, newPage);  // Add article to the current theme's children
            currentPage = newPage;  // Set the current page context to article
        }
    }

    // Function to add content to the current page
    function addContent(line) {
        if (currentPage) {
            currentPage.content += line + '\n';
            console.log(`Added content to ${currentPage.type}:`, line);
        }
    }

    // Helper to add a child page to the parent (e.g., adding an article to a theme or theme to home)
    function addChildPage(parentPage, childPage) {
        if (!parentPage.children) {
            parentPage.children = [];
        }
        parentPage.children.push(childPage);
    }

    // Helper to extract data from comment lines
    function extractFromComment(line, key) {
        const regex = new RegExp(`${key}:"([^"]+)"`);
        const match = line.match(regex);
        return match ? match[1].trim() : null;
    }

    // Convert markdown content to HTML for all pages recursively
    function convertContentToHtml(page) {
        if (page.content) {
            page.content = MarkdownParser(page.content);  // Convert markdown to HTML
        }

        // If the page has children, apply conversion recursively
        if (page.children && page.children.length > 0) {
            page.children.forEach(convertContentToHtml);
        }
    }

    // Function to render the current page with its title, content, and immediate child buttons
    function renderPage(page) {
        const contentDiv = document.getElementById('content');
        contentDiv.innerHTML = '';  // Clear existing content

        // Render page title and content
        const titleElement = document.createElement('h1');
        titleElement.textContent = page.title;
        contentDiv.appendChild(titleElement);

        const contentElement = document.createElement('div');
        contentElement.innerHTML = page.content;
        contentDiv.appendChild(contentElement);

        // Render buttons for children if available
        if (page.children && page.children.length > 0) {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'button-container';

            page.children.forEach(childPage => {
                const button = document.createElement('button');
                button.textContent = childPage.title;
                button.onclick = () => {
                    window.location.hash = `#${childPage.id}`;
                };
                buttonContainer.appendChild(button);
            });

            contentDiv.appendChild(buttonContainer);
        }
    }

    // Markdown to HTML conversion function
    function MarkdownParser(markdown) {
        // Convert headers
        markdown = markdown.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        markdown = markdown.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        markdown = markdown.replace(/^# (.*$)/gim, '<h1>$1</h1>');

        // Convert bold and italic
        markdown = markdown.replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>'); // Bold
        markdown = markdown.replace(/\*(.*?)\*/gim, '<i>$1</i>');     // Italic

        // Convert images
        markdown = markdown.replace(/!\[(.*?)\]\((.*?)\)/gim, function(match, altText, imagePath) {
            if (!imagePath.startsWith('/files/img/blog/')) {
                imagePath = `/files/img/blog/${imagePath}`;
            }
            return `<img alt='${altText}' src='${imagePath}' />`;
        });

        // Convert links
        markdown = markdown.replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2'>$1</a>");

        // Convert paragraphs (two newlines = new paragraph)
        markdown = markdown.replace(/\n\s*\n/gim, '</p><p>'); // Paragraph breaks
        markdown = '<p>' + markdown + '</p>'; // Wrap everything in <p>
        
        return markdown.trim();
    }
});
