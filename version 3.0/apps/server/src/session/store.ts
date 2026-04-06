import type { SessionSnapshot } from "../../../../packages/shared-types/src/index.ts";

export class InMemorySessionStore {
  private readonly snapshots = new Map<string, SessionSnapshot>();

  save(snapshot: SessionSnapshot): void {
    this.snapshots.set(snapshot.session.id, snapshot);
  }

  get(sessionId: string): SessionSnapshot | null {
    return this.snapshots.get(sessionId) ?? null;
  }

  update(sessionId: string, updater: (snapshot: SessionSnapshot) => SessionSnapshot): SessionSnapshot | null {
    const current = this.snapshots.get(sessionId);
    if (!current) {
      return null;
    }

    const next = updater(current);
    this.snapshots.set(sessionId, next);
    return next;
  }

  list(): SessionSnapshot[] {
    return Array.from(this.snapshots.values());
  }
}
