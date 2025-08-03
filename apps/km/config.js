window.CONFIG = {
  // Appears above the search box and in the <title>
  TITLE   : 'Title of your wiki',

  // Any png / ico / svg file you like
  FAVICON : 'https://raw.githubusercontent.com/erw-1/erw.one/refs/heads/main/files/img/preview.png',

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
    parent : '#555555',   // pages that have children
    leaf   : '#444444',   // pages with no children

    // links
    hier   : '#555555',   // hierarchy lines
    tag    : '#4e606e',   // same-tag cross-links

    // text & extras
    label  : '#aaaaaa',   // node labels
  }
};
