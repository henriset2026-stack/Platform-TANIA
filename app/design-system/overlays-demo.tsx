"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Overlay primitives.
 *
 * Client component because each holds open state. Every overlay has a title
 * and a description: an unlabelled dialog is announced only as "dialog",
 * which tells a screen-reader user nothing about what they have entered.
 *
 * Note the confirm dialog wording. Consequential actions in TANIA require a
 * human decision (PRD §58), so a confirmation must state what will happen —
 * not ask a bare "Are you sure?".
 */
export function OverlaysDemo() {
  const [confirmed, setConfirmed] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Dialog>
        <DialogTrigger render={<Button variant="outline">Open modal</Button>} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve assignment</DialogTitle>
            <DialogDescription>
              Approving records you as the approver and writes an audit event.
              This is a consequential action and cannot be performed by an AI
              agent.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Cancel</Button>} />
            <DialogClose
              render={
                <Button onClick={() => setConfirmed("Assignment approved")}>
                  Approve
                </Button>
              }
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet>
        <SheetTrigger render={<Button variant="outline">Open drawer</Button>} />
        <SheetContent side="right" className="w-80">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>
              Narrow the current view. Filters are presentation only and never
              widen what you are authorized to see.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline">Open dropdown</Button>}
        />
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>View details</DropdownMenuItem>
          <DropdownMenuItem>Export report</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <p aria-live="polite" className="text-sm text-slate-600">
        {confirmed ?? ""}
      </p>
    </div>
  );
}
