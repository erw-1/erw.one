/*
 * Pure navigation rendering for the sidebar tree, breadcrumbs, TOC, prev/next,
 * and related links. Model helpers decide ordering; this module builds DOM.
 *
 * This file intentionally does not parse markdown or decide page relationships.
 * wiki.js answers questions like "what are this page's children?" and "what is
 * related?". nav.js turns those answers into clickable UI.
 */
import { DOC, $, $$, CONTENT_SEL, HEADINGS_SEL, SIDEWAYS_CARET, el } from '../core/runtime.js'
import { t } from '../core/i18n.js'
import {
	wikiStore,
	comparePagesByTitle,
	getPageHash,
	getPageTrail,
	getReadingTrail,
	getRelatedPages,
	getSidebarRoots,
	getSiblingNav,
	isSimpleFolderPage
} from '../wiki.js'

// Small downward triangle used for the child-page breadcrumb dropdown.
const DOWN_CARET = '\u25BE'

// Headings can include a visual fold caret in their textContent. The TOC should
// show only the clean heading label, so this removes a trailing sideways caret.
const TOC_FOLD_SUFFIX_RE = new RegExp(`\\s*${SIDEWAYS_CARET}\\s*$`)

// When the active TOC item changes, keep a little breathing room above/below it
// instead of pinning it exactly to the edge of the scroll box.
const TOC_SCROLL_PADDING = 12

// IntersectionObserver used by the TOC. It is stored here so renderToc() can
// disconnect the old observer before observing headings on a new page.
let tocObserver = null

// Sort a copy of a page array when a sorter is provided.
//
// Returning a copy matters because callers may pass real children arrays from
// wiki.js. Sorting those in place would silently change navigation order
// elsewhere.
const sortedPages = (pages, sorter) =>
	sorter ? pages.slice().sort(sorter) : pages

// Create the small separator used between breadcrumb entries.
const createBreadcrumbSeparator = () =>
	el('span', { class: 'separator', textContent: SIDEWAYS_CARET })

// Build a TOC link hash.
//
// Page hash "drones#intro" and heading id "1_2" becomes
// "#drones#intro#1_2". If the current page is the root and has no page hash,
// the result is simply "#1_2".
const buildTocHref = (pageHash, headingId) =>
	'#' + (pageHash ? pageHash + '#' : '') + headingId

// Create a normal clickable page link.
//
// Most navigation widgets need the same href/text behavior. `attrs` lets each
// caller add classes, aria labels, datasets, or custom text without repeating
// the base page-link code.
function createPageAnchor(page, attrs = {}) {
	return el('a', {
		...attrs,
		// getPageHash(page) already knows the full tree path for this page.
		href: '#' + getPageHash(page),
		// Use explicit attrs.textContent when a caller wants arrows or alternate
		// labels; otherwise show the page title.
		textContent: attrs.textContent ?? page.title
	})
}

// Create a non-clickable page label.
//
// Simple folders are navigation branches with no article body. They should look
// like labels in some places because clicking them would not open meaningful
// page content.
function createSimpleFolderLabel(page, attrs = {}, { tag = 'span' } = {}) {
	return el(tag, { ...attrs, textContent: attrs.textContent ?? page.title })
}

// Create either a link or a label depending on page type.
//
// This keeps the rest of the file from repeating "if simple folder, render a
// span; otherwise render an anchor".
function createPageEntry(page, attrs = {}, options = {}) {
	return isSimpleFolderPage(page)
		? createSimpleFolderLabel(page, attrs, options)
		: createPageAnchor(page, attrs)
}

// Render a flat list of page links/labels.
//
// Used by the "see also" related list and by breadcrumb dropdown menus.
function createPageList(pages, { sorter = null } = {}) {
	const list = el('ul')
	sortedPages(pages, sorter).forEach(page => {
		list.append(
			el(
				'li',
				{},
				createPageEntry(
					page,
					isSimpleFolderPage(page)
						? {
								// Mark simple folder labels so CSS can make them read as
								// branch labels instead of articles.
								class: 'crumb-simple-folder',
								dataset: { page: page.id }
							}
						: {}
				)
			)
		)
	})
	return list
}

