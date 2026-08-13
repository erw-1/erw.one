import { emojiDataEntries, pkgURL, twitterEmojiURL } from "../../../km/src/js/core/deps.js";

const EMOJI_GROUPS = [
	{ name: "Smileys & Emotion", icon: "😀" },
	{ name: "People & Body", icon: "👋" },
	{ name: "Animals & Nature", icon: "🐻" },
	{ name: "Food & Drink", icon: "🍔" },
	{ name: "Travel & Places", icon: "🚗" },
	{ name: "Activities", icon: "⚽" },
	{ name: "Objects", icon: "💡" },
	{ name: "Symbols", icon: "❤️" },
	{ name: "Flags", icon: "🏳️" },
	{ name: "Custom", icon: "🧩", custom: true }
];

const CUSTOM_EMOJI_ALIAS = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CUSTOM_EMOJI_TYPES = {
	webp: "image/webp",
	png: "image/png",
	gif: "image/gif",
	avif: "image/avif",
	svg: "image/svg+xml",
	jpg: "image/jpeg",
	jpeg: "image/jpeg"
};
const MAX_CUSTOM_EMOJI_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_CUSTOM_EMOJI_DATA_LENGTH = 2_800_000;

function groupId(name) {
	return `emoji-group-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function emojiEntries(emojiData) {
	return emojiDataEntries(emojiData).map(entry => ({
		...entry,
		searchText: `${entry.name} ${entry.aliases.join(" ")}`.replaceAll("_", " ").toLowerCase()
	}));
}

export function emojiQueryAtCursor(text, cursor) {
	if (!Number.isInteger(cursor) || cursor < 0 || cursor > text.length) return null;
	const match = /:([A-Za-z0-9_-]{1,32})$/.exec(text.slice(0, cursor));
	if (!match) return null;
	const start = cursor - match[0].length;
	if (start > 0 && /[A-Za-z0-9_:\\]/.test(text[start - 1])) return null;
	return { start, end: cursor, query: match[1].toLowerCase() };
}

function emojiButton(entry) {
	const button = document.createElement("button");
	button.type = "button";
	button.append(emojiImage(entry.emoji, entry.src, entry.emoji || `:${entry.shortcode}:`));
	button.dataset.emoji = entry.emoji;
	if (entry.src) button.dataset.emojiSrc = entry.src;
	button.dataset.emojiShortcode = entry.shortcode;
	button.title = `:${entry.shortcode}:`;
	button.setAttribute("aria-label", `Insert :${entry.shortcode}:`);
	return button;
}

function emojiImage(emoji, src = twitterEmojiURL(emoji), fallback = emoji) {
	const image = document.createElement("img");
	image.className = "twemoji";
	image.src = src;
	image.alt = "";
	image.loading = "lazy";
	image.decoding = "async";
	image.draggable = false;
	image.addEventListener("error", () => image.replaceWith(document.createTextNode(fallback)), { once: true });
	return image;
}

function customEmojiEntries(items) {
	return items.map(item => ({
		emoji: "",
		group: "Custom",
		shortcode: item.alias,
		aliases: [item.alias],
		searchText: item.alias.replaceAll("_", " ").toLowerCase(),
		src: item.data
	}));
}

function aliasFromFilename(name) {
	return name
		.slice(0, Math.max(0, name.lastIndexOf(".")))
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9_-]+/g, "_")
		.replace(/^[_-]+|[_-]+$/g, "")
		.slice(0, 64) || "emoji";
}

function uniqueAlias(base, items) {
	const aliases = new Set(items.map(item => item.alias));
	if (!aliases.has(base)) return base;
	let index = 2;
	while (aliases.has(`${base}_${index}`)) index++;
	return `${base.slice(0, 63 - String(index).length)}_${index}`;
}

async function imageDataURL(file, mime) {
	const blob = new Blob([file], { type: mime });
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = () => reject(reader.error || new Error("Could not read image"));
		reader.readAsDataURL(blob);
	});
}

export function fitEmojiSize(width, height, max = 128) {
	const scale = Math.min(1, max / width, max / height);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	};
}

async function optimizedImageDataURL(file, mime) {
	if (mime === "image/gif") return imageDataURL(file, mime);
	const url = URL.createObjectURL(new Blob([file], { type: mime }));
	try {
		const image = new Image();
		image.src = url;
		await image.decode();
		const size = fitEmojiSize(image.naturalWidth, image.naturalHeight);
		const canvas = document.createElement("canvas");
		canvas.width = size.width;
		canvas.height = size.height;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Could not resize image");
		context.drawImage(image, 0, 0, size.width, size.height);
		return canvas.toDataURL("image/webp", 0.9);
	} finally {
		URL.revokeObjectURL(url);
	}
}

export function initEmojiPicker({
	root,
	search,
	status,
	themes,
	onSelect,
	autocompleteTextareas = [],
	onAutocompleteSelect,
	customEmoji = [],
	onCustomEmojiChange
}) {
	let entries = [];
	let builtInEntries = [];
	let customItems = [...customEmoji];
	let loadPromise = null;
	let countText = "";

	function showStatus(value) {
		if (typeof value === "string") {
			status.textContent = value;
			return;
		}
		const label = document.createElement("strong");
		label.textContent = `:${value.shortcode}:`;
		status.replaceChildren(
			emojiImage(value.emoji, value.src, value.emoji || `:${value.shortcode}:`),
			label
		);
	}

	function setActiveGroup(name) {
		for (const button of themes.querySelectorAll("[data-emoji-group]")) {
			button.classList.toggle("active", button.dataset.emojiGroup === name);
		}
	}

	function renderThemes() {
		themes.replaceChildren(
			...EMOJI_GROUPS.map(group => {
				const button = document.createElement("button");
				button.type = "button";
				button.append(emojiImage(group.icon));
				button.title = group.name;
				button.dataset.emojiGroup = group.name;
				button.setAttribute("aria-label", group.name);
				return button;
			})
		);
		setActiveGroup(EMOJI_GROUPS[0].name);
	}

	function rebuildEntries() {
		const customEntries = customEmojiEntries(customItems);
		const customAliases = new Set(customEntries.map(entry => entry.shortcode));
		const builtIns = builtInEntries.flatMap(entry => {
			const aliases = entry.aliases.filter(alias => !customAliases.has(alias));
			return aliases.length ? [{ ...entry, aliases, shortcode: aliases[0] }] : [];
		});
		entries = [...customEntries, ...builtIns];
	}

	function setCustomEmoji(items) {
		const next = Array.isArray(items) ? [...items] : [];
		if (
			next.length === customItems.length &&
			next.every((item, index) =>
				item.alias === customItems[index].alias &&
				item.data === customItems[index].data
			)
		) return;
		customItems = next;
		if (!builtInEntries.length) return;
		rebuildEntries();
		render();
	}

	function commitCustomEmoji(items, message) {
		const scrollTop = root.scrollTop;
		setCustomEmoji(items);
		root.scrollTop = scrollTop;
		setActiveGroup("Custom");
		onCustomEmojiChange?.(customItems);
		if (message) showStatus(message);
	}

	async function importCustomEmoji(files) {
		const next = [...customItems];
		let totalLength = next.reduce((total, item) => total + item.data.length, 0);
		let added = 0;
		let skipped = 0;
		for (const file of files) {
			const extension = file.name.split(".").pop()?.toLowerCase();
			const mime = CUSTOM_EMOJI_TYPES[extension];
			if (!mime || file.size > MAX_CUSTOM_EMOJI_SOURCE_BYTES) {
				skipped++;
				continue;
			}
			let data;
			try {
				data = await optimizedImageDataURL(file, mime);
			} catch {
				skipped++;
				continue;
			}
			if (totalLength + data.length > MAX_CUSTOM_EMOJI_DATA_LENGTH) {
				skipped++;
				continue;
			}
			const alias = uniqueAlias(aliasFromFilename(file.name), next);
			next.push({ alias, data });
			totalLength += data.length;
			added++;
		}
		if (added) commitCustomEmoji(
			next,
			`Added ${added} custom emoji${added === 1 ? "" : "s"}${skipped ? `; skipped ${skipped}` : ""}`
		);
		else showStatus(
			skipped
				? "No images added. Check the format, file size, and available embedded storage."
				: "No images selected."
		);
	}

	function customEmojiManager() {
		const manager = document.createElement("div");
		manager.className = "custom-emoji-manager";
		const drop = document.createElement("div");
		drop.className = "custom-emoji-drop";
		drop.textContent = "Drop emoji images here";
		const add = document.createElement("button");
		add.type = "button";
		add.textContent = "Add images";
		const input = document.createElement("input");
		input.type = "file";
		input.multiple = true;
		input.hidden = true;
		input.accept = ".webp,.png,.gif,.avif,.svg,.jpg,.jpeg,image/*";
		add.addEventListener("click", () => input.click());
		input.addEventListener("change", () => {
			const files = [...input.files];
			input.value = "";
			importCustomEmoji(files).catch(() => showStatus("Could not read one of the images."));
		});
		for (const eventName of ["dragenter", "dragover"]) {
			drop.addEventListener(eventName, event => {
				event.preventDefault();
				drop.classList.add("dragging");
			});
		}
		drop.addEventListener("dragleave", () => drop.classList.remove("dragging"));
		drop.addEventListener("drop", event => {
			event.preventDefault();
			event.stopPropagation();
			drop.classList.remove("dragging");
			importCustomEmoji([...(event.dataTransfer?.files ?? [])])
				.catch(() => showStatus("Could not read one of the images."));
		});
		drop.append(add, input);

		const help = document.createElement("small");
		help.textContent = "Static images are fitted to 128 px and saved as WebP. GIF animation is preserved.";
		const list = document.createElement("div");
		list.className = "custom-emoji-list";
		if (!customItems.length) {
			list.append(Object.assign(document.createElement("span"), {
				className: "emoji-empty",
				textContent: "No custom emoji yet."
			}));
		}
		for (const item of customItems) {
			const row = document.createElement("div");
			row.className = "custom-emoji-item";
			row.append(emojiImage("", item.data, `:${item.alias}:`));
			const alias = document.createElement("input");
			alias.value = item.alias;
			alias.maxLength = 64;
			alias.setAttribute("aria-label", `Rename :${item.alias}:`);
			alias.addEventListener("change", () => {
				const value = alias.value.trim();
				if (
					!CUSTOM_EMOJI_ALIAS.test(value) ||
					customItems.some(candidate => candidate !== item && candidate.alias === value)
				) {
					alias.setCustomValidity("Use a unique alias with letters, numbers, hyphens, or underscores.");
					alias.reportValidity();
					return;
				}
				commitCustomEmoji(
					customItems.map(candidate => candidate === item ? { ...candidate, alias: value } : candidate),
					`Renamed :${item.alias}: to :${value}:`
				);
			});
			alias.addEventListener("input", () => alias.setCustomValidity(""));
			alias.addEventListener("keydown", event => {
				if (event.key === "Enter") {
					event.preventDefault();
					alias.blur();
				} else if (event.key === "Escape") {
					alias.value = item.alias;
					alias.blur();
				}
			});
			const remove = document.createElement("button");
			remove.type = "button";
			remove.className = "custom-emoji-remove";
			remove.textContent = "×";
			remove.title = `Remove :${item.alias}:`;
			remove.setAttribute("aria-label", remove.title);
			remove.addEventListener("click", () => commitCustomEmoji(
				customItems.filter(candidate => candidate !== item),
				`Removed :${item.alias}:`
			));
			row.append(alias, remove);
			list.append(row);
		}
		manager.append(drop, help, list);
		return manager;
	}

	function render() {
		const query = search.value.trim().toLowerCase().replaceAll("_", " ");
		const filtered = entries.filter(entry => !query || entry.searchText.includes(query));
		const sections = EMOJI_GROUPS.flatMap(group => {
			const matches = filtered.filter(entry => entry.group === group.name);
			if (!matches.length && (!group.custom || query)) return [];
			const section = document.createElement("section");
			section.className = "emoji-section";
			section.id = groupId(group.name);
			section.dataset.emojiSection = group.name;
			const heading = document.createElement("h3");
			heading.className = "emoji-section-title";
			heading.textContent = group.name;
			section.append(heading);
			if (group.custom && !query) section.append(customEmojiManager());
			if (matches.length) {
				section.append(...matches.map(emojiButton));
			}
			return [section];
		});

		root.replaceChildren(...sections);
		root.scrollTop = 0;
		countText = filtered.length
			? `${filtered.length} emoji${filtered.length === 1 ? "" : "s"}`
			: "No emoji found";
		showStatus(countText);

		for (const button of themes.querySelectorAll("[data-emoji-group]")) {
			button.disabled = query
				? !filtered.some(entry => entry.group === button.dataset.emojiGroup)
				: false;
		}
		setActiveGroup(sections[0]?.dataset.emojiSection ?? "");
	}

	async function load() {
		if (builtInEntries.length) return;
		if (!loadPromise) {
			showStatus("Loading emoji...");
			search.disabled = true;
			loadPromise = import(pkgURL("emoji-datasource-twitter", "/emoji.json/+esm"))
				.then(emojiData => {
					builtInEntries = emojiEntries(emojiData);
					rebuildEntries();
					search.disabled = false;
					renderThemes();
					render();
				})
				.catch(error => {
					loadPromise = null;
					showStatus("Could not load emoji");
					throw error;
				});
		}
		return loadPromise;
	}

	search.addEventListener("input", render);
	themes.addEventListener("click", event => {
		const button = event.target.closest("[data-emoji-group]");
		if (!button || button.disabled) return;
		const section = document.getElementById(groupId(button.dataset.emojiGroup));
		if (!section) return;
		root.scrollTo({ top: section.offsetTop, behavior: "smooth" });
		setActiveGroup(button.dataset.emojiGroup);
	});
	root.addEventListener("scroll", () => {
		const sections = [...root.querySelectorAll("[data-emoji-section]")];
		const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 8;
		const current = atBottom
			? sections.at(-1)
			: sections.findLast(section => section.offsetTop <= root.scrollTop + 8);
		if (current) setActiveGroup(current.dataset.emojiSection);
	});
	const showButton = event => {
		const button = event.target.closest("[data-emoji-shortcode]");
		if (!button) return;
		showStatus({
			emoji: button.dataset.emoji,
			src: button.dataset.emojiSrc,
			shortcode: button.dataset.emojiShortcode
		});
	};
	root.addEventListener("pointerover", showButton);
	root.addEventListener("focusin", showButton);
	root.addEventListener("pointerleave", () => showStatus(countText));
	root.addEventListener("click", event => {
		const button = event.target.closest("[data-emoji-shortcode]");
		if (!button) return;
		onSelect(`:${button.dataset.emojiShortcode}:`);
	});

	if (autocompleteTextareas.length && onAutocompleteSelect) {
		const autocomplete = document.createElement("div");
		autocomplete.id = "emoji-autocomplete";
		autocomplete.className = "emoji-autocomplete";
		autocomplete.role = "listbox";
		autocomplete.hidden = true;
		document.body.append(autocomplete);
		let autocompleteState = null;
		let activeIndex = 0;

		const hideAutocomplete = () => {
			autocomplete.hidden = true;
			autocompleteState = null;
			for (const textarea of autocompleteTextareas) {
				textarea.setAttribute("aria-expanded", "false");
				textarea.removeAttribute("aria-activedescendant");
			}
		};

		const setActiveSuggestion = index => {
			const buttons = [...autocomplete.querySelectorAll("button")];
			if (!buttons.length) return;
			activeIndex = (index + buttons.length) % buttons.length;
			buttons.forEach((button, buttonIndex) => {
				const active = buttonIndex === activeIndex;
				button.classList.toggle("active", active);
				button.setAttribute("aria-selected", String(active));
			});
			const active = buttons[activeIndex];
			autocompleteState.textarea.setAttribute("aria-activedescendant", active.id);
			active.scrollIntoView({ block: "nearest" });
		};

		const chooseSuggestion = button => {
			if (!autocompleteState || !button) return;
			const { textarea, start, end } = autocompleteState;
			hideAutocomplete();
			onAutocompleteSelect({
				textarea,
				start,
				end,
				shortcode: button.dataset.emojiShortcode
			});
		};

		const positionAutocomplete = textarea => {
			const rect = textarea.getBoundingClientRect();
			const style = getComputedStyle(textarea);
			const before = textarea.value.slice(0, textarea.selectionStart);
			const lineStart = before.lastIndexOf("\n") + 1;
			const line = before.slice(0, lineStart).split("\n").length - 1;
			const column = before.length - lineStart;
			const lineHeight = parseFloat(style.lineHeight) || 20;
			const characterWidth = (parseFloat(style.fontSize) || 13) * 0.62;
			// ponytail: monospace estimate; use a textarea mirror only if soft-wrapped positioning matters.
			let left = rect.left + (parseFloat(style.paddingLeft) || 0) +
				column * characterWidth - textarea.scrollLeft;
			let top = rect.top + (parseFloat(style.paddingTop) || 0) +
				(line + 1) * lineHeight - textarea.scrollTop;
			left = Math.max(8, Math.min(left, innerWidth - autocomplete.offsetWidth - 8));
			if (top + autocomplete.offsetHeight > Math.min(rect.bottom, innerHeight) - 8)
				top -= autocomplete.offsetHeight + lineHeight;
			autocomplete.style.left = `${left}px`;
			autocomplete.style.top = `${Math.max(8, top)}px`;
		};

		const updateAutocomplete = async textarea => {
			const trigger = emojiQueryAtCursor(textarea.value, textarea.selectionStart);
			if (!trigger || textarea.selectionStart !== textarea.selectionEnd) {
				hideAutocomplete();
				return;
			}
			try {
				await load();
			} catch {
				hideAutocomplete();
				return;
			}
			const current = emojiQueryAtCursor(textarea.value, textarea.selectionStart);
			if (!current || current.start !== trigger.start || current.query !== trigger.query) return;
			const suggestions = [];
			for (const entry of entries) {
				for (const alias of entry.aliases) {
					if (!alias.toLowerCase().startsWith(current.query)) continue;
					suggestions.push({ ...entry, shortcode: alias });
					if (suggestions.length === 8) break;
				}
				if (suggestions.length === 8) break;
			}
			if (!suggestions.length) {
				hideAutocomplete();
				return;
			}
			autocomplete.replaceChildren(...suggestions.map((entry, index) => {
				const button = document.createElement("button");
				button.type = "button";
				button.id = `emoji-autocomplete-option-${index}`;
				button.role = "option";
				button.dataset.emojiShortcode = entry.shortcode;
				button.append(
					emojiImage(entry.emoji, entry.src, entry.emoji || `:${entry.shortcode}:`),
					Object.assign(document.createElement("code"), {
						textContent: `:${entry.shortcode}:`
					})
				);
				return button;
			}));
			autocompleteState = { textarea, ...current };
			autocomplete.hidden = false;
			textarea.setAttribute("aria-expanded", "true");
			positionAutocomplete(textarea);
			setActiveSuggestion(0);
		};

		autocomplete.addEventListener("mousedown", event => {
			const button = event.target.closest("button");
			if (!button) return;
			event.preventDefault();
			chooseSuggestion(button);
		});

		for (const textarea of autocompleteTextareas) {
			textarea.setAttribute("aria-autocomplete", "list");
			textarea.setAttribute("aria-controls", autocomplete.id);
			textarea.setAttribute("aria-expanded", "false");
			textarea.addEventListener("input", () => updateAutocomplete(textarea));
			textarea.addEventListener("click", () => updateAutocomplete(textarea));
			textarea.addEventListener("blur", () => setTimeout(hideAutocomplete));
			textarea.addEventListener("scroll", hideAutocomplete, { passive: true });
			textarea.addEventListener("keydown", event => {
				if (autocomplete.hidden) return;
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					setActiveSuggestion(activeIndex + (event.key === "ArrowDown" ? 1 : -1));
				} else if (event.key === "Enter" || event.key === "Tab") {
					event.preventDefault();
					chooseSuggestion(autocomplete.querySelectorAll("button")[activeIndex]);
				} else if (event.key === "Escape") {
					event.preventDefault();
					hideAutocomplete();
				}
			});
		}
	}

	return { load, setCustomEmoji };
}
