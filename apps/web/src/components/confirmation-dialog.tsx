import { useEffect, useRef, useSyncExternalStore } from "react";
import { AlertTriangle, FilePenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { confirmationStore } from "@/services/confirmation";

const titles = { leave: "Leave without saving?", delete: "Confirm deletion", approve: "Confirm approval", reject: "Confirm rejection", withdraw: "Withdraw submission?" };
const actions = { leave: "Leave without saving", delete: "Delete", approve: "Approve", reject: "Reject", withdraw: "Withdraw submission" };

export function ConfirmationDialog() {
  const pending = useSyncExternalStore(confirmationStore.subscribe, confirmationStore.snapshot);
  const { t } = useI18n();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => { if (pending) triggerRef.current = pending.trigger; }, [pending]);
  useEffect(() => () => confirmationStore.settle(false), []);
  return <Dialog open={Boolean(pending)} onOpenChange={open => { if (!open) confirmationStore.settle(false); }}>
    <DialogContent role="alertdialog" showClose={false} overlayClassName="z-[100] motion-reduce:animate-none" className="z-[101] max-w-[440px] gap-6 rounded-xl p-6 motion-reduce:animate-none" data-no-i18n
      onOpenAutoFocus={event => { event.preventDefault(); cancelRef.current?.focus(); }}
      onCloseAutoFocus={event => { event.preventDefault(); if (triggerRef.current?.isConnected) triggerRef.current.focus(); }}
      onInteractOutside={event => event.preventDefault()}>
      {pending && <>
        <DialogHeader className="gap-3 text-left">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">{pending.kind === "leave" ? <FilePenLine size={20} /> : <AlertTriangle size={20} />}</span>
          <DialogTitle className="text-xl leading-snug">{t(titles[pending.kind])}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">{t(pending.description)}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="outline" ref={cancelRef} onClick={() => confirmationStore.settle(false)}>{t(pending.kind === "leave" ? "Keep editing" : "Cancel")}</Button>
          <Button type="button" variant={pending.kind === "delete" || pending.kind === "reject" ? "destructive" : "default"} onClick={() => confirmationStore.settle(true)}>{t(actions[pending.kind])}</Button>
        </DialogFooter>
      </>}
    </DialogContent>
  </Dialog>;
}
