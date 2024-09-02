document.addEventListener('DOMContentLoaded', () => {
    fetch('content.md')
        .then(response => response.text())
        .then(data => parseMarkdown(data));

    function parseMarkdown(markdown) {
        const contentDiv = document.getElementById('content');
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
                themes[currentTheme][lastArticleKey] += updateImagePaths(line + '\n');
            }
        });

        renderThemes(themes);
        handleHashChange(themes);
        window.addEventListener('hashchange', () => handleHashChange(themes));
    }

    function updateImagePaths(markdown) {
        return markdown.replace(/!\[(.*?)\]\((.*?)\)/g, '![ $1 ](/files/img/blog/$2)');
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

    function renderArticles(theme, articles) {
        const contentDiv = document.getElementById('content');
        contentDiv.innerHTML = `<h1>${theme}</h1>`;
        for (let article in articles) {
            const articleDiv = document.createElement('div');
            articleDiv.innerHTML = `<h2 id="${theme}-${article}">${article}</h2>${marked(articles[article])}`;
            contentDiv.appendChild(articleDiv);
        }
    }

    function handleHashChange(themes) {
        const hash = decodeURIComponent(window.location.hash.substring(1)).split('#');
        const theme = hash[0];
        const article = hash[1];

        if (theme && themes[theme]) {
            document.querySelectorAll('#theme-list li').forEach(li => {
                li.classList.toggle('active', li.id === theme);
            });

            renderArticles(theme, themes[theme]);

            if (article) {
                const articleElement = document.getElementById(`${theme}-${article}`);
                if (articleElement) {
                    articleElement.scrollIntoView();
                }
            }
        }
    }
});
