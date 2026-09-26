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
        <DialogTrigger render={<Button variant="outline">Buka modal</Button>} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setujui penugasan</DialogTitle>
            <DialogDescription>
              Menyetujui akan mencatat Anda sebagai penyetuju dan menulis
              peristiwa audit. Ini adalah tindakan berdampak dan tidak dapat
              dilakukan oleh agen AI.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Batal</Button>} />
            <DialogClose
              render={
                <Button onClick={() => setConfirmed("Penugasan disetujui")}>
                  Setujui
                </Button>
              }
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet>
        <SheetTrigger render={<Button variant="outline">Buka drawer</Button>} />
        <SheetContent side="right" className="w-80">
          <SheetHeader>
            <SheetTitle>Filter</SheetTitle>
            <SheetDescription>
              Persempit tampilan saat ini. Filter hanya untuk tampilan dan tidak
              pernah memperluas apa yang berwenang Anda lihat.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline">Buka dropdown</Button>}
        />
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Aksi</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Lihat detail</DropdownMenuItem>
          <DropdownMenuItem>Ekspor laporan</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <p aria-live="polite" className="text-sm text-slate-600">
        {confirmed ?? ""}
      </p>
    </div>
  );
}
