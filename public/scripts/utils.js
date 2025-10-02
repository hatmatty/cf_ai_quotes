// Reusable client side JS utils
function createQuoteBox(quote, id, container, likedIds, opts) {
  const options = opts || {};
  const tagsCsv = options.tags || '';
  const author = options.author || '';
  const score = typeof options.score === 'number' ? options.score : undefined;
  const disableLink = !!options.disableLink;
  const showReactions = options && options.showReactions === false ? false : true;
  const lines = quote.split("\n");
  const first = lines[0];
  const rest = lines.slice(1);

  const box = document.createElement("div");
  box.classList.add("pun-box");

  const contentEl = document.createElement("div");
  contentEl.classList.add("pun-text");
  const openQuote = document.createElement('span');
  openQuote.textContent = '"';
  const textEl = document.createElement('span');
  textEl.textContent = first;
  const closeQuote = document.createElement('span');
  closeQuote.textContent = '"';
  contentEl.appendChild(openQuote);
  contentEl.appendChild(textEl);
  contentEl.appendChild(closeQuote);
  box.appendChild(contentEl);

  let timeouts = [];
  let revealed = false;

  if (rest.length > 0) {
    const fistEmoji = document.createElement("div");
    fistEmoji.classList.add("fist-emoji");
    fistEmoji.textContent = "\n🥊";
    box.appendChild(fistEmoji);

    box.addEventListener("mouseover", () => {
      if (!revealed) {
        clearTimeouts(timeouts);
        textEl.textContent = first;
        rest.forEach((line, index) => {
          const timeout = setTimeout(() => {
            if (index === rest.length - 1) {
              fistEmoji.remove();
            }
            textEl.textContent += "\n" + line;
          }, 200 * (index + 1));
          timeouts.push(timeout);
        });
        revealed = true;
      }
    });
  }

  if (showReactions) {
    const heart = document.createElement("button");
    heart.type = 'button';
    heart.classList.add("heart");
    heart.setAttribute('aria-pressed', 'false');
    heart.setAttribute('aria-label', 'Upvote quote');
    box.appendChild(heart);

    if (likedIds && id && likedIds.has(id)) {
      heart.classList.add("liked");
    }

    heart.addEventListener("click", async (e) => {
      e.stopPropagation();
      // Single shared busy flag to prevent race across heart/down
      if (box.dataset.interactionBusy === '1') return;
      box.dataset.interactionBusy = '1';

      const down = box.querySelector('.downvote');
      const wasLiked = heart.classList.contains('liked');
      const wasDown = !!(down && down.classList.contains('active'));

      // Determine transition
      const prev = wasLiked ? 'like' : (wasDown ? 'dislike' : 'none');
      const next = wasLiked ? 'none' : 'like';

      // Optimistic UI updates
      heart.classList.toggle('liked', next === 'like');
      heart.setAttribute('aria-pressed', String(next === 'like'));
      if (down) down.classList.toggle('active', next === 'dislike'); // ensures mutual exclusion
      if (likedIds && id) {
        if (next === 'like') likedIds.add(id); else likedIds.delete(id);
      }
      const deltaMap = {
        'none->like': 1,
        'like->none': -1,
        'dislike->like': 2
      };
      const key = `${prev}->${next}`;
      const delta = deltaMap[key] || 0;
      let scoreEl = box.querySelector('.score');
      if (!scoreEl) {
        scoreEl = document.createElement('div');
        scoreEl.classList.add('score');
        scoreEl.textContent = '0';
        box.appendChild(scoreEl);
      }
      const before = Number(scoreEl.textContent || '0');
      scoreEl.textContent = String(before + delta);

      try {
        if (id) {
          const desired = next === 'like' ? 1 : 0;
          const resp = await fetch(`/api/quotes/${id}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ vote: desired }) });
          if (resp.ok) {
            const body = await resp.json();
            // Reconcile UI with server truth
            const canonicalVote = Number(body.vote || 0);
            const canonicalScore = Number(body.score || 0);
            heart.classList.toggle('liked', canonicalVote === 1);
            heart.setAttribute('aria-pressed', String(canonicalVote === 1));
            if (down) down.classList.toggle('active', canonicalVote === -1);
            if (scoreEl) scoreEl.textContent = String(canonicalScore);
          }
        }
      } catch (error) {
        console.error('Error toggling like:', error);
        // Revert UI
        heart.classList.toggle('liked', wasLiked);
        heart.setAttribute('aria-pressed', String(wasLiked));
        if (down) down.classList.toggle('active', wasDown);
        scoreEl.textContent = String(before);
      } finally {
        delete box.dataset.interactionBusy;
      }
    });
  }

  // Downvote button
  if (showReactions) {
    const down = document.createElement('button');
    down.type = 'button';
    down.classList.add('downvote');
    down.setAttribute('aria-pressed', 'false');
    down.setAttribute('aria-label', 'Downvote quote');
    box.appendChild(down);
    down.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (box.dataset.interactionBusy === '1') return;
      box.dataset.interactionBusy = '1';
      const heart = box.querySelector('.heart');
      const wasDown = down.classList.contains('active');
      const wasLiked = !!(heart && heart.classList.contains('liked'));

      const prev = wasLiked ? 'like' : (wasDown ? 'dislike' : 'none');
      const next = wasDown ? 'none' : 'dislike';

      // Optimistic UI
      down.classList.toggle('active', next === 'dislike');
      down.setAttribute('aria-pressed', String(next === 'dislike'));
      if (heart) {
        heart.classList.toggle('liked', next === 'like');
        heart.setAttribute('aria-pressed', String(next === 'like'));
      }
      if (likedIds && id) {
        if (next === 'like') likedIds.add(id); else likedIds.delete(id);
      }
      const deltaMap = {
        'none->dislike': -1,
        'dislike->none': 1,
        'like->dislike': -2
      };
      const key = `${prev}->${next}`;
      const delta = deltaMap[key] || 0;
      let scoreEl = box.querySelector('.score');
      if (!scoreEl) {
        scoreEl = document.createElement('div');
        scoreEl.classList.add('score');
        scoreEl.textContent = '0';
        box.appendChild(scoreEl);
      }
      const before = Number(scoreEl.textContent || '0');
      scoreEl.textContent = String(before + delta);

      try {
        if (id) {
          const desired = next === 'dislike' ? -1 : 0;
          const resp = await fetch(`/api/quotes/${id}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ vote: desired }) });
          if (resp.ok) {
            const body = await resp.json();
            const canonicalVote = Number(body.vote || 0);
            const canonicalScore = Number(body.score || 0);
            down.classList.toggle('active', canonicalVote === -1);
            down.setAttribute('aria-pressed', String(canonicalVote === -1));
            if (heart) {
              heart.classList.toggle('liked', canonicalVote === 1);
              heart.setAttribute('aria-pressed', String(canonicalVote === 1));
            }
            if (scoreEl) scoreEl.textContent = String(canonicalScore);
          }
        }
      } catch (err) {
        console.error('Error toggling dislike:', err);
        // Revert UI
        down.classList.toggle('active', wasDown);
        down.setAttribute('aria-pressed', String(wasDown));
        if (heart) {
          heart.classList.toggle('liked', wasLiked);
          heart.setAttribute('aria-pressed', String(wasLiked));
        }
        scoreEl.textContent = String(before);
      } finally {
        delete box.dataset.interactionBusy;
      }
    });
  }

  // Score label
  if (typeof score === 'number') {
    const scoreEl = document.createElement('div');
    scoreEl.classList.add('score');
    scoreEl.textContent = String(score);
    box.appendChild(scoreEl);
  }

  // Tags chips
  if (tagsCsv && typeof tagsCsv === 'string') {
    const tagWrap = document.createElement('div');
    tagWrap.classList.add('tags');
    const tags = tagsCsv.split(',').map((t) => t.trim()).filter(Boolean);
    // Fetch color mapping once and cache
    // Basic cache: attach to window
    const ensureTags = async () => {
      try {
        if (!window.__tagColors) {
          const resp = await fetch('/api/tags');
          const data = await resp.json();
          window.__tagColors = data.tags || {};
        }
      } catch {}
    };
    ensureTags().then(() => {
      const colors = window.__tagColors || {};
      tags.forEach((tag) => {
        const chip = document.createElement('span');
        chip.classList.add('tag');
        chip.textContent = tag;
        const color = colors[tag];
        if (color) {
          chip.style.backgroundColor = color;
          chip.style.color = '#fff';
        }
        tagWrap.appendChild(chip);
      });
    });
    box.appendChild(tagWrap);
  }

  if (author) {
    const authorEl = document.createElement('div');
    authorEl.className = 'author-line';
    authorEl.textContent = `— ${author}`;
    box.appendChild(authorEl);
  }

  if (id && !disableLink) {
    // Make the entire card clickable except the heart
    box.addEventListener("click", (e) => {
      if (!id) return;
      const target = e.target;
      if (target && target.closest && (target.closest('.heart') || target.closest('.downvote'))) return;
      window.location.href = `/quotes/${id}`;
    });
    box.setAttribute('role', 'link');
    box.setAttribute('tabindex', '0');
    box.addEventListener('keydown', (e) => {
      if (!id) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.href = `/quotes/${id}`;
      }
    });
  }

  container.appendChild(box);
}

function clearTimeouts(timeouts) {
  timeouts.forEach((timeout) => clearTimeout(timeout));
  timeouts.length = 0;
}
