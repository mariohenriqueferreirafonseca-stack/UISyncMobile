import {
  createRadioRegistry,
  deleteRadioRegistry,
  fetchRadioRegistryBySelo,
  fetchRadioRegistryList,
  fetchRadioRegistrySchema,
  updateRadioRegistry,
} from '@/services/sync/api';
import type {
  RadioRegistryListItem,
  RadioRegistryOwner,
  RadioRegistryRecord,
  RadioRegistrySchema,
} from '@/services/sync/types';

export type { RadioRegistryListItem, RadioRegistryOwner, RadioRegistryRecord, RadioRegistrySchema };

export async function getRadioRegistrySchema() {
  return fetchRadioRegistrySchema();
}

export async function listRegisteredRadios(query?: string): Promise<RadioRegistryListItem[]> {
  return fetchRadioRegistryList(query);
}

export async function getRegisteredRadioBySelo(selo: string): Promise<RadioRegistryRecord> {
  return fetchRadioRegistryBySelo(selo);
}

export async function createRegisteredRadio(payload: RadioRegistryRecord) {
  return createRadioRegistry(payload);
}

export async function updateRegisteredRadio(currentSelo: string, payload: RadioRegistryRecord) {
  return updateRadioRegistry(currentSelo, payload);
}

export async function deleteRegisteredRadio(currentSelo: string, password: string) {
  return deleteRadioRegistry(currentSelo, password);
}
