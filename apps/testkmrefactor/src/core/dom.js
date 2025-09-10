/* eslint-env browser, es2022 */
export const DOC = document;

export const whenIdle = (cb, timeout = 1500) =>
  'requestIdleCallback' in window
    ? requestIdleCallback(cb, { timeout })
    : setTimeout(cb, 0);

export const domReady = () =>
  DOC.readyState !== 'loading'
    ? Promise.resolve()
    : new Promise(res =>
        DOC.addEventListener('DOMContentLoaded', res, { once: true })
      );

export const clearSelection = () => {
  const sel = window.getSelection?.();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
};

export const baseURLNoHash = () => location.href.replace(/#.*$/, '');
