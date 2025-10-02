document.addEventListener('DOMContentLoaded', async () => {
  const searchInput = document.getElementById('search-input');
  const container = document.getElementById('quotes-container');
  const likedIds = new Set();

  try {
    const mineResp = await fetch('/api/quotes/mine');
    if (mineResp.ok) {
      const mine = await mineResp.json();
      if (Array.isArray(mine.liked)) {
        mine.liked.forEach(item => likedIds.add(item.id));
      }
    }
  } catch {}
  
  let debounceTimeout;

  async function renderAllQuotes() {
    try {
      const response = await fetch('/api/quotes');
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      container.innerHTML = '';
      if (Array.isArray(data.results)) {
        data.results.forEach(result => {
          if (result.quote) {
            createQuoteBox(result.quote, result.id, container, likedIds, { 
              tags: result.tags, 
              score: result.score, 
              author: result.author 
            });
          }
        });
      }
    } catch (error) {
      console.error('Error fetching all quotes:', error);
    }
  }

  async function renderSearch(query) {
    // Show loading indicator
    container.innerHTML = '<p class="loading-indicator">Searching for quotes</p>';
    
    try {
      const response = await fetch(
        `/api/quotes/search?q=${encodeURIComponent(query)}`
      );
      if (!response.ok) {
        console.error('Search API returned error:', response.status);
        container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 40px;">Search failed. Please try again.</p>';
        return;
      }
      const data = await response.json();
      container.innerHTML = '';
      
      if (!data.results || data.results.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 40px;">No quotes found matching your search.</p>';
        return;
      }
      
      data.results.forEach(result => {
        createQuoteBox(result.quote, result.id, container, likedIds, { 
          tags: result.tags, 
          score: result.score,
          author: result.author
        });
      });
    } catch (error) {
      console.error('Error fetching search results:', error);
      container.innerHTML = '<p style="text-align: center; color: #ef4444; padding: 40px;">An error occurred. Please try again.</p>';
    }
  }

  // Initial load: show all quotes by default
  renderAllQuotes();

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async () => {
      const query = searchInput.value.trim();
      if (query !== '') {
        await renderSearch(query);
      } else {
        await renderAllQuotes();
      }
    }, 300); // Debounce timeout of 300ms
  });
});
