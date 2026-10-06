/**
 * Fork (VinneyUK/shelf.nu): renames Shelf's visible wording in the source.
 * "Kit" is "Box" here and "Location" is "Place". Done in the source (not on
 * screen after load) so pages arrive already saying Boxes and Places.
 *
 * It parses every file with the TypeScript compiler and rewrites only what a
 * person can see: JSX text, and string literals that are user-facing (JSX
 * attributes such as title / placeholder / label, and strings with spaces in
 * them anywhere else). It never touches identifiers, import paths, routes and
 * addresses (anything with a "/"), form field names, ids, enum-style values
 * (KIT, LOCATION), object keys, or test ids. Words inside other words (Toolkit,
 * allocation) are left alone.
 *
 *   npx tsx scripts/vocabulary-rename.ts            # rewrite the app
 *   npx tsx scripts/vocabulary-rename.ts --check    # list what would change
 *
 * After a Shelf update, re-run it: the script is the record of the rename,
 * not the hundreds of edits it makes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..", "app");
const TEST_DIR = path.resolve(HERE, "..", "test");

/** One rule per word, singular and plural, applied with the original's capitalisation. */
export const RULES: { from: RegExp; one: string; many: string }[] = [
  // never after "/" or "-": that is a path (/kits/…) or an id (kit-1), not wording
  { from: /(?<![/-])\b(kit)(s?)\b(?!-)/gi, one: "box", many: "boxes" },
  { from: /(?<![/-])\b(location)(s?)\b(?!-)/gi, one: "place", many: "places" },
];

function matchCase(from: string, to: string) {
  if (from === from.toUpperCase()) return to.toUpperCase();
  if (from[0] === from[0].toUpperCase())
    return to[0].toUpperCase() + to.slice(1);
  return to;
}

/** "Add to kit" → "Add to box"; "Locations" → "Places". Enum-style words (KIT) are kept. */
export function renameWords(text: string): string {
  let out = text;
  for (const { from, one, many } of RULES) {
    out = out.replace(from, (whole, word: string, plural: string) =>
      word === word.toUpperCase() ? whole : matchCase(word, plural ? many : one)
    );
  }
  return out;
}

/** Lookup tables whose every value is wording ("kit: \"Kit\"" is a heading). */
const LABEL_MAPS = new Set(["columnsLabelsMap"]);

/** JSX attributes whose value is wording a person sees. */
const WORDING_ATTRIBUTES = new Set([
  "singular", // a list's name for one of its rows ("kit"): the search label, heading and empty text
  "plural",
  "contentLabel", // the heading of a dropdown list ("Locations")
  "header", // a table column heading
  "title",
  "placeholder",
  "label",
  "aria-label",
  "tooltip",
  "description",
  "heading",
  "subHeading",
  "subheading",
  "content",
  "text",
  "message",
  "emptyStateTitle",
  "emptyStateText",
  "rowLabel",
  "buttonLabel",
  "helperText",
  "hint",
  "legend",
  "alt",
]);
/** JSX attributes and object keys that are never wording. */
const NEVER_ATTRIBUTES = new Set([
  "name",
  "id",
  "key",
  "to",
  "href",
  "action",
  "value",
  "field",
  "type",
  "entity",
  "intent",
  "queryKey",
  "model",
  "data-test-id",
  "data-testid",
  "className",
  "src",
  "method",
  "as",
  "role",
  "htmlFor",
  "defaultValue",
  "useFor",
  "icon",
  "variant",
  "size",
  "fieldName",
  "resource",
]);
const NEVER_KEYS = new Set([
  "label", // Shelf's error category ("Kit", "Location"), not wording
  "name",
  "id",
  "key",
  "to",
  "href",
  "action",
  "value",
  "field",
  "type",
  "entity",
  "intent",
  "queryKey",
  "model",
  "path",
  "route",
  "table",
  "column",
  "relation",
  "fieldName",
  "resource",
  "useFor",
  "icon",
  "variant",
  "api",
  "url",
  "slug",
  "kind",
  "scope",
  "tag",
  "status",
]);

/** `cond ? "kit" : "kits"` (either order): wording chosen by count. */
function isSingularPluralPair(node: ts.ConditionalExpression): boolean {
  const a = node.whenTrue;
  const b = node.whenFalse;
  if (!ts.isStringLiteral(a) || !ts.isStringLiteral(b)) return false;
  const [x, y] = [a.text.toLowerCase(), b.text.toLowerCase()].sort();
  return RULES.some((r) => {
    const word = r.from.source.match(/\(([a-z]+)\)/)?.[1];
    return word !== undefined && x === word && y === `${word}s`;
  });
}

