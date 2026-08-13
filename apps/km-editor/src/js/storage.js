export async function openMarkdownFile(fallbackInput) {
	if ("showOpenFilePicker" in window) {
		const [handle] = await window.showOpenFilePicker({
			types: [
				{
					description: "Markdown",
					accept: { "text/markdown": [".md", ".markdown"], "text/plain": [".txt"] }
				}
			],
			excludeAcceptAllOption: false,
			multiple: false
		});
		const file = await handle.getFile();
		return { text: await file.text(), fileName: file.name, fileHandle: handle };
	}

	return new Promise((resolve, reject) => {
		fallbackInput.value = "";
		fallbackInput.onchange = async () => {
			const file = fallbackInput.files?.[0];
			if (!file) {
				reject(new Error("No file selected."));
				return;
			}
			resolve({ text: await file.text(), fileName: file.name, fileHandle: null });
		};
		fallbackInput.click();
	});
}

export function markdownSourceUrl(value) {
	const source = String(value ?? "").trim();
	let url;
	try {
		url = new URL(source);
	} catch {
		return source;
	}
	const hostname = url.hostname.toLowerCase();
	if (hostname === "hackmd.io") {
		if (!/(?:\.md|\/download)$/i.test(url.pathname))
			url.pathname = `${url.pathname.replace(/\/$/, "")}/download`;
		url.search = "";
		url.hash = "";
		return url.href;
	}
	if ((hostname === "github.com" || hostname === "www.github.com") && /^\/[^/]+\/[^/]+\/blob\//i.test(url.pathname)) {
		url.hostname = "raw.githubusercontent.com";
		url.pathname = url.pathname.replace(/^\/([^/]+)\/([^/]+)\/blob\//i, "/$1/$2/");
		url.search = "";
		url.hash = "";
		return url.href;
	}
	return url.href;
}

const GITHUB_API = "https://api.github.com/repos";

function githubHeaders(token) {
	const headers = { Accept: "application/vnd.github+json" };
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

function githubFileUrl({ repo, path }, query = "") {
	const safePath = String(path).split("/").map(encodeURIComponent).join("/");
	return `${GITHUB_API}/${repo}/contents/${safePath}${query}`;
}

// Unicode-safe base64: GitHub's contents API speaks base64, btoa alone chokes on emoji.
function encodeBase64(text) {
	let binary = "";
	for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function decodeBase64(base64) {
	return new TextDecoder().decode(Uint8Array.from(atob(base64), char => char.charCodeAt(0)));
}

// Token is optional for public repos. Returns { text, sha }; keep the sha and
// pass it back to githubSave so a stale save is rejected instead of clobbering.
export async function githubLoad({ repo, branch, path, token }) {
	const response = await fetch(githubFileUrl({ repo, path }, `?ref=${encodeURIComponent(branch)}`), {
		headers: githubHeaders(token)
	});
	if (!response.ok) throw new Error(`GitHub load failed (HTTP ${response.status}).`);
	const data = await response.json();
	return { text: decodeBase64(String(data.content ?? "").replace(/\n/g, "")), sha: data.sha };
}

// Saves via the contents API. Omitting sha creates a new file. A stale/missing
// sha on an existing file makes GitHub reject the write; that surfaces as
// error.conflict so callers can offer an explicit overwrite.
export async function githubSave({ repo, branch, path, token, sha, text, message }) {
	const response = await fetch(githubFileUrl({ repo, path }), {
		method: "PUT",
		headers: githubHeaders(token),
		body: JSON.stringify({ message, branch, content: encodeBase64(text), ...(sha ? { sha } : {}) })
	});
	if (!response.ok) {
		// ponytail: 422 also covers non-sha validation errors (e.g. bad branch);
		// split them apart if the overwrite prompt ever misleads in practice.
		const error = new Error(`GitHub save failed (HTTP ${response.status}).`);
		error.conflict = response.status === 409 || response.status === 422;
		throw error;
	}
	const data = await response.json();
	return data.content.sha;
}

export function downloadText(text, fileName = "download.txt", type = "text/plain;charset=utf-8") {
	const blob = new Blob([text], { type });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName || "download.txt";
	link.click();
	requestAnimationFrame(() => URL.revokeObjectURL(url));
}

export function downloadMarkdown(text, fileName = "km-bundle.md") {
	downloadText(text, fileName || "km-bundle.md", "text/markdown;charset=utf-8");
}
