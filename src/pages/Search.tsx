export default () => {
  return (
    <>
      <title>Quotes Search</title>
      <section class="search-section">
        <input
          type="text"
          id="search-input"
          placeholder="Search for a quote..."
        />
      </section>
      <section id="search-results" class="quote-grid"></section>
      <script src="/scripts/search.js" />
    </>
  );
};


