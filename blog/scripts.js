document.addEventListener('DOMContentLoaded', () => {
    fetch('content.md')
        .then(response => response.text())
        .then(data => parseMarkdown(data));

    function parseMarkdown(markdown) {
        const pages = {};
        let currentPage = null;
        let isHomeSection = true;

        markdown.split('\n').forEach(line => {
            if (line.startsWith('# ')) {
                currentPage = line.substring(2).trim();
                pages[currentPage] = { id: slugify(currentPage), content: '', children: [] };
                isHomeSection = false;
            } else if (line.startsWith('## ')) {
                const themeTitle = line.substring(3).trim();
                if (currentPage) {
                    const theme = { id: slugify(themeTitle), content: '', children: [] };
                    pages[currentPage].children.push(theme);
                }
            } else if (line.startsWith('### ')) {
                const articleTitle = line.substring(4).trim();
                const lastTheme = pages[currentPage].children[pages[currentPage].children.length - 1];
                if (lastTheme) {
                    const article = { id: slugify(articleTitle), content: '', children: [] };
                    lastTheme.children.push(article);
                }
            } else if (currentPage) {
                // Add content to the appropriate section (home, theme, or article)
                if (pages[currentPage].children.length > 0) {
                    const lastTheme = pages[currentPage].children[pages[currentPage].children.length - 1];
                    if (lastTheme.children.length > 0) {
                        const lastArticle = lastTheme.children[lastTheme.children.length - 1];
                        lastArticle.content += line + '\n';
                    } else {
                        lastTheme.content += line + '\n';
                    }
                } else {
                    pages[currentPage].content += line + '\n';
                }
            }
        });

        // Render the page based on the current hash
        handleHashChange(pages);
        window.addEventListener('hashchange', () => handleHashChange(pages));
    }

    function renderPage(page, parentPage = null) {
        const contentDiv = document.getElementById('content');
        contentDiv.innerHTML = ''; // Clear the previous content

        // Render the title
        const title = document.createElement('h1');
        title.textContent = page.title || 'No Title';
        contentDiv.appendChild(title);

        // Render the content (if any)
        if (page.content) {
            const content = document.createElement('div');
            content.innerHTML = basicMarkdownParser(page.content.trim());
            contentDiv.appendChild(content);
        }

        // Render buttons for children (if any)
        if (page.children && page.children.length > 0) {
            const childButtonsDiv = document.createElement('div');
            childButtonsDiv.classList.add('child-buttons');

            page.children.forEach(child => {
                const button = document.createElement('button');
                button.textContent = child.id;
                button.classList.add('child-button');
                button.onclick = () => {
                    const hash = parentPage ? `#${parentPage.id}#${child.id}` : `#${child.id}`;
                    window.location.hash = hash;
                };
                childButtonsDiv.appendChild(button);
            });

            contentDiv.appendChild(childButtonsDiv);
        }
    }

    function handleHashChange(pages) {
        const hash = decodeURIComponent(window.location.hash.substring(1));
        const hashParts = hash.split('#');

        let currentPage = pages['Home']; // Default to home page
        let parentPage = null;

        if (hashParts[0]) {
            currentPage = pages[Object.keys(pages).find(page => pages[page].id === hashParts[0])];
            if (hashParts.length > 1) {
                const childPageId = hashParts[1];
                const childPage = currentPage.children.find(child => child.id === childPageId);
                if (childPage) {
                    parentPage = currentPage;
                    currentPage = childPage;
                }
            }
        }

        renderPage(currentPage, parentPage);
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

    // Helper function to generate a slug from the page title
    function slugify(text) {
        return text.toString().toLowerCase()
            .replace(/\s+/g, '-')        // Replace spaces with -
            .replace(/[^\w\-]+/g, '')    // Remove all non-word chars
            .replace(/\-\-+/g, '-')      // Replace multiple - with single -
            .replace(/^-+/, '')          // Trim - from start of text
            .replace(/-+$/, '');         // Trim - from end of text
    }
});
