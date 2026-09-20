"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { ScaleStrip } from "@/components/brand/scale-strip";
import { TaniaWordmark } from "@/components/brand/tania-wordmark";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="lg:hidden">
            <Menu aria-hidden="true" className="size-5" />
            <span className="sr-only">Open navigation</span>
          </Button>
        }
      />
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b border-slate-200 px-4 py-3">
          <SheetTitle className="text-left">
            <TaniaWordmark showTagline />
          </SheetTitle>
        </SheetHeader>
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-y-auto">
            <SidebarNav onNavigate={() => setOpen(false)} />
          </div>
          <ScaleStrip />
        </div>
      </SheetContent>
    </Sheet>
  );
}
