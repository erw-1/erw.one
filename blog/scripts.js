document.addEventListener('DOMContentLoaded', () => {
    fetch('content.md')
        .then(response => response.text())
        .then(data => parseMarkdown(data));

    function parseMarkdown(markdown) {
        const themes = {};
        let currentTheme = null;

        markdown.split('\n').forEach(line => {
            if (line.startsWith('# ')) {
                currentTheme = line.substring(2).trim();
                themes[currentTheme] = {};
            } else if (line.startsWith('## ')) {
                const articleTitle = line.substring(3).trim();
                themes[currentTheme][articleTitle] = '';
            } else if (currentTheme && themes[currentTheme]) {
                const lastArticleKey = Object.keys(themes[currentTheme]).pop();
                themes[currentTheme][lastArticleKey] += line + '\n';
            }
        });

        renderThemes(themes);
        handleHashChange(themes);
        window.addEventListener('hashchange', () => handleHashChange(themes));
    }

    function renderThemes(themes) {
        const themeList = document.getElementById('theme-list');
        themeList.innerHTML = '';

        for (let theme in themes) {
            const themeItem = document.createElement('li');
            themeItem.textContent = theme;
            themeItem.id = theme;
            themeItem.addEventListener('click', () => {
                window.location.hash = theme;
            });
            themeList.appendChild(themeItem);
        }
    }

    function renderArticles(theme, article, articles) {
        const contentDiv = document.getElementById('content');
        const themeNameDiv = document.getElementById('theme-name');
        const articleNameDiv = document.getElementById('article-name');
        const articleListDiv = document.getElementById('article-list');

        themeNameDiv.textContent = theme;
        articleNameDiv.style.display = article ? 'inline' : 'none';
        articleNameDiv.querySelector('#article-title').textContent = article;

        // Populate dropdown list
        articleListDiv.innerHTML = '';
        for (let articleTitle in articles) {
            const articleListItem = document.createElement('li');
            articleListItem.textContent = articleTitle;
            articleListItem.addEventListener('click', () => {
                window.location.hash = `${theme}#${articleTitle}`;
            });
            articleListDiv.appendChild(articleListItem);
        }

        contentDiv.innerHTML = article ? basicMarkdownParser(articles[article]) : '';
    }

    function handleHashChange(themes) {
        const hash = decodeURIComponent(window.location.hash.substring(1)).split('#');
        const theme = hash[0];
        const article = hash[1];

        if (theme && themes[theme]) {
            document.querySelectorAll('#theme-list li').forEach(li => {
                li.classList.toggle('active', li.id === theme);
            });

            renderArticles(theme, article, themes[theme]);
        }
    }
    
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
