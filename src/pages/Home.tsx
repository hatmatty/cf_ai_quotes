export default () => {
  return (
    <>
      <section class="search-section">
        <input
          type="text"
          id="search-input"
          placeholder="Describe a quote..."
        />
      </section>
      <section id="quotes-container" class="quote-grid"></section>
      <script src="/scripts/home.js" />
    </>
  );
};


