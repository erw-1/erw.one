document.addEventListener('DOMContentLoaded', () => {
    let homePage = null;     // Track home page separately
    let currentPage = null;  // Track the current page being processed (home, theme, or article)

    // Fetch and parse the markdown
    fetch('content.md')
        .then(response => response.text())
        .then(data => {
            console.log('Raw Markdown Data:', data);
            parseMarkdown(data);
            console.log('Parsed Home Page Data:', homePage);  // Log parsed home page (with children)
        });

    // Main function to parse the markdown
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

    // Parse comment lines (for home, theme, or article)
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
            console.log(`Added content to ${currentPage.type.charAt(0).toUpperCase() + currentPage.type.slice(1)}:`, line);
        }
    }

    // Helper to create a new page (home, theme, or article)
    function createPage(page) {
        console.log(`Created ${page.type.charAt(0).toUpperCase() + page.type.slice(1)}:`, page);
        return page;
    }

    // Helper to extract data from comment lines
    function extractFromComment(line, key) {
        const regex = new RegExp(`${key}:"([^"]+)"`);
        const match = line.match(regex);
        return match ? match[1].trim() : null;
    }
});
