/* eslint-env browser, es2022 */
export async function syncMermaidThemeWithPage() {
  const mode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';

  // Pull helpers from the markdown loader, like the original does.
  const { setMermaidTheme, renderMermaidLazy } = await (window.KM?.ensureMarkdown?.() || Promise.resolve({}));

  // Update Mermaid's config to the new theme
  setMermaidTheme?.(mode);

  // Reset → re-run Mermaid for a given container
  async function resetAndRerender(root) {
    if (!root) return;
    root.querySelectorAll('.mermaid').forEach(el => {
      if (!el.dataset.mmdSrc) el.dataset.mmdSrc = el.textContent;
      if (el.querySelector('svg')) el.innerHTML = el.dataset.mmdSrc;
      el.removeAttribute('data-processed'); // Mermaid's own flag
      delete el.dataset.mmdDone;            // allow re-render guard to run again
    });
    await renderMermaidLazy?.(root);
  }

  // Main content
  await resetAndRerender(document.getElementById('content'));

  // Link previews (the preview HTML container is the first-level div)
  document.querySelectorAll('.km-link-preview').forEach(p => {
    resetAndRerender(p.querySelector(':scope > div'));
  });
}
