(function () {
  function initEasterEgg() {
    document.querySelectorAll('footer p').forEach(p => {
      if (p.querySelector('.egg-dot')) return;
      const dot=document.createElement('button');dot.type='button';dot.className='egg-dot';
      dot.setAttribute('aria-label','Открыть секретную мини-игру');dot.title='Секрет FIREON';p.appendChild(dot);
    });
    let overlay=document.getElementById('egg-overlay');
    if(!overlay){
      overlay=document.createElement('div');overlay.id='egg-overlay';overlay.className='egg-overlay';
      overlay.innerHTML=`
      <div class="egg-game" role="dialog" aria-modal="true" aria-label="Хранитель огня">
        <div class="egg-kicker">FIREON / ENDLESS MODE</div><h3>Хранитель огня</h3>
        <p>Защищай искру от порывов ветра и капель воды. Нажимай на опасности, пока они не добрались до огня.</p>
        <div class="egg-stats"><span>Очки: <strong id="egg-score">0</strong></span><span>Жар: <strong id="egg-heat">100%</strong></span><span>Рекорд: <strong id="egg-best">0</strong></span></div>
        <div class="egg-heatbar"><span id="egg-heatbar"></span></div>
        <div class="egg-field" id="egg-field"><div class="egg-core" id="egg-core"><i></i></div></div>
        <p class="egg-result" id="egg-result" aria-live="polite">Нажми «Начать» и не дай огню погаснуть.</p>
        <div class="egg-actions"><button type="button" class="egg-start" id="egg-start">Начать</button><button type="button" class="egg-close" id="egg-close">Закрыть</button></div>
      </div>`;
      document.body.appendChild(overlay);
    }
    const field=overlay.querySelector('#egg-field'),scoreEl=overlay.querySelector('#egg-score'),heatEl=overlay.querySelector('#egg-heat'),bestEl=overlay.querySelector('#egg-best'),bar=overlay.querySelector('#egg-heatbar'),core=overlay.querySelector('#egg-core'),result=overlay.querySelector('#egg-result'),start=overlay.querySelector('#egg-start'),close=overlay.querySelector('#egg-close');
    let score=0,heat=100,best=0,running=false,spawnLoop=null,frameLoop=null,last=0,hazards=[];
    try{best=Number(localStorage.getItem('fireon_egg_best')||0)}catch(e){} bestEl.textContent=best;
    function paint(){heat=Math.max(0,Math.min(100,heat));heatEl.textContent=Math.ceil(heat)+'%';bar.style.width=heat+'%';core.style.setProperty('--flame-power',heat/100);core.classList.toggle('weak',heat<35);}
    function endGame(){
      running=false;clearInterval(spawnLoop);cancelAnimationFrame(frameLoop);hazards.forEach(h=>h.el.remove());hazards=[];
      core.classList.add('extinguished');result.textContent='Искра погасла. Итог: '+score+' очков. Нажми «Начать», чтобы попробовать снова.';start.textContent='Ещё раз';
      if(score>best){best=score;bestEl.textContent=best;try{localStorage.setItem('fireon_egg_best',String(best))}catch(e){}}
    }
    function damage(amount,msg){if(!running)return;heat-=amount;result.textContent=msg;paint();if(heat<=0)endGame();}
    function spawn(){
      if(!running)return;
      const type=Math.random()<.43?'water':Math.random()<.52?'wind':'ember';
      const el=document.createElement('button');el.type='button';el.className='egg-hazard '+type;
      el.textContent=type==='water'?'💧':type==='wind'?'〰':'✦';
      el.setAttribute('aria-label',type==='water'?'Капля воды: нажми, чтобы убрать':type==='wind'?'Порыв ветра: нажми, чтобы убрать':'Искра: +очки');
      const angle=Math.random()*Math.PI*2, radius=Math.max(field.clientWidth,field.clientHeight)*.62;
      const cx=field.clientWidth/2,cy=field.clientHeight/2;
      const x=Math.max(15,Math.min(field.clientWidth-15,cx+Math.cos(angle)*radius));
      const y=Math.max(15,Math.min(field.clientHeight-15,cy+Math.sin(angle)*radius));
      el.style.left=x+'px';el.style.top=y+'px';field.appendChild(el);
      const h={el,type,x,y,life:0};hazards.push(h);
      el.addEventListener('click',()=>{if(!running||!hazards.includes(h))return;hazards=hazards.filter(v=>v!==h);el.remove();if(type==='ember'){score+=3;scoreEl.textContent=score;heat=Math.min(100,heat+4);paint();result.textContent='Поймал искру! +3 очка и немного жара.'}else{score+=1;scoreEl.textContent=score;result.textContent=type==='water'?'Капля устранена!':'Порыв ветра рассеян!';}});
    }
    function tick(now){
      if(!running)return;const dt=Math.min(40,now-last||16);last=now;
      const cx=field.clientWidth/2,cy=field.clientHeight/2;
      hazards.forEach(h=>{
        const dx=cx-h.x,dy=cy-h.y,d=Math.hypot(dx,dy)||1;
        const speed=(h.type==='water'?0.052:h.type==='wind'?0.068:0.04)*dt*(1+score/180);
        h.x+=dx/d*speed;h.y+=dy/d*speed;h.el.style.left=h.x+'px';h.el.style.top=h.y+'px';
        if(d<30){h.el.remove();h.hit=true;damage(h.type==='water'?27:h.type==='wind'?18:0,h.type==='water'?'Вода попала в огонь! -27 жара':'Ветер сдул часть пламени! -18 жара');}
      });
      hazards=hazards.filter(h=>!h.hit&&h.el.isConnected);
      if(running)frameLoop=requestAnimationFrame(tick);
    }
    function startGame(){
      clearInterval(spawnLoop);cancelAnimationFrame(frameLoop);hazards.forEach(h=>h.el.remove());hazards=[];
      score=0;heat=100;running=true;last=0;scoreEl.textContent='0';start.textContent='Заново';core.classList.remove('extinguished');paint();
      result.textContent='Огонь горит. Убирай воду и ветер до столкновения!';spawn();spawnLoop=setInterval(spawn,850);frameLoop=requestAnimationFrame(tick);
    }
    document.querySelectorAll('.egg-dot').forEach(dot=>{if(dot.dataset.eggBound==='1')return;dot.dataset.eggBound='1';const openGame=()=>{overlay.classList.add('open');};dot.addEventListener('click',openGame);dot.addEventListener('pointerup',e=>{if(e.pointerType==='touch')openGame();});});
    start.addEventListener('click',startGame);
    function closeGame(){running=false;clearInterval(spawnLoop);cancelAnimationFrame(frameLoop);hazards.forEach(h=>h.el.remove());hazards=[];overlay.classList.remove('open');}
    close.addEventListener('click',closeGame);overlay.addEventListener('click',e=>{if(e.target===overlay)closeGame()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay.classList.contains('open'))closeGame()});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initEasterEgg);else initEasterEgg();
})();