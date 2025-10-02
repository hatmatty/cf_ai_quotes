document.addEventListener("DOMContentLoaded", async () => {
  const searchInput = document.getElementById("search-input");
  const searchResultsContainer = document.getElementById("search-results");
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
      const response = await fetch("/api/quotes");
      if (!response.ok) throw new Error("Network response was not ok");
      const data = await response.json();
      searchResultsContainer.innerHTML = "";
      if (Array.isArray(data.results)) {
        data.results.forEach((result) => {
          if (result.quote) {
            createQuoteBox(result.quote, result.id, searchResultsContainer, likedIds, { tags: result.tags, score: result.score, author: result.author });
          }
        });
      }
    } catch (error) {
      console.error("Error fetching all quotes:", error);
    }
  }

  async function renderSearch(query) {
    try {
      const response = await fetch(
        `/api/quotes/search?q=${encodeURIComponent(query)}`
      );
      if (!response.ok) throw new Error("Network response was not ok");
      const data = await response.json();
      searchResultsContainer.innerHTML = "";
      data.results.forEach((result) => {
        createQuoteBox(result.quote, result.id, searchResultsContainer, likedIds, { tags: result.tags, score: result.score });
      });
    } catch (error) {
      console.error("Error fetching search results:", error);
    }
  }

  // Initial load: show all puns by default
  renderAllQuotes();

  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async () => {
      const query = searchInput.value.trim();
      if (query !== "") {
        await renderSearch(query);
      } else {
        await renderAllQuotes();
      }
    }, 300); // Debounce timeout of 300ms
  });
});
