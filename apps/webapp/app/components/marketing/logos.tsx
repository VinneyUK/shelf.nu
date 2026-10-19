import { config } from "~/config/shelf.config";
import { tw } from "~/utils/tw";
import { VinventorySymbol, VinventoryWordmark } from "./vinventory-logo"; // fork
import When from "../when/when";

/**
 * Logo shown in the sidebar
 * If a custom logo is used, we dynamically show that or the symbol depending on {optimisticMinimizedSidebar}
 */
export const ShelfSidebarLogo = ({ minimized }: { minimized: boolean }) => {
  const { logoPath } = config;

  /** If a custom logo is used, we just use that instead of doing the dynamic shelf typograpy */
  if (logoPath) {
    return minimized ? (
      <img
        src={logoPath.symbol}
        alt="Logo"
        className="mx-1.5 inline h-[32px] transition duration-150 ease-linear"
      />
    ) : (
      <img
        src={logoPath.fullLogo}
        alt="Shelf Logo"
        className="mx-1.5 inline h-[32px] transition duration-150 ease-linear"
      />
    );
  }

  // fork: Vinventory's logo; just the square when the sidebar is collapsed
  return (
    <>
      <VinventorySymbol className="mx-1.5 inline size-8 shrink-0 rounded-[5px]" />
      <When truthy={!minimized}>
        <span className="logo-text ml-1 text-gray-900 transition duration-150 ease-linear">
          <VinventoryWordmark className="h-[18px] w-auto" />
        </span>
      </When>
    </>
  );
};

/**
 * Logo shown in the header for mobile screen sizes
 */
export const ShelfMobileLogo = () => {
  const { logoPath } = config;

  if (logoPath) {
    return <img src={logoPath.fullLogo} alt="Shelf Logo" className="h-full" />;
  }

  // fork: Vinventory's logo
  return (
    <span className="flex h-full items-center gap-2 text-gray-900">
      <VinventorySymbol className="h-full w-auto rounded-[4px]" />
      <VinventoryWordmark className="h-3/5 w-auto" />
    </span>
  );
};

/**
 * Lego symbol
 */
export const ShelfSymbolLogo = ({ className }: { className?: string }) => {
  const { logoPath } = config;
  const classes = tw("mx-auto mb-2 size-12", className);

  if (logoPath) {
    return <img src={logoPath.symbol} alt="Shelf Logo" className={classes} />;
  }

  // fork: Vinventory's symbol
  return <VinventorySymbol className={tw("rounded-md", classes)} />;
};

/**
 * Full logo
 */
export const ShelfFullLogo = ({ className }: { className?: string }) => {
  const { logoPath } = config;
  const classes = tw(className);

  if (logoPath) {
    return <img src={logoPath.fullLogo} alt="Shelf Logo" className={classes} />;
  }

  return (
    <img
      src="/static/images/logo-full-color(x2).png"
      alt="logo"
      className={classes}
    />
  );
};
