/*
 * Diagram samples and parts for the editor's Mermaid builder.
 *
 * `MERMAID_TEMPLATES` is one entry per diagram type, each with named variants:
 * the plain button inserts the first variant, the caret offers the rest. Every
 * variant is checked against the pinned Mermaid, so adding one means checking it
 * against that version rather than against the newest Mermaid.
 *
 * `MERMAID_SNIPPETS` is the other half of the panel: single lines that add a
 * node, an arrow, or a section to the diagram already in the editor.
 */
export const MERMAID_TEMPLATES = [
	{
		name: "Flowchart",
		type: "flowchart",
		variants: [
			{
				name: "Basic",
				source: "flowchart TD\n  A[Start] --> B{Choice}\n  B -->|yes| C[Do the thing]\n  B -->|no| D[Stop]"
			},
			{
				name: "Retry loop",
				source: "flowchart TD\n  Draft([Write draft]) --> Review[Ask for review]\n  Review --> Ok{Approved?}\n  Ok -->|No| Draft\n  Ok -->|Yes| Publish[Publish page]\n  Publish --> Done([Announce])"
			},
			{
				name: "Subgraphs",
				source: "flowchart LR\n  subgraph write[Writing]\n    Draft[Draft] --> Edit[Edit]\n  end\n\n  subgraph check[Checks]\n    Links[Check links] --> Issues{Issues clear?}\n  end\n\n  Edit --> Links\n  Issues -->|Yes| Publish[Publish]\n  Issues -->|No| Edit"
			}
		]
	},
	{
		name: "Sequence",
		type: "sequenceDiagram",
		variants: [
			{
				name: "Basic",
				source: "sequenceDiagram\n  participant Reader\n  participant KM\n  Reader->>KM: Open page\n  KM-->>Reader: Rendered markdown"
			},
			{
				name: "Branching",
				source: "sequenceDiagram\n  autonumber\n  actor Reader\n  participant Shell\n  participant Store as Bundle\n\n  Reader->>Shell: Request page\n  activate Shell\n  Shell->>Store: Look up id\n  alt Page exists\n    Store-->>Shell: Markdown\n    Shell-->>Reader: Rendered page\n  else Missing id\n    Store-->>Shell: Nothing\n    Shell-->>Reader: Not found notice\n  end\n  deactivate Shell"
			},
			{
				name: "Parallel work",
				source: "sequenceDiagram\n  participant Editor\n  participant Validator\n  participant Preview\n\n  Editor->>Validator: Content changed\n  par Check issues\n    Validator-->>Editor: Problem list\n  and Redraw\n    Editor->>Preview: Refresh\n  end\n  loop While typing\n    Editor->>Preview: Debounced update\n  end"
			}
		]
	},
	{
		name: "Class",
		type: "classDiagram",
		variants: [
			{
				name: "Basic",
				source: "classDiagram\n  class Page {\n    +String id\n    +String title\n    +render()\n  }\n  Page <|-- Folder\n  Page <|-- Glossary"
			},
			{
				name: "Relationships",
				source: "classDiagram\n  direction LR\n  class Bundle {\n    +List~Page~ pages\n    +serialize() string\n  }\n  class Page {\n    +String id\n    +String title\n  }\n  class Tag {\n    +String name\n  }\n  class Renderer {\n    <<interface>>\n    +render(Page page) string\n  }\n  class MarkdownRenderer {\n    +render(Page page) string\n  }\n\n  Bundle \"1\" *-- \"1..*\" Page : contains\n  Page \"0..*\" --> \"0..*\" Tag : carries\n  Renderer <|.. MarkdownRenderer\n  Bundle --> Renderer : rendered by"
			}
		]
	},
	{
		name: "State",
		type: "stateDiagram-v2",
		variants: [
			{
				name: "Basic",
				source: "stateDiagram-v2\n  [*] --> Draft\n  Draft --> Review: submit\n  Review --> Published: approve\n  Review --> Draft: changes\n  Published --> [*]"
			},
			{
				name: "Composite",
				source: "stateDiagram-v2\n  direction LR\n  [*] --> Draft\n  Draft --> Editing : open in editor\n\n  state Editing {\n    [*] --> Typing\n    Typing --> Validating : pause\n    Validating --> Typing : issues found\n    Validating --> [*] : clean\n  }\n\n  Editing --> Published : export\n  Published --> [*]\n\n  note right of Editing\n    Undo history keeps\n    100 states in memory\n  end note"
			},
			{
				name: "Choice",
				source: "stateDiagram-v2\n  state has_issues <<choice>>\n  [*] --> Validated\n  Validated --> has_issues\n  has_issues --> Blocked : errors remain\n  has_issues --> Ready : only warnings\n  Ready --> [*]\n  Blocked --> Validated : fix and recheck"
			}
		]
	},
	{
		name: "Entity relationship",
		type: "erDiagram",
		variants: [
			{
				name: "Basic",
				source: "erDiagram\n  PAGE ||--o{ TAG : carries\n  PAGE {\n    string id\n    string title\n  }\n  TAG {\n    string name\n  }"
			},
			{
				name: "Keys and comments",
				source: "erDiagram\n  BUNDLE ||--|{ PAGE : contains\n  PAGE ||--o{ PAGE_TAG : has\n  TAG ||--o{ PAGE_TAG : \"applied through\"\n  PAGE ||--o{ TRAIL_STEP : \"appears in\"\n\n  BUNDLE {\n    string id PK\n    string title\n  }\n  PAGE {\n    string id PK\n    string bundleId FK\n    string title \"Shown in Explorer\"\n    date updated\n  }\n  TAG {\n    string name PK\n  }\n  TRAIL_STEP {\n    string trail PK\n    int position\n    string pageId FK\n  }"
			}
		]
	},
	{
		name: "User journey",
		type: "journey",
		variants: [
			{
				name: "Basic",
				source: "journey\n  title Reading a page\n  section Arrive\n    Open link: 5: Reader\n    Skim headings: 3: Reader\n  section Read\n    Follow trail: 4: Reader"
			},
			{
				name: "Several actors",
				source: "journey\n  title Publishing a bundle\n  section Write\n    Draft page: 4: Author\n    Add diagrams: 3: Author\n  section Check\n    Fix issues: 2: Author, Editor\n    Approve: 5: Editor\n  section Ship\n    Export bundle: 5: Author\n    Read it: 7: Reader"
			}
		]
	},
	{
		name: "Gantt",
		type: "gantt",
		variants: [
			{
				name: "Basic",
				source: "gantt\n  title Release plan\n  dateFormat YYYY-MM-DD\n  section Writing\n  Draft :a1, 2026-08-01, 7d\n  Review :after a1, 3d"
			},
			{
				name: "Dependencies",
				source: "gantt\n  title Manual rewrite\n  dateFormat YYYY-MM-DD\n  excludes weekends\n\n  section Research\n    Read old manual :done, read, 2026-08-03, 4d\n    Collect feedback :done, feedback, 2026-08-05, 3d\n\n  section Writing\n    New outline :active, outline, after feedback, 5d\n    First draft :draft, after outline, 10d\n    Diagrams :crit, art, after outline, 6d\n\n  section Release\n    Review pass :review, after draft art, 4d\n    Publish :milestone, after review, 0d"
			}
		]
	},
	{
		name: "Pie",
		type: "pie",
		variants: [
			{
				name: "Basic",
				source: "pie title Page kinds\n  \"Articles\" : 42\n  \"Folders\" : 9\n  \"Glossary\" : 3"
			},
			{
				name: "With values",
				source: "pie showData title Where editing time goes (minutes)\n  \"Writing\" : 180\n  \"Diagrams\" : 75\n  \"Fixing links\" : 40\n  \"Previewing\" : 25"
			}
		]
	},
	{
		name: "Quadrant",
		type: "quadrantChart",
		variants: [
			{
				name: "Basic",
				source: "quadrantChart\n  title Effort and value\n  x-axis Low effort --> High effort\n  y-axis Low value --> High value\n  Rewrite intro: [0.3, 0.8]\n  Fix typos: [0.2, 0.3]\n  New diagrams: [0.7, 0.7]"
			},
			{
				name: "Labelled quadrants",
				source: "quadrantChart\n  title Page backlog\n  x-axis Not urgent --> Urgent\n  y-axis Low impact --> High impact\n  quadrant-1 Do first\n  quadrant-2 Schedule\n  quadrant-3 Drop\n  quadrant-4 Delegate\n  Broken links: [0.85, 0.9]\n  Manual rewrite: [0.3, 0.8]\n  Tag cleanup: [0.25, 0.2]\n  Screenshot refresh: [0.7, 0.3]"
			}
		]
	},
	{
		name: "Requirement",
		type: "requirementDiagram",
		variants: [
			{
				name: "Basic",
				source: "requirementDiagram\n\n  requirement search {\n    id: 1\n    text: Pages must be findable\n    risk: medium\n    verifymethod: test\n  }\n\n  element index {\n    type: index\n  }\n\n  index - satisfies -> search"
			},
			{
				name: "Full tree",
				source: "requirementDiagram\n\n  requirement readable {\n    id: 1\n    text: A published bundle must be readable offline.\n    risk: high\n    verifymethod: test\n  }\n\n  functionalRequirement offline_assets {\n    id: 1.1\n    text: Every asset ships with the bundle.\n    risk: medium\n    verifymethod: inspection\n  }\n\n  performanceRequirement first_paint {\n    id: 1.2\n    text: First page paints within one second.\n    risk: low\n    verifymethod: demonstration\n  }\n\n  element collector {\n    type: tool\n    docRef: \"editor/collect-assets\"\n  }\n\n  readable - contains -> offline_assets\n  readable - contains -> first_paint\n  collector - satisfies -> offline_assets"
			}
		]
	},
	{
		name: "Git",
		type: "gitGraph",
		variants: [
			{
				name: "Basic",
				source: "gitGraph\n  commit id: \"draft\"\n  branch review\n  commit id: \"edits\"\n  checkout main\n  merge review\n  commit id: \"publish\""
			},
			{
				name: "Release and hotfix",
				source: "gitGraph\n  commit id: \"first bundle\"\n  branch develop\n  commit id: \"add glossary\"\n  commit id: \"add diagrams\"\n  checkout main\n  merge develop tag: \"v1.0.0\"\n  branch hotfix\n  commit id: \"fix broken link\"\n  checkout main\n  merge hotfix tag: \"v1.0.1\"\n  checkout develop\n  commit id: \"new trail\"\n  checkout main\n  merge develop tag: \"v1.1.0\""
			},
			{
				name: "Marked commits",
				source: "gitGraph TB:\n  commit id: \"groundwork\"\n  commit id: \"schema change\" type: HIGHLIGHT\n  commit id: \"undo experiment\" type: REVERSE\n  commit id: \"stabilise\" tag: \"v2.0.0-rc1\""
			}
		]
	},
	{
		name: "C4",
		type: "C4Context",
		variants: [
			{
				name: "Context",
				source: "C4Context\n  title Reader and KM\n  Person(reader, \"Reader\", \"Reads the wiki\")\n  System(km, \"KM\", \"Static wiki\")\n  System_Ext(host, \"Static host\", \"Serves the files\")\n  Rel(reader, km, \"Opens pages\")\n  Rel(km, host, \"Fetches markdown\", \"HTTPS\")"
			},
			{
				name: "Containers",
				source: "C4Container\n  title Inside a KM site\n\n  Person(reader, \"Reader\", \"Reads pages\")\n\n  Container_Boundary(site, \"KM site\") {\n    Container(shell, \"Shell\", \"HTML, JS\", \"Routes and renders pages\")\n    Container(renderer, \"Renderer\", \"JS\", \"Markdown to HTML\")\n    ContainerDb(bundle, \"Bundle\", \"Markdown file\", \"Every page in one file\")\n  }\n\n  Rel(reader, shell, \"Opens\", \"HTTPS\")\n  Rel(shell, renderer, \"Asks to render\")\n  Rel(renderer, bundle, \"Reads\")"
			}
		]
	},
	{
		name: "Mindmap",
		type: "mindmap",
		variants: [
			{
				name: "Basic",
				source: "mindmap\n  root((KM))\n    Pages\n      Tags\n      Trails\n    Rendering\n      Markdown\n      Diagrams"
			},
			{
				name: "Shapes and icons",
				source: "mindmap\n  root((Bundle))\n    Content\n      ::icon(fa fa-file-lines)\n      Pages\n      Glossary\n    Media\n      Images\n      Video and audio\n    Checks\n      reminder{{Run the Issues panel}}\n      Broken links\n      Missing media"
			}
		]
	},
	{
		name: "Timeline",
		type: "timeline",
		variants: [
			{
				name: "Basic",
				source: "timeline\n  title Bundle history\n  2026-07 : First draft\n  2026-08 : Review : Published"
			},
			{
				name: "Sections",
				source: "timeline\n  title Documentation year\n  section First half\n    January : Outline agreed\n    March : Manual rewritten : Diagrams added\n  section Second half\n    August : Media support\n    November : Translation pass"
			}
		]
	},
	{
		name: "Sankey",
		type: "sankey-beta",
		variants: [
			{
				name: "Basic",
				source: "sankey-beta\n\nSearch,Article,40\nSearch,Glossary,10\nArticle,Trail,25"
			},
			{
				name: "Funnel",
				source: "sankey-beta\n\nVisits,Home page,320\nHome page,Search,140\nHome page,Trail start,90\nHome page,Left,90\nSearch,Article,110\nSearch,Left,30\nTrail start,Article,70\nTrail start,Left,20\nArticle,Glossary,45\nArticle,Left,135"
			}
		]
	},
	{
		name: "XY chart",
		type: "xychart-beta",
		variants: [
			{
				name: "Bar and line",
				source: "xychart-beta\n  title \"Pages per month\"\n  x-axis [jan, feb, mar, apr]\n  y-axis \"Pages\" 0 --> 60\n  bar [12, 24, 38, 55]\n  line [12, 24, 38, 55]"
			},
			{
				name: "Two lines",
				source: "xychart-beta\n  title \"Pages added and archived\"\n  x-axis [Q1, Q2, Q3, Q4]\n  y-axis \"Pages\" 0 --> 80\n  line [20, 45, 62, 78]\n  line [4, 9, 12, 18]"
			}
		]
	},
	{
		name: "Block",
		type: "block-beta",
		variants: [
			{
				name: "Three tiers",
				source: "block-beta\n  columns 3\n  reader((\"Reader\")):3\n  space:3\n  shell[\"Shell\"] render[\"Renderer\"] store[(\"Bundle\")]\n\n  reader --> shell\n  shell --> render\n  render --> store"
			},
			{
				name: "Nested blocks",
				source: "block-beta\ncolumns 1\n  input((\"Markdown\"))\n  arrow<[\"&nbsp;&nbsp;&nbsp;\"]>(down)\n  block:pipeline\n    parse[\"Parse\"]\n    enhance[\"Enhance\"]\n    paint[\"Paint\"]\n  end\n  space\n  page[\"Page\"]\n  pipeline --> page"
			}
		]
	},
	{
		name: "Packet",
		type: "packet",
		variants: [
			{
				name: "Header",
				source: "packet\n  title Page record\n  0-15: \"Page id\"\n  16-31: \"Flags\"\n  32-63: \"Updated\"\n  64-127: \"Title\""
			},
			{
				name: "Relative widths",
				source: "packet\n  title Asset record\n  +16: \"Kind\"\n  +16: \"Name length\"\n  +32: \"Byte length\"\n  64-127: \"Name (variable length)\""
			}
		]
	},
	{
		name: "Kanban",
		type: "kanban",
		variants: [
			{
				name: "Basic",
				source: "kanban\n  Todo\n    [Write intro]\n  Doing\n    [Review diagrams]\n  Done\n    [Ship bundle]"
			},
			{
				name: "With metadata",
				source: "kanban\n  todo[Todo]\n    links[Fix broken links]@{ priority: 'High' }\n    trail[Plan a reading trail]\n  doing[In progress]\n    manual[Rewrite the manual]@{ assigned: 'erwan', priority: 'Very High' }\n  done[Done]\n    media[Add media support]@{ assigned: 'erwan' }"
			}
		]
	},
	{
		name: "Architecture",
		type: "architecture-beta",
		variants: [
			{
				name: "Basic",
				source: "architecture-beta\n  group site(cloud)[Static site]\n  service pages(server)[Pages] in site\n  service assets(disk)[Assets] in site\n  pages:R -- L:assets"
			},
			{
				name: "Two groups",
				source: "architecture-beta\n  group edge(cloud)[Edge]\n  group origin(cloud)[Origin]\n\n  service browser(internet)[Browser] in edge\n  service cdn(server)[CDN] in edge\n  service host(server)[Static host] in origin\n  service bundle(disk)[Bundle] in origin\n\n  browser:R --> L:cdn\n  cdn:R --> L:host\n  host:B --> T:bundle"
			},
			{
				name: "Junction",
				source: "architecture-beta\n  service reader(internet)[Reader]\n  service balancer(server)[Balancer]\n  service one(server)[Mirror one]\n  service two(server)[Mirror two]\n  junction fanout\n\n  reader:R -- L:balancer\n  balancer:R -- L:fanout\n  one:B -- T:fanout\n  two:T -- B:fanout"
			}
		]
	},
	{
		name: "Radar",
		type: "radar-beta",
		variants: [
			{
				name: "Basic",
				source: "radar-beta\n  title Page quality\n  axis clarity[\"Clarity\"], depth[\"Depth\"], links[\"Links\"], media[\"Media\"]\n  curve now[\"Now\"]{3, 4, 2, 5}"
			},
			{
				name: "Compared",
				source: "radar-beta\n  title Before and after the rewrite\n  axis clarity[\"Clarity\"], depth[\"Depth\"], links[\"Links\"]\n  axis media[\"Media\"], search[\"Findability\"]\n\n  curve before[\"Before\"]{2, 3, 2, 1, 2}\n  curve after[\"After\"]{4, 4, 5, 4, 5}\n\n  graticule polygon\n  max 5\n  min 0"
			}
		]
	},
	{
		name: "Treemap",
		type: "treemap-beta",
		variants: [
			{
				name: "Basic",
				source: "treemap-beta\n\"Bundle\"\n  \"Articles\": 42\n  \"Folders\": 9\n  \"Glossary\": 3"
			},
			{
				name: "Nested",
				source: "treemap-beta\n\"Bundle size\"\n    \"Text\"\n        \"Pages\": 180\n        \"Glossary\": 40\n    \"Media\"\n        \"Images\": 320\n        \"Video\": 240\n        \"Audio\": 60\n    \"Config\": 12"
			}
		]
	},
	{
		name: "Venn",
		type: "venn-beta",
		variants: [
			{
				name: "Basic",
				source: "venn-beta\n  title \"Page kinds\"\n  set Tagged\n  set Trailed\n  union Tagged,Trailed[\"Both\"]"
			},
			{
				name: "Sized and styled",
				source: "venn-beta\n  title \"Where our pages overlap\"\n  set REF[\"Reference\"]:20\n    text r1[\"API notes\"]\n  set HOW[\"How-to\"]:16\n    text h1[\"Quick start\"]\n  union REF,HOW[\"Both\"]:6\n    text b1[\"Cheatsheet\"]\n  style REF fill:skyblue\n  style HOW fill:lightgreen"
			}
		]
	},
	{
		name: "Ishikawa",
		type: "ishikawa-beta",
		variants: [
			{
				name: "Basic",
				source: "ishikawa-beta\n  Page went stale\n    People\n      No owner\n    Process\n      No review date"
			},
			{
				name: "Full fishbone",
				source: "ishikawa-beta\n  Readers cannot find pages\n    People\n      Nobody tags new pages\n      Trail owner left\n    Process\n      No review after publishing\n      Titles written last\n    Tooling\n      SEARCH\n        Titles only\n        No synonyms\n      NAVIGATION\n        Deep nesting\n    Content\n      Duplicate glossary terms\n      Empty landing pages"
			}
		]
	},
	{
		name: "Wardley",
		type: "wardley-beta",
		variants: [
			{
				name: "Basic",
				source: "wardley-beta\n  title Publishing chain\n  anchor Reader [0.9, 0.7]\n  component Page [0.75, 0.6]\n  component Bundle [0.6, 0.4]\n  Reader -> Page\n  Page -> Bundle"
			},
			{
				name: "Evolution and notes",
				source: "wardley-beta\ntitle Wiki value chain\nsize [1100, 800]\n\nanchor Reader [0.95, 0.70]\ncomponent Page [0.80, 0.62]\ncomponent Markdown [0.66, 0.72]\ncomponent Renderer [0.52, 0.55]\ncomponent Static host [0.30, 0.85]\n\nReader -> Page\nPage -> Markdown\nPage -> Renderer\nRenderer -> Static host\n\nevolve Renderer 0.72\n\nnote \"Hosting is a commodity\" [0.28, 0.80]"
			},
			{
				name: "Pipeline",
				source: "wardley-beta\ntitle Renderer pipeline\nsize [1100, 800]\n\ncomponent Renderer [0.57, 0.45]\ncomponent Static host [0.10, 0.70]\n\nRenderer -> Static host\n\npipeline Renderer {\n  component Server rendered [0.35]\n  component Browser rendered [0.60]\n  component Prebuilt [0.80]\n}"
			}
		]
	},
	{
		name: "Cynefin",
		type: "cynefin-beta",
		variants: [
			{
				name: "Basic",
				source: "cynefin-beta\n  clear \"Fix a typo\"\n  complicated \"Restructure trails\"\n  complex \"Rewrite the manual\"\n  chaotic \"Recover a lost bundle\""
			},
			{
				name: "With transitions",
				source: "cynefin-beta\n  title Editing decisions\n\n  clear\n    \"Fix a typo\"\n    \"Rename a page\"\n\n  complicated\n    \"Restructure trails\"\n    \"Split a long page\"\n\n  complex\n    \"Rewrite the manual\"\n\n  chaotic\n    \"Recover a lost bundle\"\n\n  confusion\n    \"Unclear scope\"\n\n  complex --> complicated : \"Shape emerges\"\n  complicated --> clear : \"Playbook written\""
			}
		]
	},
	{
		name: "Event modeling",
		type: "eventmodeling",
		variants: [
			{
				name: "Basic",
				source: "eventmodeling\n\ntf 01 ui SearchUI\ntf 02 cmd OpenPage\ntf 03 evt PageOpened\ntf 04 rmo ReadingTrail ->> 03"
			},
			{
				name: "Cross system",
				source: "eventmodeling\n\ntf 01 ui EditorUI\ntf 02 cmd SavePage [[SavePage01]]\ntf 03 evt PageSaved [[PageSaved]]\n\nrf 04 evt Host.BundleUploaded\ntf 05 pcr PublishProcessor\ntf 06 cmd RefreshIndex\ntf 07 evt Site.IndexRefreshed\n\ndata SavePage01 {\n  id: 'home'\n  title: 'Home'\n}\n\ndata PageSaved {\n  id: string\n  updated: date\n}"
			}
		]
	},
	{
		name: "Tree view",
		type: "treeView-beta",
		variants: [
			{
				name: "Files",
				source: "treeView-beta\n    km-bundle/\n        pages/\n            home.md\n            glossary.md\n        assets/\n            example-image.png\n        content.md"
			},
			{
				name: "Quoted names",
				source: "treeView-beta\n    \"Team bundle\"\n        \"Reference pages\"\n            \"Query syntax.md\"\n            \"Page headers.md\"\n        \"Media\"\n            \"intro clip.webm\"\n        \"Notes\""
			}
		]
	},
	// Railroad ships four grammar dialects, each its own diagram type.
	{
		name: "Railroad (ABNF)",
		type: "railroad-abnf-beta",
		variants: [
			{
				name: "Page route",
				source: "railroad-abnf-beta\n    title Page route\n\n    route = \"#\" page-id *( \"#\" page-id ) ;\n    page-id = 1*( ALPHA / DIGIT / \"_\" ) ;"
			}
		]
	},
	{
		name: "Railroad (EBNF)",
		type: "railroad-ebnf-beta",
		variants: [
			{
				name: "Query option",
				source: "railroad-ebnf-beta\n    title Query option\n\n    query = \"{{pages\" option* \"}}\" ;\n    option = name \"=\" value ;\n    name = letter+ ;\n    letter = \"a\" | \"b\" | \"c\" ;"
			}
		]
	},
	{
		name: "Railroad (IR)",
		type: "railroad-beta",
		variants: [
			{
				name: "Page route",
				source: "railroad-beta\n    title Page route\n\n    route = sequence(terminal(\"#\"), nonterminal(\"id\"), zeroOrMore(sequence(terminal(\"#\"), nonterminal(\"id\")))) ;\n    id = oneOrMore(nonterminal(\"letter\")) ;\n    letter = choice(terminal(\"a\"), terminal(\"b\")) ;"
			}
		]
	},
	{
		name: "Railroad (PEG)",
		type: "railroad-peg-beta",
		variants: [
			{
				name: "Tag filter",
				source: "railroad-peg-beta\n    title Tag filter\n\n    Filter <- Tag (\",\" Tag)* ;\n    Tag <- Letter+ ;\n    Letter <- \"a\" / \"b\" / \"c\" ;"
			}
		]
	},
	{
		name: "ZenUML",
		type: "zenuml",
		variants: [
			{
				name: "Basic",
				source: "zenuml\n  title Page request\n  @Actor Reader\n  @Boundary Shell\n  Reader->Shell.openPage(id) {\n    Renderer.render(page)\n  }"
			},
			{
				name: "Grouped services",
				source: "zenuml\n  title Publishing\n  @Actor Author\n  @Boundary Editor\n  group Backend {\n    @Lambda Validator\n    @EC2 Publisher\n  }\n\n  @Starter(Author)\n  Editor.save(bundle) {\n    Validator.check(bundle) {\n      if (clean) {\n        Publisher.publish(bundle)\n      }\n    }\n  }"
			}
		]
	}
];

