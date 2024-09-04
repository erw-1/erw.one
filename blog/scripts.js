document.addEventListener('DOMContentLoaded', () => {
    let pages = [];

    fetch('content.md')
        .then(response => response.text())
        .then(data => parseMarkdown(data));

    function parseMarkdown(markdown) {
        let currentTheme = null;
        const lines = markdown.split('\n');
        
        lines.forEach((line) => {
            // Home
            if (line.startsWith('<!-- Home')) {
                const homeTitle = extractFromComment(line, 'title');
                pages.push({
                    type: 'home',
                    id: 'home',
                    title: homeTitle,
                    content: ''
                });
            }
            // Theme
            else if (line.startsWith('<!-- Theme')) {
                const themeTitle = extractFromComment(line, 'title');
                const themeId = extractFromComment(line, 'id');
                currentTheme = {
                    type: 'theme',
                    id: themeId,
                    title: themeTitle,
                    content: '',
                    articles: []
                };
                pages.push(currentTheme);
            }
            // Article
            else if (line.startsWith('<!-- Article')) {
                const articleTitle = extractFromComment(line, 'title');
                const articleId = extractFromComment(line, 'id');
                if (currentTheme) {
                    const article = {
                        type: 'article',
                        id: articleId,
                        title: articleTitle,
                        content: ''
                    };
                    currentTheme.articles.push(article);
                    pages.push(article);
                }
            }
            // Add content to the correct place
            else if (currentTheme && currentTheme.articles.length === 0) {
                currentTheme.content += line + '\n';  // Add to theme content
            } else if (currentTheme && currentTheme.articles.length > 0) {
                const lastArticle = currentTheme.articles[currentTheme.articles.length - 1];
                lastArticle.content += line + '\n';  // Add to the last article's content
            } else if (pages.length > 0 && pages[0].type === 'home') {
                pages[0].content += line + '\n';  // Add to home content
            }
        });

        renderPage('home');  // Start by rendering the homepage
        window.addEventListener('hashchange', handleHashChange);
    }

    // Helper to extract data from comment lines
    function extractFromComment(line, key) {
        const regex = new RegExp(`${key}:\\s*"([^"]+)"`);
        const match = line.match(regex);
        return match ? match[1].trim() : '';
    }

    // Render a page based on its type
    function renderPage(pageId) {
        const page = pages.find(p => p.id === pageId);
        const contentDiv = document.getElementById('content');

        if (!page) {
            contentDiv.innerHTML = `<p>Page not found</p>`;
            return;
        }

        if (page.type === 'home') {
            renderPageContent(page.title, page.content, getThemeButtons());
        } else if (page.type === 'theme') {
            renderPageContent(page.title, page.content, getArticleButtons(page));
        } else if (page.type === 'article') {
            const theme = pages.find(p => p.articles && p.articles.some(a => a.id === pageId));
            if (theme) {
                renderPageContent(page.title, page.content, []);
            }
        }
    }

    // Unified function to render the title, content, and buttons
    function renderPageContent(title, content, buttons = []) {
        const contentDiv = document.getElementById('content');
        let html = `<h1>${title}</h1>`;
        html += `<div>${basicMarkdownParser(content)}</div>`;

        // Add buttons (if any)
        if (buttons.length > 0) {
            html += '<div class="buttons">';
            buttons.forEach(button => {
                html += `<button class="theme-button" onclick="${button.onclick}">${button.label}</button>`;
            });
            html += '</div>';
        }

        contentDiv.innerHTML = html;
    }

    // Helper to get buttons for themes
    function getThemeButtons() {
        return pages
            .filter(p => p.type === 'theme')
            .map(theme => ({
                label: theme.title,
                onclick: `window.location.hash='${theme.id}'`
            }));
    }

    // Helper to get buttons for articles within a theme
    function getArticleButtons(theme) {
        return theme.articles.map(article => ({
            label: article.title,
            onclick: `window.location.hash='${article.id}'`
        }));
    }

    // Handle hash changes for navigation
    function handleHashChange() {
        const hash = window.location.hash.substring(1);
        renderPage(hash || 'home');
    }

    // Markdown parser (simple version)
    function basicMarkdownParser(markdown) {
        markdown = markdown.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        markdown = markdown.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        markdown = markdown.replace(/^# (.*$)/gim, '<h1>$1</h1>');
        markdown = markdown.replace(/\*\*(.*)\*\*/gim, '<b>$1</b>');
        markdown = markdown.replace(/\*(.*)\*/gim, '<i>$1</i>');
        markdown = markdown.replace(/!\[(.*?)\]\((.*?)\)/gim, "<img alt='$1' src='$2' />");
        markdown = markdown.replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2'>$1</a>");
        markdown = markdown.replace(/\n$/gim, '<br />');
        return markdown.trim();
    }
});
