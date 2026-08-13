/*
 * Legend-only DOM for the graph viewport so the scene module can stay focused on
 * rendering and interaction state.
 *
 * graph.js owns the actual graph. This file only builds the collapsible legend
 * that explains gestures and visual symbols to the user.
 */
import { $, el } from '../core/runtime.js'
import { t } from '../core/i18n.js'

// Legend rows are data-driven.
//
// Each interaction row is [gestureBadgeKey, translationKey].
// Each symbol row is [swatchClass, translationKey, optionalSwatchText].
const LEGEND = {
	// Touch devices have a smaller/different interaction set.
	touch: [
		['drag', 'touchRotate'],
		['twoFinger', 'touchPanZoom'],
		['tap', 'touchOpenNode'],
		['drag', 'touchDragNode'],
		['tap', 'touchClose']
	],
	// Mouse/trackpad/keyboard interactions.
	pointer: [
		['drag', 'dragCanvas'],
		['wheel', 'wheelZoom'],
		['rightDrag', 'panCanvas'],
		['click', 'openNode'],
		['drag', 'dragNode'],
		['rightClick', 'foldNode'],
		['hover', 'hoverNode'],
		['esc', 'closeFullscreen']
	],
	// Visual symbols used inside the graph.
	symbols: [
		['node-current', 'currentNode'],
		['node-parent', 'parentNode'],
		['node-leaf', 'leafNode'],
		['link-hierarchy', 'hierarchyLink'],
		['link-tag', 'tagLink'],
		['folded', 'foldedNode'],
		['label-active', 'activeLabel', 'Aa'],
		['dimmed', 'dimmed']
	]
}

// Detect coarse touch input for touch-specific legend wording.
const isTouchLegendMode = () =>
	matchMedia('(hover: none) and (pointer: coarse)').matches

// Create a small visual swatch for graph symbols.
const createLegendChip = (cls, text = '') =>
	el('span', {
		class: `graph-legend-swatch ${cls}`,
		// Some swatches use visible text, such as "Aa" for label style.
		textContent: text,
		// The adjacent text explains the symbol, so the swatch can be hidden from
		// assistive tech.
		'aria-hidden': 'true'
	})

// Create a gesture badge, such as "drag", "wheel", or "Esc".
const createLegendBadge = key =>
	el('span', {
		class: 'graph-legend-badge',
		textContent: t(`graph.legend.gesture.${key}`),
		'aria-hidden': 'true'
	})

// Create one legend list item with marker + label/description text.
const createLegendItem = (marker, title, desc) =>
	el('li', { class: 'graph-legend-item' }, [
		marker,
		el('span', { class: 'graph-legend-copy' }, [
			el('span', { class: 'graph-legend-label', textContent: title }),
			el('span', { class: 'graph-legend-desc', textContent: desc })
		])
	])

// Build the interaction and symbol item arrays for the current input mode.
function buildLegendSections() {
	const touch = isTouchLegendMode()
	// Pick touch or pointer interaction rows based on the current device.
	const interactions = LEGEND[touch ? 'touch' : 'pointer'].map(
		([gesture, key]) =>
			createLegendItem(
				createLegendBadge(gesture),
				t(`graph.legend.interaction.${key}`),
				t(`graph.legend.interaction.${key}Desc`)
			)
	)
	// Symbol rows are the same for touch and pointer.
	const symbols = LEGEND.symbols.map(([swatch, key, text]) =>
		createLegendItem(
			createLegendChip(swatch, text || ''),
			t(`graph.legend.symbol.${key}`),
			t(`graph.legend.symbol.${key}Desc`)
		)
	)
	return {
		interactions,
		symbols,
		// Touch devices get a note because the touch mode is intentionally simpler
		// than the desktop pointer mode.
		note: touch
			? el('p', {
					class: 'graph-legend-note',
					textContent: t('graph.legend.touchNote')
				})
			: null
	}
}

// Build one titled legend section.
function createLegendSection(title, items) {
	const list = el('ul', { class: 'graph-legend-list' })
	items.forEach(item => list.append(item))
	return el('section', { class: 'graph-legend-section' }, [
		el('h3', { class: 'graph-legend-heading', textContent: title }),
		list
	])
}

// Rebuild the body of an existing legend.
//
// Called after creating the legend and whenever translations/input-mode wording
// may need to be refreshed.
export function syncGraphLegend(root) {
	const body = root && $('.graph-legend-body', root)
	// No legend body means there is nothing safe to render into.
	if (!body) return
	const { interactions, symbols, note } = buildLegendSections()
	// Rebuild from scratch because the legend is tiny and data-driven.
	body.innerHTML = ''
	body.append(
		createLegendSection(t('graph.legend.interactions'), interactions),
		createLegendSection(t('graph.legend.symbols'), symbols)
	)
	// Append touch-only note when relevant.
	if (note) body.append(note)
}

// Ensure the graph legend exists inside #graph-box, then synchronize its body.
export function ensureGraphLegend() {
	const host = $('#graph-box')
	// Graph host is absent in small/test shells.
	if (!host) return null
	let legend = $('.graph-legend', host)
	if (!legend) {
		// Native <details> gives the legend built-in collapsed/expanded behavior.
		legend = el('details', { class: 'graph-legend' }, [
			el('summary', { textContent: t('graph.legend.title') }),
			el('div', { class: 'graph-legend-body' })
		])
		host.append(legend)
	}
	// Fill or refresh the legend content.
	syncGraphLegend(legend)
	return legend
}