// Build the nested list shown inside a breadcrumb dropdown.
//
// Breadcrumb dropdowns expose sibling pages. If one sibling is a simple folder,
// this function shows the folder as a label and recurses into its children so
// the user can still reach the real pages below it.
function createBreadcrumbMenuList(pages, { sorter = null } = {}) {
	const list = el('ul')
	sortedPages(pages, sorter).forEach(page => {
		// Breadcrumb menus can expose a simple folder as a dead-end label. When that happens,
		// treat it as a submenu branch so the user can still reach the real pages underneath.
		if (isSimpleFolderPage(page) && page.children.length) {
			list.append(
				el('li', { class: 'crumb-branch' }, [
					// Folder label: visible but not a route target.
					createSimpleFolderLabel(page, {
						class: 'crumb-simple-folder crumb-branch-label'
					}),
					// Nested children: actual pages remain reachable.
					createBreadcrumbMenuList(page.children, { sorter })
				])
			)
			return
		}
		// An explicitly marked folder may not have children yet. Keep it visible as
		// a non-clickable label instead of falling through to an article link.
		if (isSimpleFolderPage(page)) {
			list.append(
				el('li', {}, createSimpleFolderLabel(page, {
					class: 'crumb-simple-folder'
				}))
			)
			return
		}
		// Normal article page: render one clickable menu item.
		list.append(el('li', {}, createPageAnchor(page)))
	})
	return list
}

// Programmatically open or close a sidebar folder.
//
// The sidebar uses native <details>, so changing the `open` property gives us
// browser-native disclosure behavior and CSS states.
function setFolderOpen(listItem, open) {
	const details = listItem?.querySelector?.(':scope > details')
	// listItem may be null or may not be a folder. In that case there is nothing
	// to toggle.
	if (details) details.open = !!open
}

// Find the sidebar link for a page id.
const findSidebarPageLink = (tree, pageId) =>
	[...tree.querySelectorAll('[data-page]')].find(
		node => node.dataset.page === pageId
	) || null

// Open every ancestor folder for the current sidebar link.
function openSidebarAncestors(currentLink) {
	let item = currentLink?.closest('li') || null
	while (item) {
		if (item.classList.contains('folder')) setFolderOpen(item, true)
		item = item.parentElement?.closest('li') || null
	}
}

// True when a link is outside the visible tree viewport.
const isSidebarLinkOutsideView = (linkRect, treeRect) =>
	linkRect.top < treeRect.top || linkRect.bottom > treeRect.bottom

// Create one sidebar tree item for a page that has children.
//
// The returned <li> contains:
// - <details> for native open/closed state
// - <summary> for the visible folder row
// - nested <ul role="group"> where child pages will be inserted
function createFolderItem(page, open, groupId) {
	const simpleFolder = isSimpleFolderPage(page)
	const glossaryClass = page.id === 'km_glossary' ? ' glossary-link' : ''
	const label = createPageEntry(
		page,
		simpleFolder
			? {
					// Simple folders are visible branch labels, not article links.
					class: `lbl simple-folder-link${glossaryClass}`,
					dataset: { page: page.id }
				}
			: {
					// Normal folder pages can be both an article and a branch. The
					// label navigates to the article when clicked.
					class: `lbl${glossaryClass}`,
					dataset: { page: page.id },
					textContent: page.title,
					// Stop the click from also toggling the <summary>. This lets users
					// click the title to navigate without collapsing the branch.
					onclick: event => event.stopPropagation()
				},
		// In tree summaries, even clickable page entries use span styling for a
		// consistent label surface. createPageEntry() still chooses anchor/span
		// based on whether the page has content.
		{ tag: 'span' }
	)
	const item = el(
		'li',
		{
			// ARIA tree roles help assistive tech understand the sidebar shape.
			role: 'treeitem',
			class: `folder${simpleFolder ? ' simple-folder' : ''}`
		},
		el('details', { open }, [
			el('summary', { class: 'folder-summary' }, [
				el('span', {
					class: 'caret',
					'aria-hidden': 'true',
					// CSS rotates/reveals this native-looking caret based on open
					// state.
					textContent: SIDEWAYS_CARET
				}),
				label
			]),
			// Children are rendered into this group by renderTreeNodes().
			el('ul', { id: groupId, role: 'group' })
		])
	)
	return item
}

