document.addEventListener("DOMContentLoaded", async () => {
  const quoteId = window.location.pathname.split("/").pop();
  const quoteDetailText = document.getElementById("quote-detail-text");
  const similarQuotesContainer = document.getElementById("similar-quotes-container");
  const detailSection = document.getElementById('quote-detail-section');
  const likedIds = new Set();

  try {
    // Fetch liked ids to set initial heart state inside shared card
    try {
      const mineResp = await fetch('/api/quotes/mine');
      if (mineResp.ok) {
        const mine = await mineResp.json();
        if (Array.isArray(mine.liked)) {
          mine.liked.forEach(item => likedIds.add(item.id));
        }
      }
    } catch {}

    // Fetch quote detail
    const response = await fetch(`/api/quotes/${quoteId}`);
    if (!response.ok) throw new Error("Network response was not ok");
    const data = await response.json();

    // Always render using the shared card component so like/dislike work here too
    detailSection.innerHTML = '';
    const temp = document.createElement('div');
    createQuoteBox(
      data.quote,
      quoteId,
      temp,
      likedIds,
      { tags: data.tags, author: data.author, score: data.score, disableLink: true }
    );
    while (temp.firstChild) detailSection.appendChild(temp.firstChild);

    // Also mirror the text in the hidden placeholder for accessibility
    if (quoteDetailText) quoteDetailText.textContent = data.quote;

    // Fetch similar quotes
    const similarResponse = await fetch(`/api/quotes/${quoteId}/similar`);
    if (!similarResponse.ok) throw new Error("Network response was not ok");
    const similarData = await similarResponse.json();
    const seenIds = new Set();
    (similarData.results || []).forEach((result) => {
      if (!result || !result.id || seenIds.has(result.id)) return;
      seenIds.add(result.id);
      createQuoteBox(result.quote, result.id, similarQuotesContainer, likedIds, {
        tags: result.tags,
        author: result.author,
        score: result.score,
      });
    });
  } catch (error) {
    console.error("Error fetching quote details or similar quotes:", error);
  }
});
