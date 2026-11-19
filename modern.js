(function () {
  const headerNav = document.querySelector('header nav');
  if (headerNav) {
    const menu = headerNav.querySelector('ul');
    if (menu && !headerNav.querySelector('.fire-mobile-toggle')) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'fire-mobile-toggle';
      toggle.setAttribute('aria-label', 'Открыть меню');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = '<span aria-hidden="true">☰</span>';
      headerNav.insertBefore(toggle, menu);
      const closeMenu = () => {
        document.body.classList.remove('fire-nav-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Открыть меню');
        toggle.innerHTML = '<span aria-hidden="true">☰</span>';
      };
      toggle.addEventListener('click', () => {
        const open = !document.body.classList.contains('fire-nav-open');
        document.body.classList.toggle('fire-nav-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
        toggle.innerHTML = open ? '<span aria-hidden="true">×</span>' : '<span aria-hidden="true">☰</span>';
      });
      menu.addEventListener('click', event => {
        if (event.target.closest('a')) closeMenu();
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeMenu();
      });
      window.addEventListener('resize', () => {
        if (window.innerWidth > 768) closeMenu();
      }, { passive: true });
    }
  }

  document.querySelectorAll('img').forEach((img, index) => {
    if (!img.hasAttribute('loading')) img.loading = index === 0 && img.closest('.hero-image') ? 'eager' : 'lazy';
    img.decoding = 'async';
  });

  const currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('header nav a').forEach(link => {
    const href = link.getAttribute('href') || '';
    if ((currentPage === 'index.html' && href === '#home') || (currentPage === 'wiki.html' && href === 'wiki.html')) {
      link.setAttribute('aria-current', 'page');
    }
  });
})();