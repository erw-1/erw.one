document.addEventListener('DOMContentLoaded', () => {
    let pages = [];  // Store all pages (home, themes, and articles)

    // Fetch and parse the markdown
    fetch('content.md')
        .then(response => response.text())
        .then(data => {
            console.log('Raw Markdown Data:', data);
            parseMarkdown(data);
            console.log('Parsed Pages Data:', pages);  // Log parsed data
        });

    // Parse the markdown and build the page data structure
    function parseMarkdown(markdown) {
        let currentTheme = null;  // To track the current theme
        const lines = markdown.split('\n');

        lines.forEach(line => {
            // Parse Home, Theme, or Article
            if (line.startsWith('<!--')) {
                const type = extractFromComment(line, 'type');
                const title = extractFromComment(line, 'title');
                const id = extractFromComment(line, 'id');

                if (type === 'home') {
                    const homePage = {
                        type: 'home',
                        id: id,
                        title: title,
                        content: ''
                    };
                    pages.push(homePage);
                    console.log('Parsed Home:', homePage);
                } else if (type === 'theme') {
                    currentTheme = {
                        type: 'theme',
                        id: id,
                        title: title,
                        content: '',
                        articles: []
                    };
                    pages.push(currentTheme);
                    console.log('Parsed Theme:', currentTheme);
                } else if (type === 'article' && currentTheme) {
                    const article = {
                        type: 'article',
                        id: id,
                        title: title,
                        content: ''
                    };
                    currentTheme.articles.push(article);
                    pages.push(article);
                    console.log('Parsed Article:', article);
                }
            }
            // Add content to the home, theme, or article
            else if (currentTheme === null && pages.length > 0) {
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
        });
    }

    // Helper to extract data from comment lines
    function extractFromComment(line, key) {
        const regex = new RegExp(`${key}:"([^"]+)"`);
        const match = line.match(regex);
        return match ? match[1].trim() : '';
    }
});
