document.addEventListener('DOMContentLoaded', () => {
    let pages = [];  // Store all pages (home, themes, and articles)

    // Fetch and parse the markdown
    fetch('content.md')
        .then(response => response.text())
        .then(data => {
            console.log('Raw Markdown Data:', data);
            parseMarkdown(data);
            console.log('Parsed Pages Data:', pages);
        });

    // Parse the markdown and build the page data structure
    function parseMarkdown(markdown) {
        let currentTheme = null;  // To track the current theme
        const lines = markdown.split('\n');

        lines.forEach(line => {
            // Parse Home
            if (line.startsWith('<!-- Home')) {
                const homeTitle = extractFromComment(line, 'title', true);
                const homePage = {
                    type: 'home',
                    id: 'home',  // Assign a default id for home
                    title: homeTitle,
                    content: ''
                };
                pages.push(homePage);
                console.log('Parsed Home:', homePage);
            }
            // Parse Theme
            else if (line.startsWith('<!-- Theme')) {
                const themeTitle = extractFromComment(line, 'title', true);
                const themeId = extractFromComment(line, 'id', false);
                currentTheme = {
                    type: 'theme',
                    id: themeId || `theme-${Math.random().toString(36).substr(2, 9)}`,  // Fallback in case no ID is provided
                    title: themeTitle,
                    content: '',
                    articles: []  // Articles will be nested inside themes
                };
                pages.push(currentTheme);
                console.log('Parsed Theme:', currentTheme);
            }
            // Parse Article
            else if (line.startsWith('<!-- Article')) {
                const articleTitle = extractFromComment(line, 'title', true);
                const articleId = extractFromComment(line, 'id', false);
                const article = {
                    type: 'article',
                    id: articleId || `article-${Math.random().toString(36).substr(2, 9)}`,  // Fallback in case no ID is provided
                    title: articleTitle,
                    content: ''
                };
                if (currentTheme) {
                    currentTheme.articles.push(article);  // Add article to the current theme
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

        handleHashChange();  // Render the correct page based on the current hash
        window.addEventListener('hashchange', handleHashChange);  // Listen for hash changes
    }

    // Helper to extract data from comment lines
    function extractFromComment(line, key, isQuoted = true) {
        const regex = isQuoted ? new RegExp(`${key}:\\s*"([^"]+)"`) : new RegExp(`${key}:\\s*([^\\s]+)`);
        const match = line.match(regex);
        return match ? match[1].trim() : '';
    }

    // Function to handle hash changes
    function handleHashChange() {
        const hash = window.location.hash.substring(1).split('#');
        const pageId = hash[0];
        const page = pages.find(p => p.id === pageId);

        console.log('Current Hash:', window.location.hash);
        console.log('Found Page from Hash:', page);

        if (page) {
            renderHeader(page);  // Render the header
            renderPage(page);  // Render the content
        } else {
            const homePage = pages.find(p => p.type === 'home');
            renderHeader(homePage);  // Default to the home page
            renderPage(homePage);
        }
    }

    // Render the header (breadcrumb navigation and dropdowns)
    function renderHeader(page) {
        const themeNameDiv = document.getElementById('theme-name');
        const articleNameDiv = document.getElementById('article-name');
        const separator = document.getElementById('separator');
        const articleDropdown = document.getElementById('article-list');

        // Reset visibility and dropdown content
        articleDropdown.innerHTML = '';
        themeNameDiv.style.display = 'none';
        articleNameDiv.style.display = 'none';
        separator.style.display = 'none';

        // If it's a theme, show the breadcrumb
        if (page.type === 'theme') {
            themeNameDiv.innerHTML = `<a href="#${page.id}">${page.title}</a>`;
            themeNameDiv.style.display = 'inline';
            console.log('Rendered Header for Theme:', page.title);
        }
        // If it's an article, show the theme and article breadcrumbs
        else if (page.type === 'article') {
            const theme = pages.find(t => t.articles.some(a => a.id === page.id));
            themeNameDiv.innerHTML = `<a href="#${theme.id}">${theme.title}</a>`;
            themeNameDiv.style.display = 'inline';
            articleNameDiv.querySelector('#article-title').textContent = page.title;
            articleNameDiv.style.display = 'inline';
            separator.style.display = 'inline';
            console.log('Rendered Header for Article:', page.title);

            // Populate the article dropdown with links to other articles in the theme
            let dropdownHtml = '';
            theme.articles.forEach(article => {
                if (article.id !== page.id) {
                    dropdownHtml += `<li><a href="#${theme.id}#${article.id}">${article.title}</a></li>`;
                }
            });
            articleDropdown.innerHTML = dropdownHtml;
            console.log('Populated Article Dropdown:', dropdownHtml);
        }
    }

    // Render the page's title and content
    function renderPage(page) {
        const contentDiv = document.getElementById('content');
        let html = `<h1>${page.title}</h1>`;
        html += `<div>${basicMarkdownParser(page.content)}</div>`;

        // If it's a theme, render the article buttons
        if (page.type === 'theme') {
            html += '<div class="article-buttons">';
            page.articles.forEach(article => {
                html += `<button class="article-button" onclick="window.location.hash='${page.id}#${article.id}'">${article.title}</button>`;
            });
            html += '</div>';
        }

        contentDiv.innerHTML = html;
        console.log('Rendered Page:', page.title);
    }

    // Simple markdown parser to convert markdown to HTML
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
