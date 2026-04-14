import type {
  SaveRuntimeConfig,
  Session,
  SessionSnapshot
} from "../../../../packages/shared-types/src/index.ts";

export type SessionRuntimeConfig = SaveRuntimeConfig;

export type ResolvedSessionRuntimeSelection = {
  modelProfileId?: string;
  runtimeModelConfig?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
};

function resolveGlobalRuntimeSelection(
  session: Session,
  runtimeConfig: SessionRuntimeConfig | null
): ResolvedSessionRuntimeSelection {
  return {
    modelProfileId: runtimeConfig?.modelProfileId ?? session.settings.modelProfileId,
    runtimeModelConfig: runtimeConfig?.runtimeModelConfig
  };
}

export function resolveNarratorRuntimeSelection(
  session: Session,
  runtimeConfig: SessionRuntimeConfig | null
): ResolvedSessionRuntimeSelection {
  const narratorConfig = runtimeConfig?.roleModelConfigs?.narrator;
  return {
    modelProfileId:
      narratorConfig?.modelProfileId ??
      session.settings.modelProfileId ??
      runtimeConfig?.modelProfileId,
    runtimeModelConfig:
      narratorConfig?.runtimeModelConfig ?? runtimeConfig?.runtimeModelConfig
  };
}

export function resolveParticipantRuntimeSelection(
  session: Session,
  runtimeConfig: SessionRuntimeConfig | null,
  participantId: string
): ResolvedSessionRuntimeSelection {
  const participantConfig = runtimeConfig?.roleModelConfigs?.participants?.[participantId];
  if (participantConfig) {
    return {
      modelProfileId:
        participantConfig.modelProfileId ??
        runtimeConfig?.modelProfileId ??
        session.settings.modelProfileId,
      runtimeModelConfig:
        participantConfig.runtimeModelConfig ?? runtimeConfig?.runtimeModelConfig
    };
  }

  return resolveGlobalRuntimeSelection(session, runtimeConfig);
}

export class InMemorySessionStore {
  private readonly snapshots = new Map<string, SessionSnapshot>();
  private readonly runtimeConfigs = new Map<string, SessionRuntimeConfig>();

  save(snapshot: SessionSnapshot, runtimeConfig?: SessionRuntimeConfig): void {
    this.snapshots.set(snapshot.session.id, snapshot);
    if (runtimeConfig) {
      this.runtimeConfigs.set(snapshot.session.id, runtimeConfig);
    }
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

  getRuntimeConfig(sessionId: string): SessionRuntimeConfig | null {
    return this.runtimeConfigs.get(sessionId) ?? null;
  }

  setRuntimeConfig(sessionId: string, runtimeConfig: SessionRuntimeConfig): void {
    this.runtimeConfigs.set(sessionId, runtimeConfig);
  }

  list(): SessionSnapshot[] {
    return Array.from(this.snapshots.values());
  }
}
