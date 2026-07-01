import type { FederatedMapState } from './types';

let mapState: FederatedMapState | null = null;
let loadError: string | undefined;

export function setFederatedMapState(state: FederatedMapState | null): void {
  mapState = state;
}

export function getFederatedMapState(): FederatedMapState | null {
  return mapState;
}

export function setFederatedLoadError(message: string | undefined): void {
  loadError = message;
}

export function getFederatedLoadError(): string | undefined {
  return loadError;
}

export function resetFederatedMapState(): void {
  mapState = null;
  loadError = undefined;
}
