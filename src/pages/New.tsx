export default () => {
  return (
    <section class="new-quote-section container">
      <title>Quotes - Create a New Quote</title>
      <h1 class="page-title">Create a New Quote</h1>
      <form id="new-quote-form">
        <textarea
          id="quote-input"
          placeholder="Enter your quote here..."
          rows={5}
        ></textarea>
        <input id="author-input" placeholder="Author (optional)" />
        <div class="tag-select-row">
          <button type="button" id="select-tags-btn">Select tags</button>
          <div id="selected-tags" class="tags"></div>
        </div>
        <button type="button" id="submit-quote">
          Submit Quote
        </button>
      </form>
      <div id="quote-preview-container">
        <h2 class="preview-title">Preview</h2>
        <div id="quote-preview"></div>
      </div>
      <div id="tag-modal" class="tag-modal" hidden>
        <div class="tag-modal-content">
          <div class="tag-modal-header">
            <h3>Select up to 3 tags</h3>
            <button type="button" id="tag-modal-close" aria-label="Close">✕</button>
          </div>
          <div id="tag-options" class="tag-options"></div>
          <div class="tag-modal-actions">
            <button type="button" id="tag-modal-apply">Apply</button>
          </div>
        </div>
      </div>
      <script src="/scripts/new.js" />
    </section>
  );
};


