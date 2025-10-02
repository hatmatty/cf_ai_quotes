document.addEventListener('DOMContentLoaded', async () => {
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

      const response = await fetch('/api/quotes');
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      if (!data.results || !Array.isArray(data.results)) throw new Error('Invalid data format');
      data.results.forEach(result => {
        if (result.quote) {
          createQuoteBox(result.quote, result.id, container, likedIds, { tags: result.tags, score: result.score, author: result.author });
        }
      });
    } catch (error) {
      console.error('Error fetching quotes:', error);
    }
  });
