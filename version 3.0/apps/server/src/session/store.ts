import type { SessionSnapshot } from "../../../../packages/shared-types/src/index.ts";

export class InMemorySessionStore {
  private readonly snapshots = new Map<string, SessionSnapshot>();

  save(snapshot: SessionSnapshot): void {
    this.snapshots.set(snapshot.session.id, snapshot);
  }

  get(sessionId: string): SessionSnapshot | null {
    return this.snapshots.get(sessionId) ?? null;
  }

  list(): SessionSnapshot[] {
    return Array.from(this.snapshots.values());
  }
}
