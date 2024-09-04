document.addEventListener('DOMContentLoaded', () => {
    fetch('content.md')
        .then(response => response.text())
        .then(data => parseMarkdown(data));

    function parseMarkdown(markdown) {
        const themes = {};
        let currentTheme = null;
        const themeIdMap = {};  // Map theme IDs to theme names and titles
        const articleIdMap = {};  // Map article IDs to their respective titles and theme

        markdown.split('\n').forEach(line => {
            // Parse the Home content from the comment
            if (line.startsWith('<!-- Home')) {
                const homeTitleMatch = line.match(/title:\s*"([^"]+)"/);
                const homeTitle = homeTitleMatch ? homeTitleMatch[1].trim() : 'Home';
                themes['Home'] = { content: '', articles: {}, title: homeTitle };
            }
            // Parse theme with title and custom ID
            else if (line.startsWith('<!-- Theme')) {
                const themeTitleMatch = line.match(/title:\s*"([^"]+)"/);
                const themeIdMatch = line.match(/id:\s*([^\s]+)/);
                const themeTitle = themeTitleMatch ? themeTitleMatch[1].trim() : 'Untitled Theme';
                const themeId = themeIdMatch ? themeIdMatch[1].trim() : `theme-${Math.random().toString(36).substr(2, 9)}`;
                currentTheme = themeId;
                themeIdMap[themeId] = { title: themeTitle, id: themeId };
                themes[currentTheme] = { content: '', articles: {}, id: themeId, title: themeTitle };
            }
            // Parse article with title and custom ID
            else if (line.startsWith('<!-- Article')) {
                const articleTitleMatch = line.match(/title:\s*"([^"]+)"/);
                const articleIdMatch = line.match(/id:\s*([^\s]+)/);
                const articleTitle = articleTitleMatch ? articleTitleMatch[1].trim() : 'Untitled Article';
                const articleId = articleIdMatch ? articleIdMatch[1].trim() : `article-${Math.random().toString(36).substr(2, 9)}`;
                if (currentTheme) {
                    themes[currentTheme].articles[articleId] = { content: '', id: articleId, title: articleTitle };
                    articleIdMap[articleId] = { theme: currentTheme, title: articleTitle };
                }
            }
            // Add content to the home or theme
            else if (currentTheme === null && themes['Home']) {
                themes['Home'].content += line + '\n';  // Add to home content if no theme is active
            } else if (currentTheme && Object.keys(themes[currentTheme].articles).length === 0) {
                themes[currentTheme].content += line + '\n';  // Add to theme content if no articles
            } else if (currentTheme && Object.keys(themes[currentTheme].articles).length > 0) {
                const lastArticleKey = Object.keys(themes[currentTheme].articles).pop();
                themes[currentTheme].articles[lastArticleKey].content += line + '\n';
            }
        });

        // Render the homepage and set up hash change handling
        renderPage(themes['Home'].title, themes['Home'].content, getThemeButtons(themes));
        handleHashChange(themes, themeIdMap, articleIdMap);
        window.addEventListener('hashchange', () => handleHashChange(themes, themeIdMap, articleIdMap));
    }

    // Helper function to render a page (used for home, theme, and article rendering)
    function renderPage(title, content, buttons = []) {
        const contentDiv = document.getElementById('content');
        const themeNameDiv = document.getElementById('theme-name');
        const articleNameDiv = document.getElementById('article-name');
        const separator = document.getElementById('separator');

        themeNameDiv.style.display = 'none';
        articleNameDiv.style.display = 'none';
        separator.style.display = 'none';

        let html = `<h1>${title}</h1>`;
        html += `<p>${basicMarkdownParser(content)}</p>`;

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

    // Handle the hash change for navigation
    function handleHashChange(themes, themeIdMap, articleIdMap) {
        const hash = window.location.hash.substring(1).split('#');
        const themeId = hash[0];
        const articleId = hash[1];

        if (!themeId || themeId === 'Home') {
            renderPage(themes['Home'].title, themes['Home'].content, getThemeButtons(themes));
        } else if (themeIdMap[themeId]) {
            const themeTitle = themeIdMap[themeId].title;
            if (articleId) {
                renderPage(
                    themeTitle,
                    themes[themeId].articles[articleId].content,
                    [] // No buttons for articles
                );
            } else {
                renderPage(
                    themeTitle,
                    themes[themeId].content,
                    getArticleButtons(themes[themeId].articles, themeId)
                );
            }
        }
    }

    // Helper function to generate theme buttons for the homepage
    function getThemeButtons(themes) {
        const buttons = [];
        for (let theme in themes) {
            if (theme !== 'Home') {
                buttons.push({
                    label: themes[theme].title,
                    onclick: `window.location.hash='${themes[theme].id}'`
                });
            }
        }
        return buttons;
    }

    // Helper function to generate article buttons for a theme
    function getArticleButtons(articles, themeId) {
        const buttons = [];
        for (let articleId in articles) {
            buttons.push({
                label: articles[articleId].title,
                onclick: `window.location.hash='${themeId}#${articleId}'`
            });
        }
        return buttons;
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
