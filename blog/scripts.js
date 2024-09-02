document.addEventListener('DOMContentLoaded', () => {
    fetch('content.md')
        .then(response => response.text())
        .then(data => parseMarkdown(data));

    function parseMarkdown(markdown) {
        const themes = {};
        let currentTheme = null;
        let homeContent = '';
        let homeTitle = 'Home';

        markdown.split('\n').forEach(line => {
            if (line.startsWith('# Home')) {
                currentTheme = 'Home';
                themes[currentTheme] = { intro: '', articles: {} };
            } else if (line.startsWith('# ')) {
                currentTheme = line.substring(2).trim();
                themes[currentTheme] = { intro: '', articles: {} };
            } else if (line.startsWith('## ')) {
                const articleTitle = line.substring(3).trim();
                themes[currentTheme].articles[articleTitle] = '';
            } else if (currentTheme === 'Home') {
                homeContent += line + '\n';
            } else if (currentTheme && Object.keys(themes[currentTheme].articles).length === 0) {
                themes[currentTheme].intro += line + '\n';
            } else if (currentTheme) {
                const lastArticleKey = Object.keys(themes[currentTheme].articles).pop();
                themes[currentTheme].articles[lastArticleKey] += line + '\n';
            }
        });

        renderHome(homeTitle, homeContent, themes);
        handleHashChange(themes);
        window.addEventListener('hashchange', () => handleHashChange(themes));
    }

    function renderHome(title, content, themes) {
        const contentDiv = document.getElementById('content');
        const themeNameDiv = document.getElementById('theme-name');
        const articleNameDiv = document.getElementById('article-name');
        const separator = document.getElementById('separator');

        if (!themeNameDiv || !articleNameDiv || !separator) {
            console.error('Required elements are missing in the DOM.');
            return;
        }

        themeNameDiv.textContent = title;
        articleNameDiv.style.display = 'none';
        separator.style.display = 'none';

        let homeHtml = `<h1>${title}</h1>`;
        homeHtml += `<p>${content}</p>`;
        homeHtml += '<div class="theme-buttons">';
        for (let theme in themes) {
            if (theme !== 'Home') {
                homeHtml += `<button class="theme-button" onclick="window.location.hash='${theme}'">${theme}</button>`;
                homeHtml += '<div class="article-buttons">';
                for (let articleTitle in themes[theme].articles) {
                    homeHtml += `<button class="article-button" onclick="window.location.hash='${theme}#${articleTitle}'">${articleTitle}</button>`;
                }
                homeHtml += '</div>';
            }
        }
        homeHtml += '</div>';

        contentDiv.innerHTML = homeHtml;
    }

    function renderThemeIntro(theme, articles) {
        const contentDiv = document.getElementById('content');
        const themeNameDiv = document.getElementById('theme-name');
        const articleNameDiv = document.getElementById('article-name');
        const separator = document.getElementById('separator');

        if (!themeNameDiv || !articleNameDiv || !separator) {
            console.error('Required elements are missing in the DOM.');
            return;
        }

        themeNameDiv.textContent = theme;
        themeNameDiv.setAttribute('href', `#${theme}`);
        articleNameDiv.style.display = 'none';
        separator.style.display = 'none';

        let introHtml = '';
        introHtml += `<p>${articles.intro}</p>`;
        introHtml += '<div class="article-buttons">';
        for (let articleTitle in articles.articles) {
            introHtml += `<button class="article-button" onclick="window.location.hash='${theme}#${articleTitle}'">${articleTitle}</button>`;
        }
        introHtml += '</div>';

        contentDiv.innerHTML = introHtml;
    }

    function renderArticle(theme, article, articles) {
        const contentDiv = document.getElementById('content');
        const themeNameDiv = document.getElementById('theme-name');
        const articleNameDiv = document.getElementById('article-name');
        const articleListDiv = document.getElementById('article-list');
        const separator = document.getElementById('separator');

        if (!themeNameDiv || !articleNameDiv || !separator) {
            console.error('Required elements are missing in the DOM.');
            return;
        }

        themeNameDiv.textContent = theme;
        themeNameDiv.setAttribute('href', `#${theme}`);
        articleNameDiv.style.display = 'inline';
        separator.style.display = 'inline';
        articleNameDiv.querySelector('#article-title').textContent = article;

        // Populate dropdown list, excluding the current article
        articleListDiv.innerHTML = '';
        for (let articleTitle in articles.articles) {
            if (articleTitle !== article) {  // Exclude the current article
                const articleListItem = document.createElement('li');
                articleListItem.textContent = articleTitle;
                articleListItem.addEventListener('click', () => {
                    window.location.hash = `${theme}#${articleTitle}`;
                    closeAllDropdowns(); // Close dropdown on selection
                });
                articleListDiv.appendChild(articleListItem);
            }
        }

        // Ensure the dropdown toggle works reliably
        let dropdownVisible = false;
        articleNameDiv.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent triggering other click events
            dropdownVisible = !dropdownVisible;
            closeAllDropdowns();
            if (dropdownVisible) {
                articleListDiv.style.display = 'block';
            }
        });

        // Close dropdown if clicking outside
        document.addEventListener('click', (event) => {
            if (!articleNameDiv.contains(event.target)) {
                closeAllDropdowns();
                dropdownVisible = false;
            }
        });

        contentDiv.innerHTML = basicMarkdownParser(articles.articles[article]);
    }

    function closeAllDropdowns() {
        const dropdowns = document.querySelectorAll('.dropdown-content');
        dropdowns.forEach(dropdown => dropdown.style.display = 'none');
    }

    function handleHashChange(themes) {
        const hash = decodeURIComponent(window.location.hash.substring(1)).split('#');
        const theme = hash[0];
        const article = hash[1];

        if (theme === '' || theme === 'Home') {
            renderHome('Home', themes['Home'].intro, themes);
        } else if (theme && themes[theme]) {
            if (article) {
                renderArticle(theme, article, themes[theme]);
            } else {
                renderThemeIntro(theme, themes[theme]);
            }
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
