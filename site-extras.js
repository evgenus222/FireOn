(function () {
  function initEasterEgg() {
    document.querySelectorAll('footer p').forEach(p => {
      if (p.querySelector('.egg-dot')) return;
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'egg-dot';
      dot.setAttribute('aria-label', 'Открыть секретную мини-игру');
      dot.title = 'Секрет FIREON';
      p.appendChild(dot);
    });

    let overlay = document.getElementById('egg-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'egg-overlay';
      overlay.className = 'egg-overlay';
      overlay.innerHTML = `
        <div class="egg-game" role="dialog" aria-modal="true" aria-label="Охота за искрами">
          <div class="egg-kicker">FIREON / SECRET CHALLENGE</div>
          <h3>Охота за искрами</h3>
          <p>Лови оранжевые искры, не пропускай золотые и собирай серии!</p>
          <div class="egg-stats">
            <span>Счёт: <strong id="egg-score">0</strong></span>
            <span>Серия: <strong id="egg-combo">x0</strong></span>
            <span id="egg-time">25с</span>
          </div>
          <div class="egg-progress"><span id="egg-progress"></span></div>
          <div class="egg-field" id="egg-field" aria-label="Игровое поле"></div>
          <p class="egg-result" id="egg-result" aria-live="polite">25 секунд. Сколько искр поймаешь?</p>
          <button type="button" class="egg-close" id="egg-close">Закрыть</button>
        </div>`;
      document.body.appendChild(overlay);
    }

    const field = overlay.querySelector('#egg-field');
    const scoreEl = overlay.querySelector('#egg-score');
    const comboEl = overlay.querySelector('#egg-combo');
    const timeEl = overlay.querySelector('#egg-time');
    const progress = overlay.querySelector('#egg-progress');
    const result = overlay.querySelector('#egg-result');
    const closeBtn = overlay.querySelector('#egg-close');
    let score = 0, combo = 0, timeLeft = 25, timer = null, spawnTimer = null, running = false, lastHit = 0;

    function stopGame(showResult) {
      running = false;
      clearInterval(timer);
      clearInterval(spawnTimer);
      field.innerHTML = '';
      if (showResult) {
        const record = score >= 45 ? 'Невероятно! Ты настоящий хранитель огня.' :
          score >= 25 ? 'Отличный результат, искра!' :
          score >= 10 ? 'Хорошая охота! Попробуй побить свой счёт.' :
          'Начало положено. В следующий раз получится лучше!';
        result.textContent = 'Итог: ' + score + ' очков. ' + record;
      }
    }

    function spawnSpark() {
      if (!running) return;
      const golden = Math.random() < 0.16;
      const spark = document.createElement('button');
      spark.type = 'button';
      spark.className = 'egg-spark' + (golden ? ' egg-golden' : '');
      spark.setAttribute('aria-label', golden ? 'Золотая искра: 5 очков' : 'Искра: 1 очко');
      const pad = 22;
      spark.style.left = (pad + Math.random() * Math.max(0, field.clientWidth - pad * 2)) + 'px';
      spark.style.top = (pad + Math.random() * Math.max(0, field.clientHeight - pad * 2)) + 'px';
      const lifetime = golden ? 850 : 1250;
      const removeTimer = setTimeout(() => spark.remove(), lifetime);
      spark.addEventListener('click', () => {
        if (!running || !spark.isConnected) return;
        clearTimeout(removeTimer);
        const now = Date.now();
        combo = now - lastHit < 1300 ? combo + 1 : 1;
        lastHit = now;
        score += (golden ? 5 : 1) + Math.min(4, Math.floor(combo / 3));
        scoreEl.textContent = score;
        comboEl.textContent = 'x' + combo;
        if (golden) result.textContent = 'Золотая искра! +5';
        else if (combo > 1) result.textContent = 'Серия x' + combo + '!';
        spark.remove();
      });
      field.appendChild(spark);
    }

    function startGame() {
      stopGame(false);
      score = 0; combo = 0; timeLeft = 25; lastHit = 0;
      scoreEl.textContent = '0';
      comboEl.textContent = 'x0';
      timeEl.textContent = '25с';
      progress.style.width = '100%';
      result.textContent = 'Лови искры! Золотые дают больше очков.';
      running = true;
      overlay.classList.add('open');
      spawnSpark();
      spawnTimer = setInterval(spawnSpark, 520);
      timer = setInterval(() => {
        timeLeft--;
        timeEl.textContent = timeLeft + 'с';
        progress.style.width = (timeLeft / 25 * 100) + '%';
        if (timeLeft <= 0) {
          stopGame(true);
          timeEl.textContent = '0с';
        }
      }, 1000);
    }

    document.querySelectorAll('.egg-dot').forEach(dot => {
      if (dot.dataset.eggReady) return;
      dot.dataset.eggReady = '1';
      dot.addEventListener('click', startGame);
    });
    closeBtn.addEventListener('click', () => {
      stopGame(false);
      overlay.classList.remove('open');
    });
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        stopGame(false);
        overlay.classList.remove('open');
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) {
        stopGame(false);
        overlay.classList.remove('open');
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initEasterEgg);
  else initEasterEgg();
})();