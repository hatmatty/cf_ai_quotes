export default () => {
  return (
    <>
      <title>Quotes - Me</title>
      <section class="my-quotes-section">
        <h1 class="page-title">My Quotes</h1>
        <h2 class="subheading">Quotes I created</h2>
        <div id="my-quotes-container" class="quote-grid"></div>
        <h2 class="subheading">Quotes I liked</h2>
        <div id="liked-container" class="quote-grid"></div>
      </section>
      <script src="/scripts/me.js" />
    </>
  );
};


