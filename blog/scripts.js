document.addEventListener('DOMContentLoaded', () => {
    let pages = [];  // Store all pages (home, themes, and articles)
    let currentPage = null;  // To track the current page (home, theme, or article)

    // Fetch and parse the markdown
    fetch('content.md')
        .then(response => response.text())
        .then(data => {
            console.log('Raw Markdown Data:', data);
            parseMarkdown(data);
            console.log('Parsed Pages Data:', pages);  // Log parsed data
        });

    // Main function to parse the markdown
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

    // Parse comment lines (for home, theme, or article)
    function parseComment(line) {
        const type = extractFromComment(line, 'type');
        const title = extractFromComment(line, 'title');
        const id = extractFromComment(line, 'id');

        if (!type || !id || !title) return;

        currentPage = addPage({ type, id, title, content: '', articles: type === 'theme' ? [] : undefined });
    }

    // Add content to the current page (home, theme, or article)
    function addContent(line) {
        if (currentPage) {
            currentPage.content += line + '\n';  // Add content to the current page
            console.log(`Added to ${currentPage.type.charAt(0).toUpperCase() + currentPage.type.slice(1)} Content:`, line);
        }
    }

    // Helper to add a page (home, theme, or article) to the pages array
    function addPage(page) {
        pages.push(page);
        console.log(`Parsed ${page.type.charAt(0).toUpperCase() + page.type.slice(1)}:`, page);
        return page;
    }

    // Helper to extract data from comment lines
    function extractFromComment(line, key) {
        const regex = new RegExp(`${key}:"([^"]+)"`);
        const match = line.match(regex);
        return match ? match[1].trim() : null;
    }
});
