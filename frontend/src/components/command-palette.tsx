"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { NavItem } from "@/components/sidebar-nav";

interface CommandPaletteProps {
  navItems: NavItem[];
  hasPermission?: (permissionKey: string) => boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({
  navItems,
  hasPermission,
  open,
  onOpenChange: setOpen,
}: CommandPaletteProps) {
  const router = useRouter();

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(!open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  const items = hasPermission
    ? navItems.filter((item) => hasPermission(item.permission))
    : navItems;

  const groups = React.useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of items) {
      const key = item.section ?? "Navigate";
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return Array.from(map.entries());
  }, [items]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command>
          <CommandInput placeholder="Search pages…" autoFocus />
          <CommandList>
            <CommandEmpty>No matching pages.</CommandEmpty>
            {groups.map(([section, sectionItems]) => (
              <CommandGroup key={section} heading={section}>
                {sectionItems.map((item) => (
                  <CommandItem
                    key={item.href}
                    value={item.label}
                    onSelect={() => go(item.href)}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
