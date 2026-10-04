/**
 * Rewrites Shelf's wording on screen as pages render (see vocabulary.ts).
 * Mounted once in the main layout. Not in upstream Shelf.
 *
 * Only text nodes are touched, never attributes, inputs or the user's own
 * names, so stored data is unaffected. Pages the user's own text headlines
 * (an asset's or kit's page) keep their heading as written.
 */
import { useEffect } from "react";
import { useLocation } from "react-router";
import { applyVocabulary, VOCABULARY_SKIP_SELECTOR } from "./vocabulary";

const WORD = /\bkits?\b/i;

function userHeadingPage(pathname: string) {
  return /^\/(assets|kits)\/[^/]+/.test(pathname);
}

function rewrite(root: Node, pathname: string) {
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
      !parent.closest(VOCABULARY_SKIP_SELECTOR)
    ) {
      if (!(skipHeadings && parent.closest("h1"))) {
        const next = applyVocabulary(text);
        if (next !== text) node.nodeValue = next;
      }
    }
    node = walker.nextNode();
  }
}

export function VocabularyRenamer() {
  const { pathname } = useLocation();
  useEffect(() => {
    rewrite(document.body, pathname);
    document.title = applyVocabulary(document.title);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "characterData" && m.target.parentNode) {
          rewrite(m.target, pathname);
        }
        m.addedNodes.forEach((n) => rewrite(n, pathname));
      }
      if (WORD.test(document.title))
        document.title = applyVocabulary(document.title);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
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
