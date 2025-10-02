document.addEventListener("DOMContentLoaded", async () => {
  const myQuotesContainer = document.getElementById("my-quotes-container");
  const likedContainer = document.getElementById("liked-container");
  const likedIds = new Set();

  try {
    const response = await fetch("/api/quotes/mine");
    if (!response.ok) throw new Error("Network response was not ok");
    const data = await response.json();
    // Build liked set first so created section hearts are pre-filled
    data.liked.forEach((result) => {
      likedIds.add(result.id);
    });
    // Now render created and liked sections
    if (Array.isArray(data.created) && data.created.length > 0) {
      data.created.forEach((result) => {
        createQuoteBox(result.quote, result.id, myQuotesContainer, likedIds, { tags: result.tags, score: result.score, author: result.author });
      });
    } else {
      const none = document.createElement('div');
      none.className = 'empty-text';
      none.textContent = 'None';
      myQuotesContainer.appendChild(none);
    }

    if (Array.isArray(data.liked) && data.liked.length > 0) {
      data.liked.forEach((result) => {
        createQuoteBox(result.quote, result.id, likedContainer, likedIds, { tags: result.tags, score: result.score, author: result.author });
      });
    } else {
      const none = document.createElement('div');
      none.className = 'empty-text';
      none.textContent = 'None';
      likedContainer.appendChild(none);
    }
  } catch (error) {
    console.error("Error fetching my quotes:", error);
  }
});
