import { useState } from "react";
import { LogOutIcon, UserPenIcon, UserRoundIcon } from "lucide-react";
import { NavLink, useFetcher, useLoaderData } from "react-router";
import { ChevronRight } from "~/components/icons/library";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/shared/dropdown";
import ProfilePicture from "~/components/user/profile-picture";
import type { loader } from "~/routes/_layout+/_layout";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "./sidebar";
import { ThemeMenuItems } from "./theme-menu-items"; // fork

export default function SidebarUserMenu() {
  const { user, openAccess } = useLoaderData<typeof loader>(); // fork: openAccess
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { isMobile } = useSidebar();
  const fetcher = useFetcher();

  function closeDropdown() {
    setIsDropdownOpen(false);
  }

  function logOut() {
    void fetcher.submit(null, { action: "/logout", method: "POST" });
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="!h-auto border !p-1 data-[state=open]:bg-gray-50 data-[state=open]:text-sidebar-accent-foreground hover:bg-gray-50"
            >
              <ProfilePicture
                width="w-8"
                height="h-8"
                className="mr-3 shrink-0"
              />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user.username}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronRight className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded p-1"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <ProfilePicture
                  width="w-8"
                  height="h-8"
                  className="mr-3 shrink-0"
                />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {user.username}
                  </span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* fork: light / dark / auto */}
            <ThemeMenuItems />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              asChild
              className="cursor-pointer gap-2 border-b border-gray-200 p-2"
              onClick={closeDropdown}
            >
              <NavLink to="/me">
                <UserPenIcon className="size-4" />
                My Profile
              </NavLink>
            </DropdownMenuItem>
            <DropdownMenuItem
              asChild
              className="cursor-pointer gap-2 border-b border-gray-200 p-2"
              onClick={closeDropdown}
            >
              <NavLink to="/account-details">
                <UserRoundIcon className="size-4" />
                Account settings
              </NavLink>
            </DropdownMenuItem>
            {openAccess ? null : ( // fork: no Log Out when access is open
              <DropdownMenuItem
                className="mt-1 cursor-pointer gap-2 border-b border-gray-200 p-2"
                onSelect={logOut}
              >
                <LogOutIcon className="size-4" />
                Log Out
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
