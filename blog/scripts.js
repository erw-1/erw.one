document.addEventListener('DOMContentLoaded', () => {
    let homePage = null;  // Track home page separately
    let currentPage = null;  // Track the current page being displayed

    // Fetch and parse the markdown
    fetch('content.md')
        .then(response => response.text())
        .then(parseMarkdown)
        .then(() => {
            convertContentToHtml(homePage);  // Convert the content of all pages to HTML after parsing
            renderPage(homePage);  // Initially render the home page
        })
        .catch(err => console.error('Error loading markdown:', err));

    // Function to handle rendering based on hash changes in the URL
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.split('#').filter(Boolean); // Get hash without #
        if (hash.length > 0) {
            navigateToPage(homePage, hash);
        } else {
            renderPage(homePage);  // Default to home if no hash
        }
    });

    // Function to navigate to a page based on the hash in the URL
    function navigateToPage(page, hashArray) {
        let targetPage = page;
        for (const id of hashArray) {
            const child = targetPage.children?.find(childPage => childPage.id === id);
            if (child) {
                targetPage = child;  // Navigate to the next level in the hierarchy
            } else {
                console.error(`Page with id "${id}" not found.`);
                return;
            }
        }
        renderPage(targetPage);  // Render the target page after resolving the hash
    }

    // Function to render the current page with its title, content, and child buttons
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

        // Recursively render buttons for children (themes, articles)
        if (page.children && page.children.length > 0) {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'button-container';

            page.children.forEach(childPage => {
                const button = document.createElement('button');
                button.textContent = childPage.title;
                button.onclick = () => {
                    window.location.hash = `${page.id}#${childPage.id}`;
                };
                buttonContainer.appendChild(button);

                // Recursively render buttons for children of children if they exist
                if (childPage.children && childPage.children.length > 0) {
                    childPage.children.forEach(grandChildPage => {
                        const subButton = document.createElement('button');
                        subButton.textContent = grandChildPage.title;
                        subButton.onclick = () => {
                            window.location.hash = `${page.id}#${childPage.id}#${grandChildPage.id}`;
                        };
                        buttonContainer.appendChild(subButton);
                    });
                }
            });

            contentDiv.appendChild(buttonContainer);
        }
    }

    // Parse markdown into structured data
    function parseMarkdown(markdown) {
        const lines = markdown.split('\n');

        lines.forEach(line => {
            if (line.startsWith('<!--')) {
                parseComment(line);  // Handle comment parsing (create page, assign parent, etc.)
            } else {
                addContent(line);  // Add content to the current page
            }
        });
    }

    // Parse comment lines to create pages (home, theme, or article)
    function parseComment(line) {
        const type = extractFromComment(line, 'type');
        const title = extractFromComment(line, 'title');
        const id = extractFromComment(line, 'id');

        if (!type || !id || !title) return;

        // Create the new page (home, theme, or article)
        const newPage = createPage({
            type,
            id,
            title,
            content: '',
            children: type === 'theme' ? [] : undefined // Ensure children array for themes and home
        });

        // Handle Home Page
        if (type === 'home') {
            homePage = newPage;  // Set home as the root page
            currentPage = homePage;  // Set currentPage to home
            homePage.children = [];  // Explicitly initialize children for homePage
        }
        // Handle Theme Page
        else if (type === 'theme') {
            if (homePage && homePage.children) {
                homePage.children.push(newPage);  // Add the theme to homePage's children
                currentPage = newPage;  // Set currentPage to this theme for future articles
            } else {
                console.error('Error: homePage or homePage.children is not properly initialized');
            }
        }
        // Handle Article Page
        else if (type === 'article' && currentPage && currentPage.type === 'theme') {
            currentPage.children.push(newPage);  // Add article to the current theme's children
            currentPage = newPage;  // Set currentPage to the article for content addition
        }
    }

    // Add content to the current page (home, theme, or article)
    function addContent(line) {
        if (currentPage) {
            currentPage.content += line + '\n';  // Always add content to the currentPage
        }
    }

    // Helper to create a new page (home, theme, or article)
    function createPage(page) {
        return page;
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

        // If the page has children (for home or themes), apply conversion recursively
        if (page.children && page.children.length > 0) {
            page.children.forEach(childPage => convertContentToHtml(childPage));
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

        // Convert inline code
        markdown = markdown.replace(/`(.*?)`/gim, '<code>$1</code>');

        // Convert blockquotes
        markdown = markdown.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

        // Convert lists
        markdown = markdown.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');  // Unordered list
        markdown = markdown.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>'); // Wrap list items in <ul>

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
