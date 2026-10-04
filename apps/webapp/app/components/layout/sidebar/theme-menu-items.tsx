/**
 * Fork: Light / Dark / Auto in the user menu.
 */
import { useEffect, useState } from "react";
import { MoonIcon, SunIcon, SunMoonIcon } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
} from "~/components/shared/dropdown";
import {
  applyTheme,
  getTheme,
  setTheme,
  THEMES,
  type Theme,
} from "~/utils/theme";

const ICONS = { light: SunIcon, dark: MoonIcon, auto: SunMoonIcon };

export function ThemeMenuItems() {
  const [theme, setCurrent] = useState<Theme>("auto");

  useEffect(() => {
    setCurrent(getTheme());
    // Auto follows the device: react when it changes
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => applyTheme(getTheme());
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);

  return (
    <>
      <DropdownMenuLabel className="px-2 pb-0 pt-2 text-xs font-medium text-gray-500">
        Theme
      </DropdownMenuLabel>
      {THEMES.map(({ value, label }) => {
        const Icon = ICONS[value];
        const active = theme === value;
        return (
          <DropdownMenuItem
            key={value}
            className={`cursor-pointer gap-2 p-2 ${
              active ? "font-semibold text-gray-900" : ""
            }`}
            onSelect={(e) => {
              e.preventDefault(); // keep the menu open while choosing
              setTheme(value);
              setCurrent(value);
            }}
            aria-checked={active}
            role="menuitemradio"
          >
            <Icon className="size-4" />
            {label}
            {active ? (
              <span className="ml-auto text-xs text-gray-500">✓</span>
            ) : null}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}
