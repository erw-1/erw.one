import { pageKind, pageRoute, parseHeadings } from "./km.js";

let root = null;

export function initDialogs(modalRoot) {
	root = modalRoot;
}

function closeModal(value, resolve) {
	root.hidden = true;
	root.replaceChildren();
	resolve(value);
}

function modal(title, bodyBuilder, footerBuilder) {
	return new Promise(resolve => {
		root.hidden = false;
		const card = document.createElement("section");
		card.className = "modal-card";
		card.innerHTML = `
			<header>
				<h2>${title}</h2>
				<button type="button" data-close title="Close">Close</button>
			</header>
			<div class="modal-body"></div>
			<footer></footer>
		`;
		const body = card.querySelector(".modal-body");
		const footer = card.querySelector("footer");
		bodyBuilder(body, value => closeModal(value, resolve));
		footerBuilder?.(footer, value => closeModal(value, resolve));
		card.querySelector("[data-close]").addEventListener("click", () => closeModal(null, resolve));
		root.replaceChildren(card);
		const firstField = card.querySelector("input, textarea, button");
		firstField?.focus();
	});
}

export function showMessage(title, message) {
	return modal(
		title,
		body => {
			const paragraph = document.createElement("p");
			paragraph.textContent = message;
			body.append(paragraph);
		},
		(footer, done) => {
			const ok = document.createElement("button");
			ok.type = "button";
			ok.textContent = "OK";
			ok.addEventListener("click", () => done(true));
			footer.append(ok);
		}
	);
}

export function showConfirm(title, message, confirmLabel = "OK", danger = false) {
	return modal(
		title,
		body => {
			const paragraph = document.createElement("p");
			paragraph.textContent = message;
			body.append(paragraph);
		},
		(footer, done) => {
			const cancel = document.createElement("button");
			cancel.type = "button";
			cancel.textContent = "Cancel";
			cancel.addEventListener("click", () => done(false));
			const ok = document.createElement("button");
			ok.type = "button";
			if (danger) ok.className = "danger";
			ok.textContent = confirmLabel;
			ok.addEventListener("click", () => done(true));
			footer.append(cancel, ok);
		}
	);
}

export function showPrompt(title, label, initialValue = "") {
	return modal(
		title,
		body => {
			const fieldLabel = document.createElement("label");
			fieldLabel.innerHTML = `<span>${label}</span>`;
			const input = document.createElement("input");
			input.value = initialValue;
			fieldLabel.append(input);
			body.append(fieldLabel);
		},
		(footer, done) => {
			const cancel = document.createElement("button");
			cancel.type = "button";
			cancel.textContent = "Cancel";
			cancel.addEventListener("click", () => done(null));
			const ok = document.createElement("button");
			ok.type = "button";
			ok.textContent = "Insert";
			ok.addEventListener("click", () => {
				const value = root.querySelector("input")?.value ?? "";
				done(value);
			});
			footer.append(cancel, ok);
		}
	);
}

function cheatsheetRow({ label, syntax, example, shortcut }) {
	const row = document.createElement("div");
	row.className = "cheatsheet-row";
	const name = document.createElement("span");
	name.className = "tool-name";
	name.textContent = label;
	const code = document.createElement("code");
	code.className = "tool-syntax";
	code.textContent = syntax || "";
	const preview = document.createElement("span");
	preview.className = "tool-example";
	// Preview HTML is controlled by TOOL_DETAILS/ACTION_DETAILS in toolbar.js.
	preview.innerHTML = example;
	const key = document.createElement("kbd");
	key.className = "tool-shortcut";
	key.textContent = shortcut || "";
	row.append(name, code, preview, key);
	return row;
}

export function showCheatsheet(sections) {
	return modal("Syntax cheatsheet", body => {
		const tabs = document.createElement("nav");
		tabs.className = "cheatsheet-tabs";
		body.append(tabs);
		const views = sections.map(({ tab: title, groups }, index) => {
			const tab = document.createElement("button");
			tab.type = "button";
			tab.textContent = title;
			tab.classList.toggle("active", index === 0);
			tabs.append(tab);
			const panel = document.createElement("div");
			panel.className = "cheatsheet-panel";
			panel.hidden = index > 0;
			for (const group of groups) {
				const heading = document.createElement("strong");
				heading.className = "tool-group-title";
				heading.textContent = group.title;
				panel.append(heading, ...group.rows.map(cheatsheetRow));
			}
			body.append(panel);
			return { tab, panel };
		});
		for (const view of views) view.tab.addEventListener("click", () => {
			for (const other of views) {
				other.tab.classList.toggle("active", other === view);
				other.panel.hidden = other !== view;
			}
		});
	});
}

