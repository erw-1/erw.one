document.addEventListener('DOMContentLoaded', () => {
    let pages = [];  // Store all pages (home, themes, and articles)
    let currentTheme = null;  // To track the current theme or context

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

        if (type === 'home') {
            addPage({ type, id, title });
        } else if (type === 'theme') {
            currentTheme = addPage({ type, id, title, articles: [] });
        } else if (type === 'article' && currentTheme) {
            const article = addPage({ type, id, title });
            currentTheme.articles.push(article);  // Add article to current theme
        }
    }

    // Add content to the correct page (home, theme, or article)
    function addContent(line) {
        if (currentTheme === null && pages.length > 0) {
            pages[0].content += line + '\n';  // Add to home content
            console.log('Added to Home Content:', line);
        } else if (currentTheme && currentTheme.articles.length === 0) {
            currentTheme.content += line + '\n';  // Add to theme content
            console.log('Added to Theme Content:', line);
        } else if (currentTheme && currentTheme.articles.length > 0) {
            const lastArticle = currentTheme.articles[currentTheme.articles.length - 1];
            lastArticle.content += line + '\n';  // Add to the last article's content
            console.log('Added to Article Content:', line);
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
