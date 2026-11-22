const audio = document.getElementById('audio');
const seek = document.getElementById('seek');
const time = document.getElementById('time');
const play = document.getElementById('toggle');
const back = document.getElementById('back10');
const forward = document.getElementById('fwd10');
const rates = document.querySelectorAll('[data-speed]');

function formatTime(seconds) {
  const elapsed = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  return `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
}

function updateTime() {
  seek.value = audio.currentTime;
  time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
}

audio.addEventListener('loadedmetadata', () => {
  const ready = Number.isFinite(audio.duration) && audio.duration > 0;
  seek.max = ready ? audio.duration : 0;
  seek.disabled = back.disabled = forward.disabled = !ready;
  updateTime();
});
audio.addEventListener('timeupdate', updateTime);
audio.addEventListener('playing', () => { play.textContent = '일시정지'; });
audio.addEventListener('pause', () => { play.textContent = '재생'; });
audio.addEventListener('ended', () => { play.textContent = '재생'; });

seek.addEventListener('input', () => { audio.currentTime = seek.valueAsNumber; });
back.addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); });
forward.addEventListener('click', () => { audio.currentTime = Math.min(audio.duration, audio.currentTime + 10); });

play.addEventListener('click', async () => {
  if (!audio.paused) {
    audio.pause();
    return;
  }

  play.disabled = true;
  play.textContent = '준비 중…';
  try {
    await audio.loadListening();
    await audio.play();
  } catch {
    play.textContent = '다시 시도';
  } finally {
    play.disabled = false;
  }
});

for (const rate of rates) {
  rate.addEventListener('click', () => {
    const speed = Number(rate.dataset.speed);
    audio.defaultPlaybackRate = speed;
    audio.playbackRate = speed;
    for (const choice of rates) {
      choice.setAttribute('aria-pressed', String(choice === rate));
    }
  });
}
