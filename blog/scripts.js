document.addEventListener('DOMContentLoaded', () => {
    fetch('content.md')
        .then(response => response.text())
        .then(data => parseMarkdown(data));

    // Parse the markdown and extract themes, articles, and homepage content
    function parseMarkdown(markdown) {
        const themes = {};
        let currentTheme = null;
        let currentArticle = null;
        const themeIdMap = {};  // Map theme IDs to theme names
        const articleIdMap = {};  // Map article IDs to article names

        markdown.split('\n').forEach(line => {
            // Parse the Home title from the comment
            if (line.startsWith('<!-- Home:')) {
                const homeTitle = line.match(/<!-- Home:\s*(.+)\s*-->/)[1].trim();
                themes['Home'] = { intro: '', articles: {} };
                themes['Home'].intro = homeTitle;
            }
            // Parse theme and its custom ID
            else if (line.startsWith('<!-- Theme:')) {
                const themeMatch = line.match(/<!-- Theme:\s*(.+)\s*-->/);
                const themeId = themeMatch[1].trim(); // Custom ID from the comment
                currentTheme = themeId;
                themeIdMap[themeId] = currentTheme;
                themes[currentTheme] = { intro: '', articles: {}, id: themeId };
            }
            // Parse article and its custom ID
            else if (line.startsWith('<!-- Article:')) {
                const articleMatch = line.match(/<!-- Article:\s*(.+)\s*-->/);
                const articleId = articleMatch[1].trim(); // Custom ID from the comment
                if (currentTheme) {
                    themes[currentTheme].articles[articleId] = { content: '', id: articleId };
                    articleIdMap[articleId] = { theme: currentTheme, title: articleId };
                }
            }
            // Add content to the theme's intro or the article's content
            else if (currentTheme && Object.keys(themes[currentTheme].articles).length === 0) {
                themes[currentTheme].intro += line + '\n';
            } else if (currentTheme && Object.keys(themes[currentTheme].articles).length > 0) {
                const lastArticleKey = Object.keys(themes[currentTheme].articles).pop();
                themes[currentTheme].articles[lastArticleKey].content += line + '\n';
            }
        });

        // Render the homepage and set up hash change handling
        renderHome(themes['Home'].intro, themes);
        handleHashChange(themes, themeIdMap, articleIdMap);
        window.addEventListener('hashchange', () => handleHashChange(themes, themeIdMap, articleIdMap));
    }

    // Render the homepage content
    function renderHome(title, themes) {
        const contentDiv = document.getElementById('content');
        const themeNameDiv = document.getElementById('theme-name');
        const articleNameDiv = document.getElementById('article-name');
        const separator = document.getElementById('separator');

        themeNameDiv.style.display = 'none';
        articleNameDiv.style.display = 'none';
        separator.style.display = 'none';

        let homeHtml = `<h1>${title}</h1>`;
        homeHtml += '<div class="theme-buttons">';
        for (let theme in themes) {
            if (theme !== 'Home') {
                const themeId = themes[theme].id;
                homeHtml += `<button class="theme-button" onclick="window.location.hash='${themeId}'">${theme}</button>`;
                homeHtml += '<div class="article-buttons">';
                for (let articleId in themes[theme].articles) {
                    homeHtml += `<button class="article-button" onclick="window.location.hash='${themeId}#${articleId}'">${articleId}</button>`;
                }
                homeHtml += '</div>';
            }
        }
        homeHtml += '</div>';

        contentDiv.innerHTML = homeHtml;
    }

    // Handle the hash change for navigation
    function handleHashChange(themes, themeIdMap, articleIdMap) {
        const hash = window.location.hash.substring(1).split('#');
        const themeId = hash[0];
        const articleId = hash[1];

        if (!themeId || themeId === 'Home') {
            renderHome(themes['Home'].intro, themes);
        } else if (themeIdMap[themeId]) {
            const themeName = themeIdMap[themeId];
            if (articleId) {
                renderArticle(themeName, articleId, themes[themeName]);
            } else {
                renderThemeIntro(themeName, themes[themeName]);
            }
        }
    }

    // Render theme intro and article buttons
    function renderThemeIntro(theme, articles) {
        const contentDiv = document.getElementById('content');
        const themeNameDiv = document.getElementById('theme-name');
        const articleNameDiv = document.getElementById('article-name');
        const separator = document.getElementById('separator');

        themeNameDiv.textContent = theme;
        themeNameDiv.style.display = 'inline';
        articleNameDiv.style.display = 'none';
        separator.style.display = 'none';

        let introHtml = `<p>${articles.intro}</p>`;
        introHtml += '<div class="article-buttons">';
        for (let articleId in articles.articles) {
            introHtml += `<button class="article-button" onclick="window.location.hash='${articles.id}#${articleId}'">${articleId}</button>`;
        }
        introHtml += '</div>';

        contentDiv.innerHTML = introHtml;
    }

    // Render the selected article
    function renderArticle(theme, articleId, articles) {
        const contentDiv = document.getElementById('content');
        const themeNameDiv = document.getElementById('theme-name');
        const articleNameDiv = document.getElementById('article-name');
        const separator = document.getElementById('separator');

        themeNameDiv.textContent = theme;
        themeNameDiv.style.display = 'inline';
        articleNameDiv.style.display = 'inline';
        separator.style.display = 'inline';
        articleNameDiv.querySelector('#article-title').textContent = articleId;

        const articleContent = articles.articles[articleId].content;
        contentDiv.innerHTML = basicMarkdownParser(articleContent);
    }

    // A simple markdown parser function
    function basicMarkdownParser(markdown) {
        markdown = markdown.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        markdown = markdown.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        markdown = markdown.replace(/^# (.*$)/gim, '<h1>$1</h1>');
        markdown = markdown.replace(/\*\*(.*)\*\*/gim, '<b>$1</b>');
        markdown = markdown.replace(/\*(.*)\*/gim, '<i>$1</i>');
        markdown = markdown.replace(/!\[(.*?)\]\((.*?)\)/gim, function(match, altText, imagePath) {
            if (!imagePath.startsWith('/files/img/blog/')) {
                imagePath = `/files/img/blog/${imagePath}`;
            }
            return `<img alt='${altText}' src='${imagePath}' />`;
        });
        markdown = markdown.replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2'>$1</a>");
        markdown = markdown.replace(/\n$/gim, '<br />');
        return markdown.trim();
    }
});
