(function () {
    function initEasterEgg() {
        const footers = document.querySelectorAll('footer p');
        footers.forEach(p => {
            if (p.querySelector('.egg-dot')) return;
            const dot = document.createElement('span');
            dot.className = 'egg-dot';
            dot.setAttribute('aria-hidden', 'true');
            dot.title = '';
            p.appendChild(dot);
        });

        let overlay = document.getElementById('egg-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'egg-overlay';
            overlay.className = 'egg-overlay';
            overlay.innerHTML = `
                <div class="egg-game" role="dialog" aria-label="Мини-игра">
                    <h3>Поймай искру</h3>
                    <p>Жми на огоньки, пока не погаснут</p>
                    <div class="egg-stats">
                        <span>Счёт: <strong id="egg-score">0</strong></span>
                        <span id="egg-time">15</span>
                    </div>
                    <div class="egg-field" id="egg-field"></div>
                    <button type="button" class="egg-close" id="egg-close">Закрыть</button>
                </div>`;
            document.body.appendChild(overlay);
        }

        const field = overlay.querySelector('#egg-field');
        const scoreEl = overlay.querySelector('#egg-score');
        const timeEl = overlay.querySelector('#egg-time');
        const closeBtn = overlay.querySelector('#egg-close');
        let score = 0, timer = null, spawnTimer = null, timeLeft = 15, running = false;

        function stopGame() {
            running = false;
            clearInterval(timer);
            clearInterval(spawnTimer);
            field.innerHTML = '';
        }

        function spawnSpark() {
            if (!running) return;
            const spark = document.createElement('div');
            spark.className = 'egg-spark';
            const pad = 20;
            spark.style.left = (pad + Math.random() * (field.clientWidth - pad * 2)) + 'px';
            spark.style.top = (pad + Math.random() * (field.clientHeight - pad * 2)) + 'px';
            const remove = () => spark.remove();
            spark.addEventListener('click', e => {
                e.stopPropagation();
                score++;
                scoreEl.textContent = score;
                remove();
            });
            field.appendChild(spark);
            setTimeout(remove, 1100);
        }

        function startGame() {
            stopGame();
            score = 0;
            timeLeft = 15;
            scoreEl.textContent = '0';
            timeEl.textContent = '15';
            running = true;
            overlay.classList.add('open');
            spawnSpark();
            spawnTimer = setInterval(spawnSpark, 650);
            timer = setInterval(() => {
                timeLeft--;
                timeEl.textContent = String(timeLeft);
                if (timeLeft <= 0) {
                    stopGame();
                    timeEl.textContent = 'Конец!';
                }
            }, 1000);
        }

        document.querySelectorAll('.egg-dot').forEach(dot => {
            dot.addEventListener('click', startGame);
        });

        closeBtn.addEventListener('click', () => {
            stopGame();
            overlay.classList.remove('open');
        });
        overlay.addEventListener('click', e => {
            if (e.target === overlay) {
                stopGame();
                overlay.classList.remove('open');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEasterEgg);
    } else {
        initEasterEgg();
    }
})();
