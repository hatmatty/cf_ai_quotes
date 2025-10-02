document.addEventListener('DOMContentLoaded', () => {
    const quoteInput = document.getElementById('quote-input');
    const quotePreviewContainer = document.getElementById('quote-preview');
    const authorInput = document.getElementById('author-input');
    const selectTagsBtn = document.getElementById('select-tags-btn');
    const selectedTagsWrap = document.getElementById('selected-tags');
    const tagModal = document.getElementById('tag-modal');
    const tagOptions = document.getElementById('tag-options');
    const tagModalClose = document.getElementById('tag-modal-close');
    const tagModalApply = document.getElementById('tag-modal-apply');
    let selectedTags = [];
  function getTagColors() {
    return (window.__tagColors || {});
  }
  function updateSelectTagsIndicator() {
    if (!selectTagsBtn) return;
    const isRequired = !selectedTags || selectedTags.length === 0;
    selectTagsBtn.classList.toggle('required', isRequired);
    if (isRequired) {
      selectTagsBtn.setAttribute('aria-required', 'true');
    } else {
      selectTagsBtn.removeAttribute('aria-required');
    }
  }
    async function loadTags() {
      try {
        const resp = await fetch('/api/tags');
        const data = await resp.json();
      // Cache for reuse in chips and preview
      window.__tagColors = data.tags || {};
        const tags = Object.keys(data.tags || {});
        tagOptions.innerHTML = '';
        tags.forEach((t) => {
          const item = document.createElement('label');
          item.className = 'tag-option';
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.value = t;
        // Pre-check inputs for previously selected tags so users can unselect
        input.checked = Array.isArray(selectedTags) && selectedTags.includes(t);
        const swatch = document.createElement('span');
        swatch.className = 'tag-swatch';
        const colors = getTagColors();
        if (colors[t]) {
          swatch.style.backgroundColor = colors[t];
        }
          input.addEventListener('change', () => {
            const next = new Set(selectedTags);
            if (input.checked) {
              if (next.size >= 3) {
                input.checked = false;
                return;
              }
              next.add(t);
            } else {
              next.delete(t);
            }
            selectedTags = Array.from(next);
          updateSelectTagsIndicator();
          });
          const span = document.createElement('span');
          span.textContent = t;
          item.appendChild(input);
        item.appendChild(swatch);
          item.appendChild(span);
          tagOptions.appendChild(item);
        });
      } catch (e) {
        console.error('Failed to load tags', e);
      }
    }

    function renderSelectedTags() {
      selectedTagsWrap.innerHTML = '';
    const colors = getTagColors();
    selectedTags.forEach((t) => {
      const chip = document.createElement('span');
      chip.className = 'tag';
      chip.textContent = t;
      const color = colors[t];
      if (color) {
        chip.style.backgroundColor = color;
        chip.style.color = '#ffffff';
        chip.style.borderColor = 'transparent';
      }
      selectedTagsWrap.appendChild(chip);
    });
    }

    if (selectTagsBtn) {
      selectTagsBtn.addEventListener('click', async () => {
        if (tagModal) {
          tagModal.hidden = false;
          await loadTags();
        }
      });
    }
    if (tagModalClose) {
      tagModalClose.addEventListener('click', () => {
        tagModal.hidden = true;
      });
    }
    if (tagModalApply) {
      tagModalApply.addEventListener('click', () => {
        tagModal.hidden = true;
        renderSelectedTags();
      updateSelectTagsIndicator();
      updatePreview();
      });
    }
    const previewTitle = document.querySelector('#quote-preview-container .preview-title');
    const submitQuoteButton = document.getElementById('submit-quote');

    // Hide preview on first load
    if (previewTitle) previewTitle.style.display = 'none';

    function updatePreview() {
      const quote = quoteInput.value;
      quotePreviewContainer.innerHTML = "";
      if (quote && quote.trim().length > 0) {
        const author = authorInput ? authorInput.value : '';
        const tags = (selectedTags || []).join(', ');
        createQuoteBox(quote, null, quotePreviewContainer, undefined, { tags, author, disableLink: true, showReactions: false });
        if (previewTitle) previewTitle.style.display = 'block';
      } else {
        if (previewTitle) previewTitle.style.display = 'none';
      }
    }

    quoteInput.addEventListener('input', updatePreview);
    if (authorInput) {
      authorInput.addEventListener('input', updatePreview);
    }

    submitQuoteButton.addEventListener('click', async () => {
      const quote = quoteInput.value;
      const author = authorInput ? authorInput.value : '';
      const tags = selectedTags.join(', ');
      if (quote.trim() !== "") {
        try {
          if (!selectedTags || selectedTags.length < 1) {
            alert('Please select at least one tag (up to 3).');
            return;
          }
          const response = await fetch('/api/quotes', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ quote, author, tags })
          });
          if (response.ok) {
            alert('Quote submitted successfully!');
            window.location.href = '/me';
            quoteInput.value = "";
            if (authorInput) authorInput.value = '';
            selectedTags = [];
            renderSelectedTags();
            updatePreview();
            quotePreviewContainer.innerHTML = "";
            if (previewTitle) previewTitle.style.display = 'none';
          } else {
            let errMsg = 'Failed to submit quote.';
            try {
              const data = await response.json();
              if (data && data.error) errMsg = data.error;
            } catch {}
            alert(errMsg);
          }
        } catch (error) {
          console.error('Error submitting quote:', error);
          alert('Failed to submit quote. Please try again.');
        }
      } else {
        alert('Please enter a quote before submitting.');
      }
    });
  // Initialize required indicator on first load
  updateSelectTagsIndicator();
  });

