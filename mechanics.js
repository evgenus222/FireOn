(function () {
    const container = document.getElementById('managed-mechanics');
    if (!container) return;

    function safeHtml(source) {
        const parsed = new DOMParser().parseFromString(String(source || ''), 'text/html');
        parsed.querySelectorAll('script, iframe, object, embed, form, meta, base').forEach(el => el.remove());
        parsed.body.querySelectorAll('*').forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                const name = attr.name.toLowerCase();
                const value = attr.value.trim();
                if (name.startsWith('on') || name === 'srcdoc') {
                    el.removeAttribute(attr.name);
                } else if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^javascript:/i.test(value)) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        return parsed.body.innerHTML;
    }

    function renderPost(post, index) {
        if (!post || !post.title || !post.body) return;

        const card = document.createElement('article');
        card.className = 'wiki-card wiki-searchable managed-mechanics-card';
        card.id = 'managed-mech-' + index;
        const tags = Array.isArray(post.tags) ? post.tags : [];
        card.dataset.search = [post.title, post.excerpt || '', ...tags].join(' ');

        const title = document.createElement('div');
        title.className = 'wiki-card-title';
        title.textContent = post.title;
        card.appendChild(title);

        if (post.date) {
            const date = new Date(post.date + 'T00:00:00');
            if (!Number.isNaN(date.getTime())) {
                const meta = document.createElement('div');
                meta.className = 'managed-mechanics-meta';
                meta.textContent = date.toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                });
                card.appendChild(meta);
            }
        }

        if (post.image) {
            const image = document.createElement('img');
            image.className = 'managed-mechanics-image';
            image.src = post.image;
            image.alt = post.title;
            image.loading = 'lazy';
            card.appendChild(image);
        }

        const body = document.createElement('div');
        body.className = 'wiki-card-body';
        body.innerHTML = safeHtml(post.body);
        card.appendChild(body);
        container.appendChild(card);
    }

    fetch('data/mechanics.json', { cache: 'no-store' })
        .then(response => {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        })
        .then(posts => {
            if (!Array.isArray(posts)) throw new Error('Ожидался список публикаций');
            posts
                .map((post, index) => ({ post, index }))
                .sort((a, b) => String(b.post.date || '').localeCompare(String(a.post.date || '')))
                .forEach(({ post, index }) => renderPost(post, index));

            const search = document.getElementById('wiki-search');
            if (search && search.value.trim()) {
                search.dispatchEvent(new Event('input', { bubbles: true }));
            }
        })
        .catch(error => {
            console.error('Не удалось загрузить публикации FIREON:', error);
        });
})();
