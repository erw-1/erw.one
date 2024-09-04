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
        renderHome(themes['Home'].title, themes);
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
        // Add the content for the Home
        homeHtml += `<p>${themes['Home'].content}</p>`;
    
        // Render buttons for themes and their articles
        homeHtml += '<div class="theme-buttons">';
        for (let theme in themes) {
            if (theme !== 'Home') {
                const themeId = themes[theme].id;
                const themeTitle = themes[theme].title;
                homeHtml += `<button class="theme-button" onclick="window.location.hash='${themeId}'">${themeTitle}</button>`;
                homeHtml += '<div class="article-buttons">';
                for (let articleId in themes[theme].articles) {
                    const articleTitle = themes[theme].articles[articleId].title;
                    homeHtml += `<button class="article-button" onclick="window.location.hash='${themeId}#${articleId}'">${articleTitle}</button>`;
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
            renderHome(themes['Home'].title, themes);
        } else if (themeIdMap[themeId]) {
            const themeTitle = themeIdMap[themeId].title;
            if (articleId) {
                renderArticle(themeTitle, articleId, themes[themeId]);
            } else {
                renderThemeContent(themeTitle, themes[themeId], themes);
            }
        }
    }

    // Render theme content and article buttons
    function renderThemeContent(themeTitle, theme, themes) {
        const contentDiv = document.getElementById('content');
        const themeNameDiv = document.getElementById('theme-name');
        const articleNameDiv = document.getElementById('article-name');
        const separator = document.getElementById('separator');
        const dropdownDiv = document.getElementById('theme-dropdown'); // Theme dropdown for other themes

        themeNameDiv.innerHTML = `<a href="#${theme.id}">${themeTitle}</a>`;
        themeNameDiv.style.display = 'inline';
        articleNameDiv.style.display = 'none';
        separator.style.display = 'none';

        let contentHtml = `<h1>${themeTitle}</h1><p>${theme.content}</p>`;
        contentHtml += '<div class="article-buttons">';
        for (let articleId in theme.articles) {
            const articleTitle = theme.articles[articleId].title;
            contentHtml += `<button class="article-button" onclick="window.location.hash='${theme.id}#${articleId}'">${articleTitle}</button>`;
        }
        contentHtml += '</div>';

        // Populate the dropdown with links to other themes
        let dropdownHtml = '';
        for (let themeKey in themes) {
            if (themeKey !== 'Home' && themes[themeKey].id !== theme.id) {
                const themeDropdownTitle = themes[themeKey].title;
                dropdownHtml += `<li><a href="#${themes[themeKey].id}">${themeDropdownTitle}</a></li>`;
            }
        }
        dropdownDiv.innerHTML = dropdownHtml;

        contentDiv.innerHTML = contentHtml;
    }

    // Render the selected article
    function renderArticle(themeTitle, articleId, theme) {
        const contentDiv = document.getElementById('content');
        const themeNameDiv = document.getElementById('theme-name');
        const articleNameDiv = document.getElementById('article-name');
        const separator = document.getElementById('separator');
        const dropdownDiv = document.getElementById('article-dropdown'); // Article dropdown

        const articleTitle = theme.articles[articleId].title;

        themeNameDiv.innerHTML = `<a href="#${theme.id}">${themeTitle}</a>`;
        themeNameDiv.style.display = 'inline';
        articleNameDiv.style.display = 'inline';
        separator.style.display = 'inline';
        articleNameDiv.querySelector('#article-title').textContent = articleTitle;

        const articleContent = theme.articles[articleId].content;
        contentDiv.innerHTML = `<h1>${articleTitle}</h1>` + basicMarkdownParser(articleContent);

        // Populate the dropdown with other articles from the same theme
        let dropdownHtml = '';
        for (let otherArticleId in theme.articles) {
            if (otherArticleId !== articleId) {
                const otherArticleTitle = theme.articles[otherArticleId].title;
                dropdownHtml += `<li><a href="#${theme.id}#${otherArticleId}">${otherArticleTitle}</a></li>`;
            }
        }
        dropdownDiv.innerHTML = dropdownHtml;
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
