/*
 * Math authoring surface: symbol palette, LaTeX source, and live KaTeX preview.
 *
 * KM renders math with KaTeX, so the palette is plain KaTeX/LaTeX snippets and
 * every button renders itself with the same library the site will use.
 *
 * Group shapes:
 * - `items` is one space-separated string of snippets, so a snippet itself can
 *   never contain a space. `{}` marks a placeholder: palette buttons preview it
 *   with a sample letter and the caret lands inside the first one on insertion.
 * - `templates` is a named list for whole formulas, which do contain spaces.
 */
import { pkgURL } from "../../../km/src/js/core/deps.js";

const KATEX_ROOT = pkgURL("katex", "/dist/");

export const MATH_CATEGORIES = [
	{
		id: "common",
		label: "Common symbols",
		icon: "\\times\\cap\\propto",
		groups: [
			{
				title: "Binary operations",
				items: "+ - \\times \\div \\pm \\mp \\triangleleft \\triangleright \\cdot \\setminus \\star \\ast \\cup \\cap \\sqcup \\sqcap \\vee \\wedge \\circ \\bullet \\oplus \\ominus \\odot \\oslash \\otimes \\bigcirc \\diamond \\uplus \\bigtriangleup \\bigtriangledown \\lhd \\rhd \\unlhd \\unrhd \\amalg \\wr \\dagger \\ddagger"
			},
			{
				title: "Binary relations",
				items: "< > = \\le \\ge \\equiv \\ll \\gg \\doteq \\prec \\succ \\sim \\preceq \\succeq \\simeq \\approx \\subset \\supset \\subseteq \\supseteq \\sqsubset \\sqsupset \\sqsubseteq \\sqsupseteq \\cong \\bowtie \\propto \\in \\ni \\vdash \\dashv \\models \\mid \\parallel \\perp \\smile \\frown \\asymp \\notin \\neq"
			},
			{
				title: "Arrows",
				items: "\\leftarrow \\rightarrow \\longleftarrow \\longrightarrow \\uparrow \\downarrow \\updownarrow \\leftrightarrow \\Uparrow \\Downarrow \\Updownarrow \\longleftrightarrow \\Leftarrow \\Rightarrow \\Longleftarrow \\Longrightarrow \\Leftrightarrow \\Longleftrightarrow \\iff \\mapsto \\longmapsto \\nearrow \\searrow \\swarrow \\nwarrow \\hookleftarrow \\hookrightarrow \\rightleftharpoons \\leftharpoonup \\rightharpoonup \\leftharpoondown \\rightharpoondown"
			},
			{
				title: "Others",
				items: "\\because \\therefore \\cdots \\ldots \\vdots \\ddots \\forall \\exists \\nexists \\neg \\emptyset \\infty \\nabla \\partial \\triangle \\square \\Diamond \\bot \\top \\angle \\measuredangle \\surd \\heartsuit \\clubsuit \\spadesuit \\flat \\natural \\sharp"
			}
		]
	},
	{
		id: "greek",
		label: "Greek letters",
		icon: "\\alpha\\beta\\gamma",
		groups: [
			{
				title: "Lowercase",
				items: "\\alpha \\beta \\gamma \\delta \\epsilon \\varepsilon \\zeta \\eta \\theta \\vartheta \\iota \\kappa \\lambda \\mu \\nu \\xi \\pi \\varpi \\rho \\varrho \\sigma \\varsigma \\tau \\upsilon \\phi \\varphi \\chi \\psi \\omega"
			},
			{
				title: "Uppercase",
				items: "\\Gamma \\Delta \\Theta \\Lambda \\Xi \\Pi \\Sigma \\Upsilon \\Phi \\Psi \\Omega"
			},
			{
				title: "Others",
				items: "\\hbar \\imath \\jmath \\ell \\Re \\Im \\aleph \\beth \\gimel \\daleth \\wp \\mho \\complement \\circledS \\S \\mathbb{ABC} \\mathfrak{ABC} \\mathcal{ABC} \\mathsf{ABC} \\operatorname{def}"
			}
		]
	},
	{
		id: "fractions",
		label: "Fractions and derivatives",
		icon: "\\frac{x}{y}",
		groups: [
			{
				title: "Fractions",
				items: "\\frac{}{} \\dfrac{}{} \\tfrac{}{} \\cfrac{}{} \\mathrm{d}t \\frac{\\mathrm{d}y}{\\mathrm{d}x} \\partial{t} \\frac{\\partial{y}}{\\partial{x}} \\nabla\\psi \\frac{\\partial^{2}y}{\\partial{x_1}\\partial{x_2}}"
			},
			{
				title: "Derivative",
				items: "\\dot{a} \\ddot{a} f' f'' f^{(n)}"
			},
			{
				title: "Modular arithmetic",
				items: "a\\bmod{b} a\\equiv{b}\\pmod{m} \\gcd(m,n) \\operatorname{lcm}(m,n)"
			}
		]
	},
	{
		id: "roots",
		label: "Roots and scripts",
		icon: "\\sqrt{e^x}",
		groups: [
			{
				title: "Radicals",
				items: "\\sqrt{} \\sqrt[n]{}"
			},
			{
				title: "Sub and super",
				items: "x^{} x_{} x_{a}^{b} x_{a}^{b}y^{c}"
			},
			{
				title: "Accents and others",
				items: "\\hat{a} \\check{a} \\grave{a} \\acute{a} \\tilde{a} \\breve{a} \\bar{a} \\vec{a} 37^\\circ \\widehat{abc} \\widetilde{abc} \\overleftarrow{abc} \\overrightarrow{abc} \\overline{abc} \\underline{abc} \\overbrace{abc} \\underbrace{abc} \\overset{a}{abc} \\underset{a}{abc} \\stackrel{a}{\\longrightarrow}"
			}
		]
	},
	{
		id: "limits",
		label: "Limits and logs",
		icon: "\\lim_{n\\to\\infty}",
		groups: [
			{
				title: "Limits",
				items: "\\lim \\lim_{x\\to0} \\lim_{x\\to\\infty} \\lim_{{}\\to{}} \\max_{} \\min_{}"
			},
			{
				title: "Logarithms and exponentials",
				items: "\\log_{a}{b} \\lg{a} \\ln{a} \\exp{a} e^{x} a^{x}"
			},
			{
				title: "Bounds",
				items: "\\min{x} \\max{y} \\sup{t} \\inf{s} \\limsup{w} \\liminf{v} \\dim{p} \\ker{\\phi}"
			}
		]
	},
	{
		id: "trig",
		label: "Trig functions",
		icon: "\\sin\\alpha",
		groups: [
			{
				title: "Trigonometric functions",
				items: "\\sin{\\alpha} \\cos{\\alpha} \\tan{\\alpha} \\cot{\\alpha} \\sec{\\alpha} \\csc{\\alpha}"
			},
			{
				title: "Inverse trigonometric functions",
				items: "\\sin^{-1}{\\alpha} \\cos^{-1}{\\alpha} \\tan^{-1}{\\alpha} \\cot^{-1}{\\alpha} \\sec^{-1}{\\alpha} \\csc^{-1}{\\alpha} \\arcsin{a} \\arccos{a} \\arctan{a} \\operatorname{arccot}{a} \\operatorname{arcsec}{a} \\operatorname{arccsc}{a}"
			},
			{
				title: "Hyperbolic functions",
				items: "\\sinh{\\alpha} \\cosh{\\alpha} \\tanh{\\alpha} \\coth{\\alpha} \\operatorname{sech}{\\alpha} \\operatorname{csch}{\\alpha}"
			},
			{
				title: "Inverse hyperbolic functions",
				items: "\\sinh^{-1}{\\alpha} \\cosh^{-1}{\\alpha} \\tanh^{-1}{\\alpha} \\coth^{-1}{\\alpha} \\operatorname{sech}^{-1}{\\alpha} \\operatorname{csch}^{-1}{\\alpha}"
			}
		]
	},
	{
		id: "integrals",
		label: "Integrals",
		icon: "\\int_a^b",
		groups: [
			{
				title: "Integral",
				items: "\\int \\int_{a}^{b} \\int\\limits_{a}^{b}"
			},
			{
				title: "Double and triple",
				items: "\\iint \\iint_{a}^{b} \\iiint \\iiint_{a}^{b}"
			},
			{
				title: "Closed line or path integral",
				items: "\\oint \\oint_{C} \\oint_{a}^{b}"
			}
		]
	},
	{
		id: "operators",
		label: "Large operators",
		icon: "\\sum_{i=0}^{n}",
		groups: [
			{
				title: "Summation",
				items: "\\sum \\sum_{a}^{b} \\sum\\nolimits_{a}^{b} \\sum_{i=0}^{n}"
			},
			{
				title: "Product and coproduct",
				items: "\\prod \\prod_{a}^{b} \\coprod \\coprod_{a}^{b}"
			},
			{
				title: "Union and intersection",
				items: "\\bigcup \\bigcup_{a}^{b} \\bigcap \\bigcap_{a}^{b} \\biguplus \\bigsqcup"
			},
			{
				title: "Disjunction and conjunction",
				items: "\\bigvee \\bigvee_{a}^{b} \\bigwedge \\bigwedge_{a}^{b} \\bigoplus \\bigotimes \\bigodot"
			}
		]
	},
	{
		id: "brackets",
		label: "Brackets and floors",
		icon: "\\{[()]\\}",
		groups: [
			{
				title: "Brackets",
				items: "\\left({}\\right) \\left[{}\\right] \\left\\langle{}\\right\\rangle \\left\\{{}\\right\\} \\left|{}\\right| \\left\\|{}\\right\\| \\left\\lfloor{}\\right\\rfloor \\left\\lceil{}\\right\\rceil"
			},
			{
				title: "Commons",
				items: "\\binom{n}{r} [0,1) \\langle\\psi| |\\psi\\rangle \\langle\\psi|\\psi\\rangle"
			}
		]
	},
	{
		id: "matrices",
		label: "Arrays and matrices",
		icon: "\\begin{bmatrix}0&1\\\\1&0\\end{bmatrix}",
		groups: [
			{
				title: "Matrices",
				items: "\\begin{matrix}a&b\\\\c&d\\end{matrix} \\begin{pmatrix}a&b\\\\c&d\\end{pmatrix} \\begin{bmatrix}a&b\\\\c&d\\end{bmatrix} \\begin{vmatrix}a&b\\\\c&d\\end{vmatrix} \\begin{Vmatrix}a&b\\\\c&d\\end{Vmatrix} \\begin{Bmatrix}a&b\\\\c&d\\end{Bmatrix}"
			},
			{
				title: "Arrays and cases",
				items: "\\begin{cases}a&x>0\\\\b&x\\le0\\end{cases} \\begin{aligned}y&=x+1\\\\z&=x\\end{aligned} \\begin{array}{cc}a&b\\\\c&d\\end{array} \\cdots \\vdots \\ddots"
			}
		]
	},
	{
		id: "text",
		label: "Text and color",
		icon: "\\textcolor{#4ea1ff}{Aa}",
		groups: [
			{
				title: "Text and fonts",
				items: "\\text{} \\textrm{} \\textbf{} \\textit{} \\texttt{} \\textsf{} \\mathrm{} \\mathbf{} \\mathit{} \\mathbb{ABC} \\mathcal{ABC} \\mathfrak{ABC} \\mathscr{ABC} \\operatorname{}"
			},
			{
				title: "Color",
				items: "\\textcolor{red}{} \\textcolor{blue}{} \\textcolor{green}{} \\textcolor{orange}{} \\textcolor{purple}{} \\textcolor{teal}{} \\textcolor{#4ea1ff}{} \\colorbox{yellow}{} \\fcolorbox{red}{white}{}"
			},
			{
				title: "Boxes and marks",
				items: "\\boxed{} \\fbox{} \\underline{} \\overline{} \\cancel{} \\bcancel{} \\xcancel{} \\sout{}"
			},
			{
				title: "Size and style",
				items: "{\\tiny{}} {\\small{}} {\\large{}} {\\Large{}} {\\huge{}} {\\displaystyle\\frac{a}{b}} {\\textstyle\\frac{a}{b}} {\\scriptstyle\\frac{a}{b}}"
			},
			{
				title: "Spacing and breaks",
				items: "a\\,b a\\:b a\\;b a\\!b a\\quad{b} a\\qquad{b} a\\hspace{1em}b a\\\\b a\\phantom{b}c \\substack{a\\\\b}"
			}
		]
	},
	{
		id: "science",
		label: "Science templates",
		icon: "E=mc^2",
		groups: [
			{
				title: "Physics",
				templates: [
					{ name: "Mass-energy", latex: "E = mc^2" },
					{ name: "Schrodinger equation", latex: "i\\hbar\\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi" },
					{ name: "Einstein field equations", latex: "G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}" },
					{ name: "Lorentz factor", latex: "\\gamma = \\frac{1}{\\sqrt{1 - v^2/c^2}}" },
					{ name: "Maxwell-Faraday", latex: "\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}" }
				]
			},
			{
				title: "Chemistry",
				templates: [
					{ name: "Ideal gas law", latex: "PV = nRT" },
					{ name: "Equilibrium constant", latex: "K_{eq} = \\frac{[\\mathrm{C}]^c[\\mathrm{D}]^d}{[\\mathrm{A}]^a[\\mathrm{B}]^b}" },
					{ name: "Arrhenius equation", latex: "k = A e^{-E_a / (RT)}" },
					{ name: "Nernst equation", latex: "E = E^\\circ - \\frac{RT}{zF}\\ln Q" },
					{ name: "pH", latex: "\\mathrm{pH} = -\\log_{10}[\\mathrm{H}^+]" }
				]
			},
			{
				title: "Biology and medicine",
				templates: [
					{ name: "Michaelis-Menten", latex: "v = \\frac{V_{\\max}[S]}{K_M + [S]}" },
					{ name: "Hardy-Weinberg", latex: "p^2 + 2pq + q^2 = 1" },
					{ name: "Logistic growth", latex: "\\frac{dN}{dt} = rN\\left(1 - \\frac{N}{K}\\right)" },
					{ name: "SIR infected", latex: "\\frac{dI}{dt} = \\beta SI - \\gamma I" },
					{ name: "Reproduction number", latex: "R_0 = \\frac{\\beta}{\\gamma}" }
				]
			},
			{
				title: "Statistics and data",
				templates: [
					{ name: "Normal distribution", latex: "f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}" },
					{ name: "Bayes theorem", latex: "P(A \\mid B) = \\frac{P(B \\mid A)\\,P(A)}{P(B)}" },
					{ name: "Linear model", latex: "\\hat{y} = \\beta_0 + \\sum_{i=1}^{n} \\beta_i x_i" },
					{ name: "Confidence interval", latex: "\\bar{x} \\pm z\\frac{s}{\\sqrt{n}}" },
					{ name: "Standard deviation", latex: "\\sigma = \\sqrt{\\frac{1}{N}\\sum_{i=1}^{N}(x_i - \\mu)^2}" }
				]
			},
			{
				title: "Machine learning",
				templates: [
					{ name: "Scaled dot-product attention", latex: "\\mathrm{Attention}(Q,K,V) = \\mathrm{softmax}\\left(\\frac{QK^\\top}{\\sqrt{d_k}}\\right)V" },
					{ name: "Softmax", latex: "\\sigma(z)_i = \\frac{e^{z_i}}{\\sum_{j=1}^{K} e^{z_j}}" },
					{ name: "Cross-entropy loss", latex: "\\mathcal{L} = -\\sum_{i} y_i \\log \\hat{y}_i" },
					{ name: "Gradient descent step", latex: "\\theta_{t+1} = \\theta_t - \\eta \\nabla_\\theta \\mathcal{L}(\\theta_t)" },
					{ name: "KL divergence", latex: "D_{\\mathrm{KL}}(P \\parallel Q) = \\sum_x P(x)\\log\\frac{P(x)}{Q(x)}" }
				]
			},
			{
				title: "Quantum computing",
				templates: [
					{ name: "Qubit state", latex: "|\\psi\\rangle = \\alpha|0\\rangle + \\beta|1\\rangle" },
					{ name: "Born rule", latex: "P(x) = |\\langle x|\\psi\\rangle|^2" },
					{ name: "Hadamard gate", latex: "H = \\frac{1}{\\sqrt{2}}\\begin{pmatrix}1 & 1\\\\1 & -1\\end{pmatrix}" },
					{ name: "Bell state", latex: "|\\Phi^+\\rangle = \\frac{1}{\\sqrt{2}}(|00\\rangle + |11\\rangle)" }
				]
			},
			{
				title: "Engineering and signals",
				templates: [
					{ name: "Fourier transform", latex: "\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x)e^{-2\\pi i x\\xi}\\,dx" },
					{ name: "Convolution", latex: "(f * g)(t) = \\int_{-\\infty}^{\\infty} f(\\tau)g(t-\\tau)\\,d\\tau" },
					{ name: "Laplace transform", latex: "F(s) = \\int_{0}^{\\infty} f(t)e^{-st}\\,dt" },
					{ name: "Channel capacity", latex: "C = B\\log_2\\left(1 + \\frac{S}{N}\\right)" }
				]
			},
			{
				title: "Climate and energy",
				templates: [
					{ name: "Radiative forcing", latex: "\\Delta F = 5.35\\ln\\frac{C}{C_0}" },
					{ name: "Stefan-Boltzmann", latex: "P = \\sigma A T^4" },
					{ name: "Levelized cost of energy", latex: "\\mathrm{LCOE} = \\frac{\\sum_t (I_t + M_t)(1+r)^{-t}}{\\sum_t E_t(1+r)^{-t}}" }
				]
			}
		]
	}
];

