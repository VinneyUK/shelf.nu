/**
 * Rewrites Shelf's wording on screen as pages render (see vocabulary.ts).
 * Mounted once in the main layout. Not in upstream Shelf.
 *
 * Text, and the placeholder / tooltip / aria-label attributes, are rewritten.
 * Never inputs' values, the user's own names, or the headings of an asset's or
 * box's own page, so stored data is unaffected.
 */
import { useEffect } from "react";
import { useLocation } from "react-router";
import { applyVocabulary, VOCABULARY_SKIP_SELECTOR } from "./vocabulary";

const WORD = /\bkits?\b/i;
const ATTRIBUTES = ["placeholder", "title", "aria-label"];

function userHeadingPage(pathname: string) {
  return /^\/(assets|kits)\/[^/]+/.test(pathname);
}

/**
 * A link straight to one asset or box: its text is the user's own name for it
 * ("Camera kit"), so it's left alone. The Kits menu link, "New kit" and the
 * like aren't, and are renamed.
 */
function isUserNameLink(el: Element) {
  const href = el.closest("a")?.getAttribute("href") ?? "";
  return /^\/(assets|kits)\/(?!new(?:[/?#]|$))[^/?#]+$/.test(href);
}

/** Text nodes under (and including) `root`. */
export function rewriteText(root: Node, pathname: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const skipHeadings = userHeadingPage(pathname);
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node.nodeValue;
    const parent = node.parentElement;
    if (
      text &&
      WORD.test(text) &&
      parent &&
      !parent.closest(VOCABULARY_SKIP_SELECTOR) &&
      !isUserNameLink(parent)
    ) {
      if (!(skipHeadings && parent.closest("h1"))) {
        const next = applyVocabulary(text);
        if (next !== text) node.nodeValue = next;
      }
    }
    node = walker.nextNode();
  }
}

/**
 * Whether an element's attribute is Shelf's wording rather than the user's.
 * A name shown as a link's text and repeated in its tooltip is the user's.
 */
function isShelfWording(el: Element, name: string, value: string) {
  if (el.closest("[data-vocabulary-skip],[contenteditable]")) return false;
  if (name === "placeholder") return true; // a placeholder is always Shelf's
  return (el.textContent ?? "").trim() !== value.trim();
}

/** The placeholder, tooltip and aria-label attributes of `el` and everything under it. */
export function rewriteAttributes(el: Element) {
  const targets = [
    el,
    ...el.querySelectorAll(ATTRIBUTES.map((a) => `[${a}]`).join(",")),
  ];
  for (const target of targets) {
    for (const name of ATTRIBUTES) {
      const value = target.getAttribute(name);
      if (value && WORD.test(value) && isShelfWording(target, name, value)) {
        const next = applyVocabulary(value);
        if (next !== value) target.setAttribute(name, next);
      }
    }
  }
}

export function VocabularyRenamer() {
  const { pathname } = useLocation();
  useEffect(() => {
    rewriteText(document.body, pathname);
    rewriteAttributes(document.body);
    document.title = applyVocabulary(document.title);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "characterData" && m.target.parentNode) {
          rewriteText(m.target, pathname);
        } else if (m.type === "attributes" && m.target instanceof Element) {
          rewriteAttributes(m.target);
        }
        m.addedNodes.forEach((n) => {
          rewriteText(n, pathname);
          if (n instanceof Element) rewriteAttributes(n);
        });
      }
      if (WORD.test(document.title))
        document.title = applyVocabulary(document.title);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTES,
    });
    const title = document.querySelector("title");
    if (title)
      observer.observe(title, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}
