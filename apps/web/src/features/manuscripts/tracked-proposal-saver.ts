export type ProposalReceipt = { id: string; revision: number };
/** Serializes autosaves and replays an uncertain create verbatim before updating.
 * Acknowledging an older save never marks newer typing as saved. */
export class TrackedProposalSaver {
  private desired: string;
  private saved: string;
  private receipt?: ProposalReceipt;
  private initialAttempt?: string;
  private updateAttempt?: { receipt: ProposalReceipt; text: string };
  private running?: Promise<void>;
  private stopped = false;
  failed = false;
  constructor(readonly original: string, private create: (text: string) => Promise<ProposalReceipt>, private update: (receipt: ProposalReceipt, text: string) => Promise<ProposalReceipt>, private changed: () => void) { this.desired = original; this.saved = original; }
  get dirty() { return this.desired !== this.saved || Boolean(this.running) || this.initialAttempt !== undefined || Boolean(this.updateAttempt); }
  get busy() { return Boolean(this.running); }
  get revision() { return this.receipt?.revision; }
  edit(text: string) { this.desired = text; this.changed(); }
  dispose() { this.stopped = true; }
  save(): Promise<void> {
    if (this.running) return this.running;
    if (this.stopped || (!this.dirty && !this.failed)) return Promise.resolve();
    this.failed = false;
    this.running = Promise.resolve().then(async () => {
      while (!this.stopped && (this.desired !== this.saved || this.initialAttempt !== undefined || this.updateAttempt)) {
        // Typing can cross the bound while an earlier request is in flight.
        // Retain that text locally; never silently truncate or submit it.
        if (this.desired.length > 100000) throw new Error("PROPOSAL_TOO_LARGE");
        if (!this.receipt) {
          this.initialAttempt ??= this.desired;
          this.receipt = await this.create(this.initialAttempt);
          this.saved = this.initialAttempt; this.initialAttempt = undefined;
        } else {
          this.updateAttempt ??= { receipt: this.receipt, text: this.desired };
          const attempt = this.updateAttempt;
          this.receipt = await this.update(attempt.receipt, attempt.text);
          this.saved = attempt.text; this.updateAttempt = undefined;
        }
        this.changed();
      }
    }).catch(error => { this.failed = true; throw error; }).finally(() => { this.running = undefined; this.changed(); });
    this.changed(); return this.running;
  }
}