/** A chunk of a tagged template such as Prisma.sql`…` or sql`…`: SQL, not wording. */
function isTaggedSql(node: ts.Node): boolean {
  const tpl = node.parent?.parent; // TemplateSpan → TemplateExpression
  const tagged = tpl?.parent;
  if (!tagged || !ts.isTaggedTemplateExpression(tagged)) return false;
  return /sql$/i.test(tagged.tag.getText());
}

/** `expect(x).toContain("kit")` and the like: the string is wording being looked for. */
function isTextAssertionArgument(node: ts.Node): boolean {
  const call = node.parent;
  if (
    !ts.isCallExpression(call) ||
    !ts.isPropertyAccessExpression(call.expression)
  )
    return false;
  const method = call.expression.name.getText();
  if (
    /^(toHaveTextContent|toHaveAccessibleName|getByText|queryByText|findByText|getByLabelText|getByRole)$/.test(
      method
    )
  )
    return true;
  // toContain / toMatch: wording only when what's checked is a message or text,
  // not an array of keys: expect(body.error.message).toContain("kit")
  if (/^(toContain|toMatch)$/.test(method)) {
    const subject = call.expression.expression.getText();
    return /message|text|content|label|title|description|body/i.test(subject);
  }
  return false;
}

/** SQL, in a string or a template chunk: table names and keywords are code. */
const looksLikeSql = (s: string) =>
  /\b(SELECT|JOIN|FROM|WHERE|GROUP BY|ORDER BY|LEFT|INNER|LATERAL|COALESCE|EXISTS|INSERT|UPDATE|DELETE)\b/.test(
    s
  ) ||
  /public\."|"[A-Z][A-Za-z]+"\s+[a-z]{1,3}\b|::|\$\d/.test(s) ||
  /^\s*--/.test(s);

const hasWord = (s: string) =>
  RULES.some((r) => new RegExp(r.from.source, "i").test(s));