// Recursively render wiki pages into a sidebar tree container.
//
// `container` can be the real #tree element, a document fragment, or a nested
// <ul role="group">. The same logic handles all levels.
function renderTreeNodes(nodes, container, depth = 0) {
	nodes.forEach(page => {
		if (page.children.length) {
			// Open the first two levels by default so the wiki does not start as an
			// empty-looking collapsed tree.
			const open = depth < 2
			// Used as the id of the nested group. Page ids are already validated not
			// to contain route-breaking "#".
			const groupId = `group-${page.id}`
			const item = createFolderItem(page, open, groupId)
			container.append(item)
			// Render children inside this folder's nested group.
			renderTreeNodes(
				page.children,
				item.querySelector('ul[role="group"]'),
				depth + 1
			)
			return
		}
		// A childless explicit simple folder is still a navigation label, not an
		// article link. Legacy folders always have children and use the branch path
		// above.
		const simpleFolder = isSimpleFolderPage(page)
		const item = el('li', {
			role: 'treeitem',
			class: `article${simpleFolder ? ' simple-folder' : ''}`
		})
		item.append(
			simpleFolder
				? createSimpleFolderLabel(page, {
						class: 'simple-folder-link simple-folder-leaf',
						dataset: { page: page.id }
					})
				: createPageAnchor(page, {
						// data-page lets highlightSidebar() find this row later.
						class: page.id === 'km_glossary' ? 'glossary-link' : '',
						dataset: { page: page.id },
						textContent: page.title
					})
		)
		container.append(item)
	})
}

// Render the whole left sidebar tree once after the wiki model is loaded.
export function renderSidebarTree() {
	const tree = $('#tree')
	// If the shell is missing or the wiki is not loaded yet, there is no safe
	// place/data to render.
	if (!tree || !wikiStore.root) return
	tree.setAttribute('role', 'tree')
	// Rebuild from scratch. The sidebar is small enough that this stays simpler
	// than diffing individual rows.
	tree.innerHTML = ''
	const { primary, secondary } = getSidebarRoots()
	const fragment = DOC.createDocumentFragment()
	// Normal root children first.
	renderTreeNodes(primary, fragment)
	secondary.forEach(page => {
		// Detached clusters get a visual separator before their tree branch.
		fragment.append(
			el(
				'div',
				{
					class: 'group-sep',
					role: 'presentation',
					'aria-hidden': 'true'
				},
				el('hr', { role: 'presentation', 'aria-hidden': 'true' })
			)
		)
		// Render each secondary cluster as its own small tree.
		renderTreeNodes([page], fragment)
	})
	// One append avoids repeated layout work while building the sidebar.
	tree.append(fragment)
}

// Highlight the current page in the sidebar and reveal its ancestor folders.
export function highlightSidebar(page) {
	const tree = $('#tree')
	if (!tree || !page) return
	// Remove the previous route highlight.
	tree.querySelectorAll('.sidebar-current').forEach(anchor =>
		anchor.classList.remove('sidebar-current')
	)
	// Find the row whose data-page matches the current page id.
	const currentLink = findSidebarPageLink(tree, page.id)
	// Some pages may be absent from the tree if the DOM is stale or the page is
	// intentionally not navigable.
	if (!currentLink) return
	currentLink.classList.add('sidebar-current')
	openSidebarAncestors(currentLink)
	// Capture positions before scrolling. The requestAnimationFrame below lets
	// details-open layout settle before scrollIntoView runs.
	const linkRect = currentLink.getBoundingClientRect()
	const treeRect = tree.getBoundingClientRect()
	requestAnimationFrame(() => {
		// Only scroll when the current link is outside the visible tree area.
		if (isSidebarLinkOutsideView(linkRect, treeRect)) {
			currentLink.scrollIntoView({ block: 'nearest' })
		}
	})
}

// Read a heading label for the TOC.
//
// The visible heading may include a fold marker at the end. The TOC is a
// navigation list, so it should show the heading text without that UI symbol.
function getHeadingTocLabel(heading) {
	return (heading.textContent || '').replace(TOC_FOLD_SUFFIX_RE, '').trim()
}

// Create one breadcrumb segment, including its sibling dropdown when available.
//
// Example breadcrumb: Drones > Intro drones. Each segment can open a small menu
// of sibling pages so the user can jump sideways without returning to the tree.
function createBreadcrumbDropdown(pageNode, { current = false } = {}) {
	const dropdown = el('span', { class: 'dropdown' })
	dropdown.append(
		createPageEntry(
			pageNode,
			isSimpleFolderPage(pageNode)
				? {
						// Current simple folder labels get both simple-folder styling and
						// current breadcrumb styling.
						class: `crumb-simple-folder${current ? ' crumb-current' : ''}`
					}
				: current
					// Current article page gets current breadcrumb styling.
					? { class: 'crumb-current' }
					: {}
		)
	)
	// Sibling dropdown excludes the page we are already displaying.
	const siblingPages = getSiblingNav(pageNode).siblings.filter(
		candidate => candidate !== pageNode
	)
	// Empty sibling lists do not need an empty menu.
	if (siblingPages.length)
		dropdown.append(createBreadcrumbMenuList(siblingPages))
	return dropdown
}

