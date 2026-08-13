/*
 * Pure graph-fullscreen shell state transitions.
 *
 * shell.js owns DOM classes, ARIA, and graph resizing. This helper owns the
 * small state machine for entering/exiting graph fullscreen, including the
 * temporary util-panel restore behavior used by the G keyboard shortcut.
 */

// Restore markers kept in shellState.restoreUtilState.
export const GRAPH_RESTORE_NONE = ''
export const GRAPH_RESTORE_MANUAL_HIDDEN = 'manual-hidden'
export const GRAPH_RESTORE_AUTO_HIDDEN = 'auto-hidden'

// Entering fullscreen from the keyboard may need to reveal the util panel first.
function getEnterGraphFullscreenPatch(
	state,
	{ source = 'button', isUtilOverlay = false } = {}
) {
	if (source !== 'keybind') {
		// Button/double-click means the user interacted with the visible graph
		// area directly. Do not invent restore behavior.
		return { restoreUtilState: GRAPH_RESTORE_NONE }
	}
	if (state.hidden?.util) {
		// Desktop util panel was manually hidden. Show it for fullscreen, then
		// remember to hide it again when fullscreen exits.
		return {
			hidden: { ...state.hidden, util: false },
			restoreUtilState: GRAPH_RESTORE_MANUAL_HIDDEN
		}
	}
	if (isUtilOverlay) {
		// Mobile/overlay util panel is normally closed. Open it so the graph is
		// actually visible, then close it again on exit.
		return {
			overlayOpen: 'util',
			restoreUtilState: GRAPH_RESTORE_AUTO_HIDDEN
		}
	}
	// Util was already visible, so there is nothing to restore.
	return { restoreUtilState: GRAPH_RESTORE_NONE }
}

// Exiting fullscreen restores only the util state that keyboard entry changed.
function getExitGraphFullscreenPatch(state) {
	if (state.restoreUtilState === GRAPH_RESTORE_MANUAL_HIDDEN) {
		return {
			hidden: { ...state.hidden, util: true },
			restoreUtilState: GRAPH_RESTORE_NONE
		}
	}
	if (state.restoreUtilState === GRAPH_RESTORE_AUTO_HIDDEN) {
		return {
			overlayOpen:
				state.overlayOpen === 'util' ? '' : state.overlayOpen,
			restoreUtilState: GRAPH_RESTORE_NONE
		}
	}
	return { restoreUtilState: GRAPH_RESTORE_NONE }
}

// Return a patch describing one fullscreen transition.
//
// changed=false means the requested value already matches state.
export function getGraphFullscreenTransition(
	state,
	value,
	{ source = 'button', isUtilOverlay = false } = {}
) {
	if (!state) return { changed: false, patch: {} }
	const graphFullscreen = !!value
	if (graphFullscreen === !!state.graphFullscreen)
		return { changed: false, patch: {} }

	const patch = graphFullscreen
		? getEnterGraphFullscreenPatch(state, { source, isUtilOverlay })
		: getExitGraphFullscreenPatch(state)

	return {
		changed: true,
		patch: { ...patch, graphFullscreen }
	}
}
