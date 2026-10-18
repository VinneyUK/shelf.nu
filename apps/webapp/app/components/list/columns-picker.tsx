/**
 * The column picker of the Advanced views (fork): Assets' own, made usable by
 * any list. A fixed column at the top, the others to tick and drag into order
 * (or Alt+↑↓), Select all / Deselect all, and Apply. Assets and Filament both
 * use it, so the two look and behave the same.
 */
import type { ReactNode } from "react";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
} from "@radix-ui/react-popover";
import { Reorder } from "framer-motion";
import { FakeCheckbox } from "~/components/forms/fake-checkbox";
import { ChevronRight, HandleIcon } from "~/components/icons/library";
import { Button } from "~/components/shared/button";
import { useKeyboardReorder } from "~/hooks/use-keyboard-reorder";
import { tw } from "~/utils/tw";

export type PickerColumn = {
  name: string;
  label: string;
  visible: boolean;
  /** Shown after the label, e.g. "(cf)" for a custom field */
  suffix?: string;
};

export function ColumnsPicker({
  fixedLabel,
  columns: initialColumns,
  onApply,
  disabled = false,
}: {
  /** The column that's always shown, first */
  fixedLabel: string;
  columns: PickerColumn[];
  onApply: (columns: PickerColumn[]) => void;
  disabled?: boolean;
}) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [currentColumns, setCurrentColumns] = useState(initialColumns);
  // Re-sync when the columns given change (after a save), without an effect
  const [prevInitialColumns, setPrevInitialColumns] = useState(initialColumns);
  if (initialColumns !== prevInitialColumns) {
    setPrevInitialColumns(initialColumns);
    setCurrentColumns(initialColumns);
  }

  const { handleKeyDown, announcement, itemRefs } = useKeyboardReorder({
    items: currentColumns,
    onReorder: setCurrentColumns,
    getItemName: (column) => column.label,
  });

  const toggle = (index: number) =>
    setCurrentColumns((prev) =>
      prev.map((column, i) =>
        i === index ? { ...column, visible: !column.visible } : column
      )
    );
  const setAll = (visible: boolean) =>
    setCurrentColumns((prev) => prev.map((column) => ({ ...column, visible })));

  const hasChanges =
    JSON.stringify(initialColumns) !== JSON.stringify(currentColumns);

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          icon="columns"
          className="mt-2 font-normal text-gray-500 md:mt-0"
          width="full"
          title="Columns configuration"
          aria-label={"Columns configuration"}
        />
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          align="end"
          className={tw(
            "z-20 mt-1  w-[240px] rounded-md border border-gray-300 bg-white p-0"
          )}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onApply(currentColumns);
              setIsPopoverOpen(false);
            }}
          >
            {/* ARIA live region for screen reader announcements */}
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="sr-only"
            >
              {announcement}
            </div>
            <div className="content-inner relative mb-[60px] max-h-[412px] overflow-y-scroll">
              <div className="py-[2px]">
                <div className="px-[10px] py-2 text-gray-500">
                  Fixed columns
                </div>
                <ColumnRow className="flex items-center gap-1 pb-2">
                  <FakeCheckbox
                    checked={true}
                    className={tw("mr-1 text-gray-600")}
                  />
                  {fixedLabel}
                </ColumnRow>
              </div>

              <div className="border-t py-[2px]">
                <div className="flex items-center justify-between px-[10px] py-2 text-gray-500">
                  <div>
                    <div>Columns ({currentColumns.length})</div>
                    <div className="text-xs text-gray-400">
                      Alt+↑↓ to reorder
                    </div>
                  </div>
                  <ColumnsBulkActions
                    onSelectAll={() => setAll(true)}
                    onDeselectAll={() => setAll(false)}
                  />
                </div>
                <div className="sr-only" id="reorder-instructions">
                  Use Tab to navigate between column labels and drag handles.
                  Press Space or Enter on a column label to toggle its
                  visibility. Focus the drag handle and press Alt plus arrow up
                  or arrow down to reorder columns.
                </div>
                <Reorder.Group
                  values={currentColumns}
                  onReorder={setCurrentColumns}
                  as="ul"
                  role="list"
                  aria-label="Reorderable columns list"
                  aria-describedby="reorder-instructions"
                >
                  {currentColumns.map((column, index) => (
                    <Reorder.Item
                      key={column.name}
                      value={column}
                      as="li"
                      role="listitem"
                      aria-label={`${column.label}, position ${index + 1} of ${
                        currentColumns.length
                      }`}
                    >
                      <ColumnRow>
                        <div className="flex items-center gap-1">
                          <div
                            role="checkbox"
                            aria-checked={column.visible}
                            tabIndex={0}
                            onClick={() => toggle(index)}
                            onKeyDown={(e) => {
                              if (e.key === " " || e.key === "Enter") {
                                e.preventDefault();
                                toggle(index);
                              }
                            }}
                            className="flex flex-1 items-center text-[14px] font-medium text-gray-700 hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                          >
                            <FakeCheckbox
                              checked={column.visible}
                              className={tw(
                                "mr-1 text-white",
                                column.visible ? "text-primary" : ""
                              )}
                            />
                            <span>{column.label}</span>
                            {column.suffix ? (
                              <span className=" lowercase text-gray-500">
                                {" "}
                                {column.suffix}
                              </span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            ref={(el) => {
                              itemRefs.current[index] = el;
                            }}
                            onKeyDown={(e) => handleKeyDown(e, index)}
                            className="flex h-auto cursor-move items-center p-1 text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
                            aria-label={`Reorder ${column.label}`}
                            aria-describedby="reorder-instructions"
                            aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                            title="Drag to reorder or use Alt+Arrow keys"
                            tabIndex={0}
                          >
                            <div className="h-auto w-2">
                              <HandleIcon />
                            </div>
                          </button>
                        </div>
                      </ColumnRow>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              </div>
            </div>
            <footer className="absolute bottom-0 w-full border-t bg-white p-[10px]">
              <Button
                type="submit"
                disabled={!hasChanges || disabled}
                variant="secondary"
                width="full"
              >
                Apply
              </Button>
            </footer>
          </form>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}

function ColumnRow({
  children,
  className,
}: {
  children: ReactNode | string;
  className?: string;
}) {
  return <div className={tw("px-[10px] py-[6px]", className)}>{children}</div>;
}

function ColumnsBulkActions({
  onSelectAll,
  onDeselectAll,
}: {
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger>
        <ChevronRight className="mr-2 rotate-90" />
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          align="end"
          className={tw(
            "z-20 mt-2 w-[200px] rounded-md border border-gray-300 bg-white p-0"
          )}
        >
          <Button
            type="button"
            className=" justify-start whitespace-nowrap p-2 text-gray-700 hover:bg-gray-50 hover:text-gray-700 "
            variant="link"
            width="full"
            onClick={() => {
              onSelectAll();
              setIsOpen(false);
            }}
          >
            Select all
          </Button>
          <Button
            type="button"
            className=" justify-start whitespace-nowrap p-2 text-gray-700 hover:bg-gray-50 hover:text-gray-700  "
            variant="link"
            width="full"
            onClick={() => {
              onDeselectAll();
              setIsOpen(false);
            }}
          >
            Deselect all
          </Button>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}
