/**
 * Fork: light / dark / auto theme. Per browser (localStorage), applied as the
 * "dark" class on <html>. The inline script in root.tsx applies it before the
 * first paint so there's no flash; this module handles changes afterwards.
 */
export type Theme = "light" | "dark" | "auto";
export const THEME_KEY = "shelf-theme";
export const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "auto", label: "Auto" },
];

export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "auto";
  } catch {
    return "auto";
  }
}

export function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "auto" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // private mode etc.: the choice just doesn't persist
  }
  applyTheme(theme);
}

/** Runs before the first paint. Mirrors getTheme + applyTheme, standalone. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");var d=t==="dark"||((t!=="light")&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})();`;
