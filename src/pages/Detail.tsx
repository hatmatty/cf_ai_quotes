export default () => {
  return (
    <>
      <title>Quote Detail</title>
      <div class="quote-grid">
        <section id="quote-detail-section" class="quote-box">
          <div class="quote-text" id="quote-detail-text"></div>
          <div class="heart"></div>
        </section>
      </div>
      <section id="similar-quotes-section">
        <h2>Similar Quotes</h2>
        <div id="similar-quotes-container" class="quote-container quote-grid"></div>
      </section>
      <script src="/scripts/detail.js" />
    </>
  );
};


