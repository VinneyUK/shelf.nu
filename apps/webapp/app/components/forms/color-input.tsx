import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { darkenColor } from "~/utils/color-contrast";
import { distinctColor } from "~/utils/distinct-color";
import Input from "./input";

import { Button } from "../shared/button";

export const ColorInput = ({
  colorFromServer,
  usedColors = [],
  ...rest
}: {
  colorFromServer?: string;
  /** Fork: colours already in use, so the next one is picked to stand apart */
  usedColors?: string[];
  [key: string]: any;
}) => {
  // Re-sync with server-provided color when it changes (e.g. on save revalidation).
  // Uses the "store previous prop in a ref" pattern instead of useEffect to avoid a
  // render flash. See
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [color, setColor] = useState<string>(() => colorFromServer || "");
  const prevColorFromServer = useRef(colorFromServer);
  if (colorFromServer !== prevColorFromServer.current) {
    prevColorFromServer.current = colorFromServer;
    setColor(colorFromServer || "");
  }

  const handleColorChange = (e: ChangeEvent<HTMLInputElement>) => {
    setColor(() => `${e.target.value}`);
  };

  // fork: the colours already in use (categories and tags), fetched on first use
  const used = useFetcher<{ colors: string[] }>();
  const inUse = usedColors.length ? usedColors : used.data?.colors ?? null;
  const handleRefresh = () => {
    if (!inUse) {
      void used.load("/api/colors/used");
      return;
    }
    setColor(() => distinctColor([...inUse, color].filter(Boolean)));
  };
  // Once the list arrives after a press, make the pick
  const pending = useRef(false);
  if (used.state === "loading") pending.current = true;
  useEffect(() => {
    if (pending.current && used.state === "idle" && used.data?.colors) {
      pending.current = false;
      setColor((c) => distinctColor([...used.data!.colors, c].filter(Boolean)));
    }
  }, [used.state, used.data]);

  // Use darkened color for icon text to match Badge component
  const iconColor = color ? darkenColor(color, 0.5) : undefined;

  return (
    <div className="flex items-end gap-1">
      <Input
        label="Hex Color"
        value={color}
        onChange={handleColorChange}
        className="w-full min-w-[120px] lg:max-w-[120px]"
        {...rest}
      />
      {/* fork: a proper colour picker alongside the hex box */}
      <input
        type="color"
        aria-label="Pick a colour"
        title="Pick a colour"
        value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#888888"}
        onChange={handleColorChange}
        className="h-10 w-10 cursor-pointer rounded border border-gray-300 bg-transparent p-0.5"
      />
      <Button
        icon="refresh"
        variant="secondary"
        size="sm"
        as="a"
        onClick={handleRefresh}
        className="cursor-pointer p-2"
        style={{
          backgroundColor: `${color}33`,
          color: iconColor,
        }}
        title="Suggest a colour that stands apart from the ones in use"
        data-test-id="generateRandomColor"
      />
    </div>
  );
};