// Same inline rule KM's markdown tokenizer uses, so the editor only offers to
// edit math that the site will actually render.
const INLINE_MATH = /\$(?!\$|\s|\d)(?:\\.|[^\n$\\])*\S\$(?!\$)/g;
const DISPLAY_MATH = /\$\$[\s\S]*?\$\$/g;

// Blank out code fences and inline code so their `$` characters are not read as
// math. Blanking instead of deleting keeps every offset intact.
function maskCode(text) {
	let inFence = false;
	return text.split("\n").map(line => {
		if (/^\s*(```|~~~)/.test(line)) {
			inFence = !inFence;
			return " ".repeat(line.length);
		}
		if (inFence) return " ".repeat(line.length);
		return line.replace(/`[^`\n]*`/g, match => " ".repeat(match.length));
	}).join("\n");
}

// Every formula on a page, in source order. Inline matches that sit inside a
// display block are dropped, so `$$a+b$$` counts once.
export function findFormulas(source) {
	const text = String(source ?? "");
	const masked = maskCode(text);
	const formulas = [];
	for (const [pattern, display] of [[DISPLAY_MATH, true], [INLINE_MATH, false]]) {
		pattern.lastIndex = 0;
		for (const match of masked.matchAll(pattern)) {
			const start = match.index;
			const end = start + match[0].length;
			if (formulas.some(other => start >= other.start && end <= other.end)) continue;
			const pad = display ? 2 : 1;
			formulas.push({ start, end, display, latex: text.slice(start + pad, end - pad).trim() });
		}
	}
	return formulas.sort((a, b) => a.start - b.start);
}

export function mathAtCursor(source, cursor = 0) {
	const text = String(source ?? "");
	const at = Math.max(0, Math.min(text.length, Number(cursor) || 0));
	return findFormulas(text).find(formula => at >= formula.start && at <= formula.end) ?? null;
}

// KaTeX appends the offending snippet with combining underlines, which reads as
// noise next to the source it came from. Keep the sentence, drop the tail.
const katexMessage = error => String(error?.message || error)
	.replace(/^KaTeX parse error:\s*/, "")
	.replace(/ at (position \d+|end of input):[\s\S]*$/, "");

// KaTeX is the only honest LaTeX check available here, so formulas are reported
// once it has loaded; before that this stays quiet instead of guessing.
export function katexError(latex, display = false) {
	if (!katex) return "";
	try {
		katex.renderToString(latex, { displayMode: display, throwOnError: true });
		return "";
	} catch (error) {
		return katexMessage(error);
	}
}

export function findMathProblems(pages, check = katexError) {
	const problems = [];
	for (const page of pages) {
		const text = String(page.content ?? "");
		for (const formula of findFormulas(text)) {
			const error = check(formula.latex, formula.display);
			if (!error) continue;
			problems.push({
				// A warning, not an error: KM still publishes the page, it just
				// shows the formula as broken red output.
				level: "warning",
				code: "invalid-math",
				pageUid: page.uid,
				line: text.slice(0, formula.start).split("\n").length - 1,
				start: formula.start,
				end: formula.end,
				text: `${page.title || page.id || "(untitled page)"} has math that will not render: ${error}`
			});
		}
	}
	return problems;
}

export function wrapMath(latex, display = false) {
	const source = String(latex ?? "").trim();
	if (display) return `$$\n${source}\n$$`;
	// KM's inline tokenizer ignores `$` followed by a digit or space, so give
	// those formulas an empty group to open with.
	const inline = source.replace(/\s*\n\s*/g, " ");
	return `$${/^[\d\s]/.test(inline) ? "{}" : ""}${inline}$`;
}

// Caret offset inside a snippet: the first `{}` placeholder, otherwise the end.
export function snippetCaret(snippet) {
	const index = snippet.indexOf("{}");
	return index < 0 ? snippet.length : index + 1;
}

// Fill placeholders with sample letters so palette buttons show what a snippet
// builds instead of a row of identical empty boxes.
export function sampleSnippet(snippet) {
	let used = 0;
	return snippet.replaceAll("{}", () => `{${String.fromCharCode(97 + used++)}}`);
}

function insertSnippet(field, snippet) {
	const start = field.selectionStart ?? field.value.length;
	const end = field.selectionEnd ?? start;
	field.focus();
	// execCommand keeps the textarea's own undo stack; setRangeText is the fallback.
	if (!document.execCommand("insertText", false, snippet)) field.setRangeText(snippet, start, end, "end");
	const caret = start + snippetCaret(snippet);
	field.setSelectionRange(caret, caret);
}

function ensureKatexCss() {
	if (document.getElementById("katex-css")) return;
	document.head.append(Object.assign(document.createElement("link"), {
		id: "katex-css",
		rel: "stylesheet",
		href: `${KATEX_ROOT}katex.min.css`
	}));
}

// One KaTeX instance for the whole editor: the palette, the live preview, and
// formula validation all wait on this single lazy import.
let katex = null;
let katexLoad = null;

export function ensureKatex() {
	if (!katexLoad) {
		ensureKatexCss();
		katexLoad = import(pkgURL("katex", "/dist/katex.min.js/+esm")).then(module => {
			katex = module.default ?? module;
			return katex;
		});
	}
	return katexLoad;
}

export function initMathPanel({ form, tabs, palette, input, preview, status }) {
	let loading = false;
	let active = MATH_CATEGORIES[0].id;

	const displayMode = () => form.elements.display.value === "block";

	// Render one LaTeX string into `target`. Returns an error message or null.
	function typeset(target, latex, display = false) {
		target.replaceChildren();
		if (!katex) {
			target.textContent = latex;
			return null;
		}
		try {
			// KaTeX generates this markup from the LaTeX above and, with trust off
			// (its default), refuses \href and other URL-bearing commands.
			target.innerHTML = katex.renderToString(latex, { displayMode: display, throwOnError: true });
			return null;
		} catch (error) {
			target.textContent = latex;
			return katexMessage(error);
		}
	}

	function load() {
		if (loading) return;
		loading = true;
		status.hidden = false;
		status.textContent = "Loading KaTeX...";
		ensureKatex()
			.then(() => {
				status.hidden = true;
				status.textContent = "";
				renderTabs();
				renderPalette();
				renderPreview();
			})
			.catch(() => {
				status.hidden = false;
				status.textContent = "KaTeX could not load. LaTeX still inserts as typed.";
			});
	}

	function renderTabs() {
		tabs.replaceChildren(...MATH_CATEGORIES.map(category => {
			const button = document.createElement("button");
			button.type = "button";
			button.dataset.mathCategory = category.id;
			button.classList.toggle("active", category.id === active);
			button.title = category.label;
			const icon = document.createElement("span");
			icon.className = "math-tab-icon";
			typeset(icon, category.icon);
			const label = document.createElement("span");
			label.className = "math-tab-label";
			label.textContent = category.label;
			button.append(icon, label);
			return button;
		}));
	}

	function snippetButton(snippet) {
		const button = document.createElement("button");
		button.type = "button";
		button.dataset.math = snippet;
		button.title = snippet;
		button.setAttribute("aria-label", `Insert ${snippet}`);
		typeset(button, sampleSnippet(snippet));
		return button;
	}

	function templateButton({ name, latex }) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "math-template";
		button.dataset.math = latex;
		button.title = latex;
		button.setAttribute("aria-label", `Insert ${name}`);
		const label = document.createElement("span");
		label.className = "math-template-name";
		label.textContent = name;
		const formula = document.createElement("span");
		formula.className = "math-template-formula";
		typeset(formula, latex);
		button.append(label, formula);
		return button;
	}

	function renderPalette() {
		const category = MATH_CATEGORIES.find(item => item.id === active) ?? MATH_CATEGORIES[0];
		palette.replaceChildren(...category.groups.flatMap(group => {
			const title = document.createElement("strong");
			title.className = "math-group-title";
			title.textContent = group.title;
			const buttons = group.templates
				? group.templates.map(templateButton)
				: group.items.split(/\s+/).map(snippetButton);
			return [title, ...buttons];
		}));
	}

	function renderPreview() {
		const latex = input.value.trim();
		if (!latex) {
			preview.replaceChildren();
			if (katex) status.hidden = true;
			return;
		}
		const error = typeset(preview, latex, displayMode());
		// While KaTeX loads, keep its own status message visible.
		if (!katex) return;
		status.hidden = !error;
		status.textContent = error ?? "";
	}

	tabs.addEventListener("click", event => {
		const button = event.target.closest("[data-math-category]");
		if (!button) return;
		active = button.dataset.mathCategory;
		for (const tab of tabs.children) tab.classList.toggle("active", tab === button);
		renderPalette();
	});

	palette.addEventListener("click", event => {
		const button = event.target.closest("[data-math]");
		if (!button) return;
		insertSnippet(input, button.dataset.math);
		renderPreview();
	});

	form.addEventListener("input", renderPreview);

	return {
		// Paint on open, then let load() re-render once KaTeX can typeset.
		set(latex, display) {
			input.value = latex;
			form.elements.display.value = display ? "block" : "inline";
			renderTabs();
			renderPalette();
			renderPreview();
			load();
		},
		get: () => ({ latex: input.value.trim(), display: displayMode() })
	};
}