export function showSourceModal(title, source, applyLabel = "Apply") {
	return modal(
		title,
		body => {
			const textarea = document.createElement("textarea");
			textarea.value = source;
			textarea.spellcheck = false;
			body.append(textarea);
		},
		(footer, done) => {
			const cancel = document.createElement("button");
			cancel.type = "button";
			cancel.textContent = "Cancel";
			cancel.addEventListener("click", () => done(null));
			const apply = document.createElement("button");
			apply.type = "button";
			apply.textContent = applyLabel;
			apply.addEventListener("click", () => done(root.querySelector("textarea")?.value ?? ""));
			footer.append(cancel, apply);
		}
	);
}

export function showSaveChoiceModal(remembered = false) {
	return modal(
		"Save changes",
		body => {
			body.innerHTML = `
				<p>Where should this bundle be saved?</p>
				<label class="modal-checkbox">
					<input type="checkbox" data-save-remember>
					<span>Don't ask again, reopen from Export &gt; Set save shortcut</span>
				</label>
			`;
			body.querySelector("[data-save-remember]").checked = remembered;
		},
		(footer, done) => {
			const cancel = document.createElement("button");
			cancel.type = "button";
			cancel.textContent = "Cancel";
			cancel.addEventListener("click", () => done(null));
			const pick = (mode, label) => {
				const button = document.createElement("button");
				button.type = "button";
				button.textContent = label;
				button.addEventListener("click", () => done({
					mode,
					remember: root.querySelector("[data-save-remember]")?.checked ?? false
				}));
				return button;
			};
			footer.append(cancel, pick("export", "Export file"), pick("github", "Push to GitHub"));
		}
	);
}

export function showGitHubModal(initial, confirmLabel = "Save") {
	return modal(
		"GitHub file",
		body => {
			body.innerHTML = `
				<label>
					<span>Repository (owner/name)</span>
					<input data-gh-repo autocomplete="off" placeholder="gwanox/conclave-guide">
				</label>
				<label>
					<span>Branch</span>
					<input data-gh-branch autocomplete="off" placeholder="main">
				</label>
				<label>
					<span>File path</span>
					<input data-gh-path autocomplete="off" placeholder="content.md">
				</label>
				<label>
					<span>Fine-grained token, contents read/write on this repo only (needed to save; loading a public repo works without it)</span>
					<input data-gh-token type="password" autocomplete="off" placeholder="github_pat_...">
				</label>
			`;
			body.querySelector("[data-gh-repo]").value = initial?.repo ?? "";
			body.querySelector("[data-gh-branch]").value = initial?.branch ?? "main";
			body.querySelector("[data-gh-path]").value = initial?.path ?? "content.md";
			body.querySelector("[data-gh-token]").value = initial?.token ?? "";
		},
		(footer, done) => {
			const cancel = document.createElement("button");
			cancel.type = "button";
			cancel.textContent = "Cancel";
			cancel.addEventListener("click", () => done(null));
			const ok = document.createElement("button");
			ok.type = "button";
			ok.textContent = confirmLabel;
			ok.addEventListener("click", () => {
				const field = name => root.querySelector(`[data-gh-${name}]`)?.value.trim() ?? "";
				const repo = field("repo");
				if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) return;
				done({
					repo,
					branch: field("branch") || "main",
					path: field("path") || "content.md",
					token: field("token")
				});
			});
			footer.append(cancel, ok);
		}
	);
}

