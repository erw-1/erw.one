document.addEventListener('DOMContentLoaded', () => {
    let pages = [];

    // Fetch and parse the markdown file
    fetch('content.md')
        .then(response => response.text())
        .then(data => parseMarkdown(data));

    function parseMarkdown(markdown) {
        let currentTheme = null;
        const lines = markdown.split('\n');

        lines.forEach((line) => {
            // Parse Home Page
            if (line.startsWith('<!-- Home')) {
                const homeTitle = extractFromComment(line, 'title');
                pages.push({
                    type: 'home',
                    id: 'home',
                    title: homeTitle,
                    content: ''
                });
            }
            // Parse Theme
            else if (line.startsWith('<!-- Theme')) {
                const themeTitle = extractFromComment(line, 'title');
                const themeId = extractFromComment(line, 'id');
                currentTheme = {
                    type: 'theme',
                    id: themeId,
                    title: themeTitle,
                    content: '',
                    articles: []  // Articles will be nested in themes
                };
                pages.push(currentTheme);
            }
            // Parse Article
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
                    currentTheme.articles.push(article);  // Add article to the current theme
                    pages.push(article);
                }
            }
            // Add content to the home, theme, or article
            else if (currentTheme === null && pages.length > 0) {
                pages[0].content += line + '\n';  // Add to home content
            } else if (currentTheme && currentTheme.articles.length === 0) {
                currentTheme.content += line + '\n';  // Add to theme content
            } else if (currentTheme && currentTheme.articles.length > 0) {
                const lastArticle = currentTheme.articles[currentTheme.articles.length - 1];
                lastArticle.content += line + '\n';  // Add to the last article's content
            }
        });

        handleHashChange();  // Start by rendering the correct page based on hash
        window.addEventListener('hashchange', handleHashChange);  // Handle hash changes
    }

    // Helper to extract data from comment lines
    function extractFromComment(line, key) {
        const regex = new RegExp(`${key}:\\s*"([^"]+)"`);
        const match = line.match(regex);
        return match ? match[1].trim() : '';
    }

    // Function to handle hash changes and render the correct page
    function handleHashChange() {
        const hash = window.location.hash.substring(1).split('#');
        const pageId = hash[0];
        const page = pages.find(p => p.id === pageId);

        if (page) {
            renderHeader(page);
            renderPage(page);
        } else {
            const homePage = pages.find(p => p.type === 'home');
            renderHeader(homePage);
            renderPage(homePage);
        }
    }

    // Render the header (breadcrumb and dropdowns)
    function renderHeader(page) {
        const themeNameDiv = document.getElementById('theme-name');
        const articleNameDiv = document.getElementById('article-name');
        const separator = document.getElementById('separator');
        const articleDropdown = document.getElementById('article-list');

        // Reset dropdown and breadcrumb visibility
        articleDropdown.innerHTML = '';
        themeNameDiv.style.display = 'none';
        articleNameDiv.style.display = 'none';
        separator.style.display = 'none';

        // If it's a theme or article, show the breadcrumb
        if (page.type === 'theme') {
            themeNameDiv.innerHTML = `<a href="#${page.id}">${page.title}</a>`;
            themeNameDiv.style.display = 'inline';
        } else if (page.type === 'article') {
            const theme = pages.find(t => t.articles.some(a => a.id === page.id));
            themeNameDiv.innerHTML = `<a href="#${theme.id}">${theme.title}</a>`;
            articleNameDiv.querySelector('#article-title').textContent = page.title;
            articleNameDiv.style.display = 'inline';
            separator.style.display = 'inline';

            // Populate the article dropdown with other articles from the same theme
            let dropdownHtml = '';
            theme.articles.forEach(article => {
                if (article.id !== page.id) {
                    dropdownHtml += `<li><a href="#${theme.id}#${article.id}">${article.title}</a></li>`;
                }
            });
            articleDropdown.innerHTML = dropdownHtml;
        }
    }

    // Render the page content
    function renderPage(page) {
        const contentDiv = document.getElementById('content');

        let html = `<h1>${page.title}</h1>`;
        html += `<div>${basicMarkdownParser(page.content)}</div>`;

        if (page.type === 'theme') {
            // Render buttons for articles in the theme
            html += '<div class="article-buttons">';
            page.articles.forEach(article => {
                html += `<button class="article-button" onclick="window.location.hash='${page.id}#${article.id}'">${article.title}</button>`;
            });
            html += '</div>';
        }

        contentDiv.innerHTML = html;
    }

    // A simple markdown parser function
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
