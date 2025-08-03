window.CONFIG = {
  // Appears above the search box and in the <title>
  TITLE   : '⟪ Title of your wiki ⟫',

  // Any png / ico / svg file you like
  FAVICON : 'icons/wiki32.png',

  // Raw Markdown bundle (one file, many pages)
  MD : 'https://hackmd.io/@h-s-n/doc_test/download',

  // List every Highlight.js language you want available
  LANGS  : [
    'javascript',
    'bash',
    'markdown',
    'python'
    // add or remove freely …
  ],

  /* graph palette  */
  GRAPH_COLORS: {
    // node fills
    parent : '#8a8a8a',   // pages that have children
    leaf   : '#569cd6',   // pages with no children

    // links
    hier   : '#555555',   // hierarchy lines
    tag    : '#444444',   // same-tag cross-links

    // text & extras
    label  : '#aaaaaa',   // node labels
  }
};