// Create the extra child-page dropdown at the end of the breadcrumbs.
//
// This lets users jump down from the current page to one of its children without
// moving their focus back to the left sidebar.
function createChildBreadcrumbDropdown(page) {
	// No children means there is no downward menu to show.
	if (!page.children.length) return null
	const childBox = el('span', { class: 'childbox' }, [
		// The small toggle is purely visual; CSS/menu hover handles the dropdown.
		el('span', { class: 'toggle', textContent: DOWN_CARET })
	])
	childBox.append(
		// Child menu is alphabetical so large child lists are easier to scan.
		createBreadcrumbMenuList(page.children, { sorter: comparePagesByTitle })
	)
	return childBox
}

// Create one right-side TOC item for a rendered heading.
function createTocListItem(page, heading) {
	const headingId = heading.id || ''
	// Convert tagName like "H2" into level 2, clamped to the normal heading
	// range. The CSS variable indents nested headings in the TOC.
	const level = Math.min(
		6,
		Math.max(1, parseInt(heading.tagName.slice(1), 10) || 1)
	)
	return el('li', { 'data-hid': headingId, style: `--toc-level:${level};` }, [
		el('a', {
			// Link directly to the page and heading anchor.
			href: buildTocHref(page.hash, headingId),
			textContent: getHeadingTocLabel(heading)
		})
	])
}

// Watch rendered headings and highlight the TOC item for the heading currently
// near the top of the viewport.
function observeTocHeadings(headings) {
	// A new page means old heading nodes are gone; stop observing them first.
	tocObserver?.disconnect()
	tocObserver = new IntersectionObserver(
		entries => {
			entries.forEach(entry => {
				// Ignore headings that are leaving the observed area.
				if (!entry.isIntersecting) return
				// The heading id is stored on the corresponding TOC <li>.
				highlightTocAnchor(entry.target.id)
			})
		},
		// With a -70% bottom margin, a heading becomes active when it enters the
		// top portion of the viewport rather than only when fully visible.
		{ root: null, rootMargin: '0px 0px -70% 0px', threshold: 0 }
	)
	// Observe every rendered content heading for the current page.
	headings.forEach(heading => tocObserver.observe(heading))
}

// Keep the active TOC item visible inside the TOC panel.
//
// The range includes the current item and the next item. This makes scrolling
// feel less jumpy when moving through adjacent headings.
function keepTocRangeVisible(link) {
	const toc = $('#toc')
	const currentItem = link?.closest('li')
	// Missing TOC or link means there is nothing to scroll.
	if (!toc || !currentItem) return
	const nextItem = currentItem.nextElementSibling || currentItem
	const tocRect = toc.getBoundingClientRect()
	const currentRect = currentItem.getBoundingClientRect()
	const nextRect = nextItem.getBoundingClientRect()
	// Convert viewport coordinates into scrollTop coordinates for the TOC box.
	const rangeTop =
		toc.scrollTop +
		Math.min(currentRect.top, nextRect.top) -
		tocRect.top -
		TOC_SCROLL_PADDING
	const rangeBottom =
		toc.scrollTop +
		Math.max(currentRect.bottom, nextRect.bottom) -
		tocRect.top +
		TOC_SCROLL_PADDING
	const viewTop = toc.scrollTop
	const viewBottom = viewTop + toc.clientHeight
	// If the range starts above the visible area, scroll upward.
	if (rangeTop < viewTop) toc.scrollTop = Math.max(0, rangeTop)
	// If the range ends below the visible area, scroll downward just enough.
	else if (rangeBottom > viewBottom)
		toc.scrollTop = rangeBottom - toc.clientHeight
}

// Scroll the breadcrumb strip to its right edge after rerendering.
//
// On narrow screens breadcrumbs can overflow horizontally; the current page is
// at the end, so this keeps the most relevant crumb visible.
function scrollBreadcrumbsToEnd() {
	const dynamicCrumbs = $('#crumb-dyn')
	// The shell may not have a breadcrumb container in tiny/test fixtures.
	if (!dynamicCrumbs) return
	requestAnimationFrame(() => {
		// Wait one frame so the browser has measured the new breadcrumb width.
		dynamicCrumbs.scrollLeft = dynamicCrumbs.scrollWidth
	})
}

// Remove the active TOC styling.
export function clearTocHighlight() {
	$('#toc .toc-current')?.classList.remove('toc-current')
}