/** Whether a string literal in this position is wording a person sees. */
function isWording(
  node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral
): boolean {
  const text = node.text;
  if (!hasWord(text)) return false;
  if (looksLikeSql(text)) return false;
  if (text.includes("/") || text.includes("_") || /^[A-Z0-9_]+$/.test(text))
    return false;
  const parent = node.parent;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent))
    return false;
  if (ts.isJsxAttribute(parent)) {
    const name = parent.name.getText();
    if (NEVER_ATTRIBUTES.has(name)) return false;
    if (WORDING_ATTRIBUTES.has(name)) return true;
    return text.includes(" ");
  }
  if (ts.isPropertyAssignment(parent)) {
    if (parent.name === node) return false; // an object key
    const key = parent.name.getText().replace(/^["']|["']$/g, "");
    const declaration = parent.parent?.parent;
    if (
      declaration &&
      ts.isVariableDeclaration(declaration) &&
      LABEL_MAPS.has(declaration.name.getText())
    )
      return true;
    // A `header` is wording only on a screen (a table heading). In an export or
    // import it is the exact column name the importer reads, and must not change.
    if (
      key === "header" &&
      !node.getSourceFile().fileName.includes("/components/")
    )
      return false;
    if (NEVER_KEYS.has(key))
      return key === "label" ? text.includes(" ") : false;
    if (WORDING_ATTRIBUTES.has(key)) return true;
    return text.includes(" ");
  }
  if (
    ts.isPropertyAccessExpression(parent) ||
    ts.isElementAccessExpression(parent)
  )
    return false;
  // `n === 1 ? "kit" : "kits"`: both branches the singular and plural of one word
  if (ts.isConditionalExpression(parent) && isSingularPluralPair(parent))
    return true;
  // "…" + "…" builds wording; ===, !== and the like compare with data
  if (ts.isBinaryExpression(parent))
    return (
      parent.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      text.includes(" ")
    );
  if (ts.isCaseClause(parent)) return false;
  if (ts.isCallExpression(parent)) {
    const callee = parent.expression.getText();
    if (
      /^(z\.|useFetcher|fetch|redirect|navigate|searchParams|formData|get|set|has|append|delete|includes|startsWith|endsWith|indexOf|split|join|replace|match)/.test(
        callee
      )
    ) {
      return text.includes(" ");
    }
  }
  // A lone word in code is almost always a value, not wording
  return text.includes(" ");
}

/**
 * Test files are renamed uniformly: every string and regular expression,
 * except paths. A fixture and the assertion that reads it back must change
 * together, whichever side carries the word.
 */
const isTestFile = (file: string) =>
  /\.test\.tsx?$/.test(file) || file.startsWith(TEST_DIR);

function rewriteFile(file: string, check: boolean): number {
  const source = fs.readFileSync(file, "utf8");
  const testFile = isTestFile(file);
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    // by extension: parsing .ts as TSX turns generics like <T> into JSX, and their
    // surroundings into "JSX text" that would be rewritten
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const edits: { start: number; end: number; text: string }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const next = renameWords(node.text);
      if (next !== node.text)
        edits.push({ start: node.getStart(), end: node.getEnd(), text: next });
    } else if (testFile && ts.isRegularExpressionLiteral(node)) {
      // rename the body only: the leading "/" would otherwise read as a path
      const raw = node.getText();
      const end = raw.lastIndexOf("/");
      const next = "/" + renameWords(raw.slice(1, end)) + raw.slice(end);
      if (next !== raw)
        edits.push({ start: node.getStart(), end: node.getEnd(), text: next });
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      const codeKey =
        ts.isPropertyAssignment(node.parent) &&
        node.parent.name !== node &&
        NEVER_KEYS.has(
          node.parent.name.getText().replace(/^["']|["']$/g, "")
        ) &&
        !node.text.includes(" ");
      const wording = testFile
        ? !codeKey &&
          hasWord(node.text) &&
          // an identifier such as a test id or fixture id ("kit-1"), not wording
          !(!node.text.includes(" ") && /[-_]/.test(node.text)) &&
          // a lone word ("kit", "Kits") is a value, as in the app's own rule, unless
          // it is what a text assertion looks for: toContain("kit")
          !(!node.text.includes(" ") && !isTextAssertionArgument(node)) &&
          // query strings and CSV lines are data (paths inside other strings are
          // protected by the word rules themselves)
          !/&/.test(node.text) &&
          !/,\S/.test(node.text) &&
          // SQL in an expectation is code
          !/\b(SELECT|JOIN|FROM|WHERE)\b/.test(node.text) &&
          !ts.isImportDeclaration(node.parent) &&
          !/^[A-Z0-9_]+$/.test(node.text)
        : isWording(node);
      if (wording) {
        const next = renameWords(node.text);
        if (next !== node.text) {
          const raw = node.getText();
          const quote = raw[0];
          edits.push({
            start: node.getStart(),
            end: node.getEnd(),
            text: quote + renameWords(raw.slice(1, -1)) + quote,
          });
        }
      }
    } else if (
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      // text chunks of `...${x}...` templates: only chunks with spaces (wording)
      if (
        hasWord(node.text) &&
        (testFile || node.text.includes(" ")) &&
        !node.text.includes("/") &&
        !looksLikeSql(node.text) &&
        !isTaggedSql(node)
      ) {
        const raw = node.getText();
        const next = renameWords(raw);
        if (next !== raw)
          edits.push({
            start: node.getStart(),
            end: node.getEnd(),
            text: next,
          });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  let out = source;
  for (const e of edits.sort((a, b) => b.start - a.start))
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  // Shelf pluralises by appending "s" in a template: `kit${n === 1 ? "" : "s"}`.
  // "box" needs "es", so fix that pattern after the rename.
  out = out.replace(/\b([Bb]ox\$\{[^}]*\?\s*""\s*:\s*)"s"(\s*\})/g, '$1"es"$2');
  out = out.replace(/\b([Bb]ox\$\{[^}]*\?\s*)"s"(\s*:\s*""\s*\})/g, '$1"es"$2');
  if (out === source) return 0;
  if (!check) fs.writeFileSync(file, out);
  return Math.max(edits.length, 1);
}

function walk(dir: string, out: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "emails") continue;
      walk(full, out);
    } else if (/\.(tsx?)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name))
      out.push(full);
  }
  return out;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const check = process.argv.includes("--check");
  let files = 0;
  let total = 0;
  for (const file of [...walk(APP_DIR), ...walk(TEST_DIR)]) {
    const n = rewriteFile(file, check);
    if (n) {
      files += 1;
      total += n;
      if (check) console.log(`${path.relative(process.cwd(), file)}: ${n}`);
    }
  }
  console.log(
    `${check ? "would change" : "changed"} ${total} strings in ${files} files`
  );
}
