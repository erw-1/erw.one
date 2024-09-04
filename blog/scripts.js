document.addEventListener('DOMContentLoaded', () => {
    let homePage = null;     // Track home page separately
    let lastTheme = null;    // Track the last theme for associating articles

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

        // Home Page
        if (type === 'home') {
            homePage = createPage({ type, id, title, content: '', children: [] });
        }
        // Theme Page
        else if (type === 'theme') {
            const theme = createPage({ type, id, title, content: '', children: [] });
            homePage.children.push(theme);  // Add the theme to homePage's children
            lastTheme = theme;  // Set this as the current theme
        }
        // Article Page
        else if (type === 'article' && lastTheme) {
            const article = createPage({ type, id, title, content: '' });
            lastTheme.children.push(article);  // Add the article to the last theme's children
        }
    }

    // Add content to the current page (home, theme, or article)
    function addContent(line) {
        if (lastTheme && lastTheme.children.length > 0) {
            const lastArticle = lastTheme.children[lastTheme.children.length - 1];
            lastArticle.content += line + '\n';  // Add to the last article's content
        } else if (lastTheme) {
            lastTheme.content += line + '\n';  // Add to theme content if no articles
        } else if (homePage) {
            homePage.content += line + '\n';  // Add to home content
        }
    }

    // Helper to create and return a page (home, theme, or article)
    function createPage(page) {
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
