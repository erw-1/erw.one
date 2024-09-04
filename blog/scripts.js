document.addEventListener('DOMContentLoaded', () => {
    let homePage = null;
    let currentPage = null; // Track the current page (theme, article)

    // Fetch and parse the markdown
    fetch('content.md')
        .then(response => response.text())
        .then(parseMarkdown)
        .then(() => {
            convertContentToHtml(homePage);  // Convert all page content to HTML
            renderPage(homePage);  // Render the home page
            console.log('Final Parsed Data:', JSON.stringify(homePage, null, 2));  // Log final structured data
        })
        .catch(err => console.error('Error loading markdown:', err));

    // Handle hash changes for navigation
    window.addEventListener('hashchange', () => {
        const hashPath = getHashPath();
        const targetPage = findPageByHash(homePage, hashPath);
        if (targetPage) renderPage(targetPage);
        else console.error('Page not found for hash:', hashPath);
    });

    // Parse markdown into structured data
    function parseMarkdown(markdown) {
        const lines = markdown.split('\n');
        let lastTheme = null; // Keep track of the last parsed theme

        lines.forEach(line => {
            if (line.startsWith('<!--')) {
                parseComment(line);
            } else {
                addContent(line);
            }
        });

        function parseComment(line) {
            const type = extractFromComment(line, 'type');
            const title = extractFromComment(line, 'title');
            const id = extractFromComment(line, 'id');

            if (!type || !id || !title) return;

            const newPage = {
                type, id, title, content: '', children: type === 'theme' ? [] : undefined
            };

            // Home Page
            if (type === 'home') {
                homePage = newPage;
                currentPage = homePage;
            }

            // Theme Page
            else if (type === 'theme') {
                homePage.children.push(newPage); // Themes are children of Home
                lastTheme = newPage;  // Track the current theme
                currentPage = newPage;
            }

            // Article Page
            else if (type === 'article' && lastTheme) {
                lastTheme.children.push(newPage);  // Articles are children of the last theme
                currentPage = newPage;
            }
        }

        function addContent(line) {
            if (currentPage) {
                currentPage.content += line + '\n';
            }
        }
    }

    // Helper function to extract data from comment lines
    function extractFromComment(line, key) {
        const regex = new RegExp(`${key}:"([^"]+)"`);
        const match = line.match(regex);
        return match ? match[1].trim() : null;
    }

    // Function to render the current page
    function renderPage(page) {
        const contentDiv = document.getElementById('content');
        contentDiv.innerHTML = '';  // Clear existing content

        // Render page title
        const titleElement = document.createElement('h1');
        titleElement.textContent = page.title;
        contentDiv.appendChild(titleElement);

        // Render page content
        const contentElement = document.createElement('div');
        contentElement.innerHTML = page.content;
        contentDiv.appendChild(contentElement);

        // Render buttons for children (themes or articles)
        if (page.children && page.children.length > 0) {
            const buttonContainer = document.createElement('div');
            page.children.forEach(child => {
                const button = document.createElement('button');
                button.textContent = child.title;
                button.onclick = () => {
                    window.location.hash = `#${child.id}`;
                };
                buttonContainer.appendChild(button);
            });
            contentDiv.appendChild(buttonContainer);
        }
    }

    // Convert markdown content to HTML
    function convertContentToHtml(page) {
        if (page.content) {
            page.content = MarkdownParser(page.content);
        }
        if (page.children) {
            page.children.forEach(convertContentToHtml);
        }
    }

    // Function to traverse hash path and find the target page
    function findPageByHash(root, hashPath) {
        return hashPath.reduce((current, id) => {
            return current?.children?.find(child => child.id === id) || null;
        }, root);
    }

    // Function to get hash path (array of IDs from the URL)
    function getHashPath() {
        return window.location.hash.split('#').filter(Boolean);
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