// Highlight one TOC anchor by heading id.
export function highlightTocAnchor(anchorId) {
	if (!anchorId) {
		// Empty anchor id means there is no section to highlight.
		clearTocHighlight()
		return
	}
	// Find the TOC link whose parent <li data-hid> matches the heading id.
	const link = $$('#toc li[data-hid] > a').find(
		anchor => anchor.parentElement?.dataset.hid === anchorId
	)
	// The page may not have a TOC item for this id.
	if (!link) return
	clearTocHighlight()
	link.classList.add('toc-current')
	// Auto-scroll the right panel so the active item does not disappear.
	keepTocRangeVisible(link)
}

// Render the top breadcrumb bar for the current page.
export function renderBreadcrumbs(page) {
	const dynamicCrumbs = $('#crumb-dyn')
	if (!dynamicCrumbs) return
	// Rebuild the dynamic crumb section from scratch for the new route.
	dynamicCrumbs.innerHTML = ''
	const trail = getPageTrail(page)
	trail.forEach((node, index) => {
		// Separators appear between crumbs, not before the first one.
		if (index) dynamicCrumbs.append(createBreadcrumbSeparator())
		dynamicCrumbs.append(
			// Mark only the final/current page crumb as current.
			createBreadcrumbDropdown(node, { current: node === page })
		)
	})
	const childDropdown = createChildBreadcrumbDropdown(page)
	// Add a final downward menu when the current page has children.
	if (childDropdown) dynamicCrumbs.append(childDropdown)
	scrollBreadcrumbsToEnd()
}

// Render the right-side table of contents from headings in #content.
export function renderToc(page) {
	const toc = $('#toc')
	if (!toc) return
	// Clear the old page's TOC before collecting new headings.
	toc.innerHTML = ''
	const content = $(CONTENT_SEL)
	// HEADINGS_SEL deliberately targets only rendered article headings, not
	// headings from graph legend/help panels.
	const headings = content ? $$(HEADINGS_SEL, content) : []
	// No headings means the TOC panel stays empty.
	if (!headings.length) return
	const list = el('ul')
	headings.forEach(heading => list.append(createTocListItem(page, heading)))
	toc.append(list)
	// Start scroll-based highlighting for this page's headings.
	observeTocHeadings(headings)
}
// Render previous/next article links at the bottom of the page.
//
// wiki.js decides which siblings count as previous/next. This function only
// turns those answers into anchors.
export function renderSiblingNav(page) {
	const host = $('#prevnext')
	if (!host) return
	const trail = getReadingTrail(page)
	const { prev: previousPage, next: nextPage } = trail || getSiblingNav(page)
	// Clear the old page's links.
	host.innerHTML = ''
	if (previousPage) {
		host.append(
			createPageAnchor(previousPage, {
				class: 'prev',
				// aria-label gives screen readers a complete localized phrase.
				'aria-label': t('nav.previous', { title: previousPage.title }),
				// Visible label includes a left arrow to show direction.
				textContent: `\u2190 ${previousPage.title}`
			})
		)
	}
	if (trail) {
		const key = `km-trail:${trail.name}`
		let visited = []
		try {
			const stored = JSON.parse(localStorage.getItem(key))
			visited = Array.isArray(stored) ? stored : []
			if (!visited.includes(page.id)) {
				visited.push(page.id)
				localStorage.setItem(key, JSON.stringify(visited))
			}
		} catch {}
		host.append(el('span', {
			class: 'reading-trail-progress',
			textContent: `${trail.name} · ${trail.index + 1}/${trail.pages.length} · ${visited.filter(id => trail.pages.some(item => item.id === id)).length} visited`
		}))
	}
	if (nextPage) {
		host.append(
			createPageAnchor(nextPage, {
				class: 'next',
				'aria-label': t('nav.next', { title: nextPage.title }),
				// Visible label includes a right arrow to show direction.
				textContent: `${nextPage.title} \u2192`
			})
		)
	}
}

// Render related-page links below the article.
export function renderRelatedPages(page) {
	const host = $('#seealso')
	if (!host) return
	// Clear the previous route's related links.
	host.innerHTML = ''
	const relatedPages = getRelatedPages(page)
	// No related pages means no heading and no empty list.
	if (!relatedPages.length) return
	host.append(
		// Localized heading such as "See also".
		el('h2', { textContent: t('related.seeAlso') }),
		// Reuse the same small flat list helper used elsewhere.
		createPageList(relatedPages)
	)
}
