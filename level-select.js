const saveKey = 'level-devil-save-v3';
const maximumLevel = 100;
const chapters = [
  { name: 'Warm-up', start: 1, end: 20, note: 'Find your feet. The devil is only warming up.', hue: '#8bf2c0' },
  { name: 'Tricky', start: 21, end: 40, note: 'Pits and surprises start getting in your way.', hue: '#ffd274' },
  { name: 'No mercy', start: 41, end: 60, note: 'Mind the gaps. A safe-looking step might not be.', hue: '#ff9b72' },
  { name: 'Mind games', start: 61, end: 80, note: 'Some platforms will crumble beneath your feet.', hue: '#c89dff' },
  { name: 'Devil mode', start: 81, end: 100, note: 'Every trick in the book. And a few new ones.', hue: '#ff6d91' },
];

function getUnlockedLevel() {
  try {
    const saved = localStorage.getItem(saveKey);
    if (saved) {
      const level = JSON.parse(saved).highestUnlocked;
      return Number.isInteger(level) ? Math.max(1, Math.min(maximumLevel, level)) : 1;
    }
    const previousSave = Number(localStorage.getItem('level-devil-progress-v2'));
    return Number.isInteger(previousSave) ? Math.max(1, Math.min(maximumLevel, previousSave)) : 1;
  } catch (error) {
    console.warn('Could not read saved GT progress.', error);
    return 1;
  }
}

function createChapterCard(chapter, highestUnlocked, selectedLevel) {
  const card = document.createElement('section');
  card.className = 'chapter-card';

  const heading = document.createElement('div');
  heading.className = 'chapter-card-heading';

  const details = document.createElement('div');
  details.className = 'chapter-card-title';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'toolbar-label';
  eyebrow.textContent = `LEVELS ${String(chapter.start).padStart(2, '0')}–${String(chapter.end).padStart(2, '0')}`;
  const title = document.createElement('h2');
  title.textContent = chapter.name;
  title.style.color = chapter.hue;
  const note = document.createElement('p');
  note.textContent = chapter.note;
  details.append(eyebrow, title, note);

  const unlockedInChapter = Math.max(0, Math.min(chapter.end, highestUnlocked) - chapter.start + 1);
  const badge = document.createElement('span');
  badge.className = 'level-count';
  badge.textContent = `${unlockedInChapter} / 20 unlocked`;
  heading.append(details, badge);

  const grid = document.createElement('div');
  grid.className = 'chapter-levels';
  grid.setAttribute('aria-label', `${chapter.name} levels`);
  for (let level = chapter.start; level <= chapter.end; level += 1) {
    const unlocked = level <= highestUnlocked;
    const current = level === selectedLevel;
    const button = document.createElement(unlocked ? 'a' : 'button');
    button.className = `level-button${current ? ' is-current' : ''}${level < highestUnlocked ? ' is-complete' : ''}`;
    button.textContent = String(level).padStart(2, '0');
    if (unlocked) {
      button.href = `index.html?level=${level}`;
      button.setAttribute('aria-label', `Play level ${level}`);
      if (current) button.setAttribute('aria-current', 'page');
    } else {
      button.type = 'button';
      button.disabled = true;
      button.setAttribute('aria-label', `Level ${level}, locked`);
    }
    grid.append(button);
  }

  card.append(heading, grid);
  return card;
}

const highestUnlocked = getUnlockedLevel();
const requestedLevel = Number(new URLSearchParams(window.location.search).get('level'));
const selectedLevel = Number.isInteger(requestedLevel) && requestedLevel >= 1 && requestedLevel <= highestUnlocked
  ? requestedLevel
  : highestUnlocked;
const unlockedCount = document.querySelector('#unlockedCount');
unlockedCount.innerHTML = `${highestUnlocked} <span>/ 100</span>`;
document.querySelector('#unlockedProgress').style.width = `${highestUnlocked}%`;
document.querySelector('#backToGame').href = `index.html?level=${selectedLevel}`;
document.querySelector('#chapterList').replaceChildren(
  ...chapters.map((chapter) => createChapterCard(chapter, highestUnlocked, selectedLevel)),
);