// Single lines that add something to the diagram already in the editor. Keyed by
// the diagram type, which is how Mermaid itself decides what it is parsing.
// Placeholders avoid Mermaid keywords: `group` and `element` are reserved.
export const MERMAID_SNIPPETS = {
	flowchart: [
		["Node", "  N[Label]"],
		["Rounded", "  N(Label)"],
		["Decision", "  N{Label}"],
		["Database", "  N[(Store)]"],
		["Arrow", "  A --> B"],
		["Labelled", "  A -->|text| B"],
		["Dotted", "  A -.-> B"],
		["Thick", "  A ==> B"],
		["Subgraph", "  subgraph Group\n    A --> B\n  end"],
		["Class", "  class A highlight"]
	],
	sequenceDiagram: [
		["Participant", "  participant Name"],
		["Actor", "  actor Name"],
		["Message", "  A->>B: text"],
		["Reply", "  B-->>A: text"],
		["Activate", "  activate B"],
		["Note", "  note over A,B: text"],
		["Loop", "  loop every day\n    A->>B: ping\n  end"],
		["Alt", "  alt success\n    A->>B: ok\n  else failure\n    A->>B: retry\n  end"]
	],
	"stateDiagram-v2": [
		["State", "  Name"],
		["Transition", "  A --> B: event"],
		["Start", "  [*] --> A"],
		["End", "  A --> [*]"],
		["Composite", "  state Parent {\n    [*] --> Child\n  }"],
		["Note", "  note right of A: text"]
	],
	classDiagram: [
		["Class", "  class Name {\n    +String field\n    +method()\n  }"],
		["Inheritance", "  Base <|-- Derived"],
		["Composition", "  Whole *-- Part"],
		["Aggregation", "  Whole o-- Part"],
		["Association", "  A --> B : label"]
	],
	erDiagram: [
		["Entity", "  NAME {\n    string id\n  }"],
		["One to many", "  A ||--o{ B : has"],
		["One to one", "  A ||--|| B : has"],
		["Many to many", "  A }o--o{ B : has"]
	],
	gantt: [
		["Section", "  section Name"],
		["Task", "  Task name :a1, 2026-08-01, 5d"],
		["After", "  Task name :after a1, 3d"],
		["Milestone", "  Ship :milestone, 2026-08-15, 0d"]
	],
	pie: [["Slice", "  \"Label\" : 10"]],
	mindmap: [["Branch", "    Branch"], ["Leaf", "      Leaf"]],
	timeline: [["Event", "  2026-08 : Something happened"], ["Section", "  section Name"]],
	journey: [
		["Section", "  section Name"],
		["Step", "    Do a thing: 4: Actor"]
	],
	gitGraph: [
		["Commit", "  commit id: \"name\""],
		["Branch", "  branch name"],
		["Checkout", "  checkout main"],
		["Merge", "  merge name"],
		["Tag", "  commit tag: \"v1\""]
	],
	kanban: [["Column", "  Column name"], ["Card", "    [Card text]"]],
	"sankey-beta": [["Flow", "Source,Target,10"]],
	quadrantChart: [
		["Point", "  Label: [0.5, 0.5]"],
		["X axis", "  x-axis Low --> High"],
		["Y axis", "  y-axis Low --> High"],
		["Quadrant", "  quadrant-1 Name"]
	],
	"block-beta": [
		["Block", "  name[\"Label\"]"],
		["Round", "  name((\"Label\"))"],
		["Store", "  name[(\"Label\")]"],
		["Space", "  space"],
		["Arrow", "  a --> b"]
	],
	"xychart-beta": [
		["Bar", "  bar [1, 2, 3]"],
		["Line", "  line [1, 2, 3]"],
		["X axis", "  x-axis [a, b, c]"],
		["Y axis", "  y-axis \"Value\" 0 --> 10"]
	],
	"architecture-beta": [
		["Group", "  group groupId(cloud)[Label]"],
		["Service", "  service serviceId(server)[Label] in groupId"],
		["Junction", "  junction pointId"],
		["Edge", "  a:R -- L:b"]
	],
	requirementDiagram: [
		["Requirement", "  requirement name {\n    id: 1\n    text: what it must do\n    risk: low\n    verifymethod: test\n  }"],
		["Element", "  element elementId {\n    type: doc\n  }"],
		["Satisfies", "  elementId - satisfies -> requirementId"]
	],
	C4Context: [
		["Person", "  Person(id, \"Name\", \"Role\")"],
		["System", "  System(id, \"Name\", \"What it does\")"],
		["Relation", "  Rel(from, to, \"Label\")"]
	],
	"radar-beta": [
		["Axes", "  axis a[\"A\"], b[\"B\"], c[\"C\"]"],
		["Curve", "  curve name[\"Name\"]{1, 2, 3}"]
	],
	"treemap-beta": [["Leaf", "  \"Label\": 10"], ["Branch", "\"Label\""]],
	"venn-beta": [
		["Set", "  set name [\"Label\"]"],
		["Union", "  union a,b[\"Label\"]"]
	],
	"ishikawa-beta": [["Category", "    Category"], ["Cause", "      Cause"]],
	"wardley-beta": [
		["Anchor", "  anchor Name [0.9, 0.7]"],
		["Component", "  component Name [0.6, 0.4]"],
		["Link", "  A -> B"],
		["Evolve", "  evolve Name 0.8"]
	],
	"cynefin-beta": [
		["Clear", "  clear \"Item\""],
		["Complicated", "  complicated \"Item\""],
		["Complex", "  complex \"Item\""],
		["Chaotic", "  chaotic \"Item\""]
	],
	packet: [["Field", "  0-7: \"Name\""], ["Relative", "  +16: \"Name\""]],
	eventmodeling: [
		["Screen", "tf 01 ui ScreenName"],
		["Command", "tf 02 cmd CommandName"],
		["Event", "tf 03 evt EventName"],
		["Read model", "tf 04 rmo ViewName ->> 03"]
	],
	"treeView-beta": [["Folder", "    folder/"], ["File", "        file.md"]],
	"railroad-abnf-beta": [["Rule", "    name = \"a\" ;"]],
	"railroad-ebnf-beta": [["Rule", "    name = \"a\" | \"b\" ;"]],
	"railroad-beta": [["Rule", "    name = choice(terminal(\"a\"), terminal(\"b\")) ;"]],
	"railroad-peg-beta": [["Rule", "    Name <- \"a\" / \"b\" ;"]],
	zenuml: [
		["Actor", "  @Actor Name"],
		["Call", "  A.method(arg) {\n  }"],
		["Group", "  group Name {\n    @Lambda Service\n  }"]
	]
};