export function showGlossaryModal(initialTerm = "") {
	return modal(
		"Add glossary term",
		body => {
			body.innerHTML = `
				<label>
					<span>Term</span>
					<input data-glossary-term autocomplete="off">
				</label>
				<label>
					<span>Definition</span>
					<textarea class="compact-textarea" data-glossary-definition spellcheck="true" placeholder="Write the definition that will be added under this glossary heading."></textarea>
				</label>
			`;
			body.querySelector("[data-glossary-term]").value = initialTerm;
		},
		(footer, done) => {
			const cancel = document.createElement("button");
			cancel.type = "button";
			cancel.textContent = "Cancel";
			cancel.addEventListener("click", () => done(null));
			const add = document.createElement("button");
			add.type = "button";
			add.textContent = "Add term";
			add.addEventListener("click", () => {
				done({
					term: root.querySelector("[data-glossary-term]")?.value ?? "",
					definition: root.querySelector("[data-glossary-definition]")?.value ?? ""
				});
			});
			footer.append(cancel, add);
		}
	);
}

export function showLinkModal(state, selectedText = "") {
	return modal(
		"Insert link",
		(body, done) => {
			body.innerHTML = `
				<div class="link-custom-form">
					<label>
						<span>Link text</span>
						<input data-link-text autocomplete="off">
					</label>
					<label>
						<span>URL or KM route</span>
						<input data-link-url autocomplete="off" placeholder="https://example.com or #page#anchor">
					</label>
				</div>
				<h3 class="modal-subhead">Page and heading suggestions</h3>
				<label>
					<span>Search pages</span>
					<input type="search" data-link-filter placeholder="Type a page title or id...">
				</label>
				<ul class="choice-list" data-link-list></ul>
			`;
			const textInput = body.querySelector("[data-link-text]");
			const urlInput = body.querySelector("[data-link-url]");
			const filter = body.querySelector("[data-link-filter]");
			const list = body.querySelector("[data-link-list]");
			textInput.value = selectedText;
			const renderChoices = () => {
				const query = filter.value.trim().toLowerCase();
				list.replaceChildren();
				for (const page of state.pages) {
					if (pageKind(state.pages, page) === "Simple folder") continue;
					const pageText = `${page.title} ${page.id}`.toLowerCase();
					if (query && !pageText.includes(query)) continue;
					const pageItem = document.createElement("li");
					// A nested page routes through its whole parent chain. The bare id
					// only resolves for top-level pages, and Issues flags the rest.
					const route = pageRoute(state.pages, page);
					const pageButton = document.createElement("button");
					pageButton.type = "button";
					pageButton.textContent = `${page.title}  #${route}`;
					pageButton.addEventListener("click", () => {
						done({
							text: textInput.value.trim() || selectedText || page.title,
							route: `#${route}`
						});
					});
					pageItem.append(pageButton);
					list.append(pageItem);
					for (const heading of parseHeadings(page.content).slice(0, 8)) {
						const headingItem = document.createElement("li");
						const headingButton = document.createElement("button");
						headingButton.type = "button";
						// The root page has an empty route, so it anchors as "#1_1", not "##1_1".
						const anchorRoute = `#${route}${route ? "#" : ""}${heading.anchor}`;
						headingButton.textContent = `${"  ".repeat(Math.max(0, heading.level - 1))}${heading.text}  ${anchorRoute}`;
						headingButton.addEventListener("click", () => {
							done({
								text: textInput.value.trim() || selectedText || heading.text,
								route: anchorRoute
							});
						});
						headingItem.append(headingButton);
						list.append(headingItem);
					}
				}
			};
			filter.addEventListener("input", renderChoices);
			urlInput.addEventListener("keydown", event => {
				if (event.key !== "Enter") return;
				event.preventDefault();
				const route = urlInput.value.trim();
				if (!route) return;
				done({
					text: textInput.value.trim() || route,
					route
				});
			});
			renderChoices();
		},
		(footer, done) => {
			const cancel = document.createElement("button");
			cancel.type = "button";
			cancel.textContent = "Cancel";
			cancel.addEventListener("click", () => done(null));
			const insert = document.createElement("button");
			insert.type = "button";
			insert.textContent = "Insert custom link";
			insert.addEventListener("click", () => {
				const route = root.querySelector("[data-link-url]")?.value.trim() ?? "";
				if (!route) return;
				done({
					text: root.querySelector("[data-link-text]")?.value.trim() || route,
					route
				});
			});
			footer.append(cancel, insert);
		}
	);
}
