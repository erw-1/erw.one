document.addEventListener('DOMContentLoaded', () => {
    let homePage = null;     // Track home page separately
    let currentPage = null;  // Track the current page being processed (home, theme, or article)

    // Fetch and parse the markdown
    fetch('content.md')
        .then(response => response.text())
        .then(parseMarkdown)
        .catch(err => console.error('Error loading markdown:', err));

    // Parse markdown into structured data
    function parseMarkdown(markdown) {
        const lines = markdown.split('\n');

        lines.forEach(line => {
            if (line.startsWith('<!--')) {
                parseComment(line);
            } else {
                addContent(line);
            }
        });

        console.log('Final Parsed Data:', JSON.stringify(homePage, null, 2));  // Log final data structure with children
    }

    // Parse comment lines to create pages (home, theme, or article)
    function parseComment(line) {
        const type = extractFromComment(line, 'type');
        const title = extractFromComment(line, 'title');
        const id = extractFromComment(line, 'id');

        if (!type || !id || !title) return;

        // Articles don't need children, only themes and home do
        const newPage = createPage({ type, id, title, content: '', children: type === 'theme' ? [] : undefined });

        switch (type) {
            case 'home':
                homePage = newPage;
                currentPage = homePage;  // Set the current page context to home
                console.log('Created Home:', homePage);
                break;
            case 'theme':
                if (!homePage.children) {
                    homePage.children = []; // Ensure homePage has a children array
                }
                homePage.children.push(newPage);
                currentPage = newPage;  // Set the current page context to theme
                console.log('Added Theme to Home:', newPage);
                break;
            case 'article':
                if (!currentPage.children) {
                    currentPage.children = []; // Ensure the current theme has a children array
                }
                currentPage.children.push(newPage);  // Add article to the current theme
                currentPage = newPage;  // Set the current page context to article
                console.log('Added Article to Theme:', newPage);
                break;
            default:
                console.error('Unknown type:', type);
        }
    }

    // Add content to the current page
    function addContent(line) {
        if (currentPage) {
            currentPage.content += line + '\n';
            console.log(`Added content to ${currentPage.type}:`, line);
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
});
