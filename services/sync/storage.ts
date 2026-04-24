// Chaves centralizadas de AsyncStorage.
// Tudo que o app guarda localmente passa por aqui para evitar strings soltas pelo código.
import AsyncStorage from '@react-native-async-storage/async-storage';

const SYNC_QUEUE_KEY = '@uisync/sync-queue';
const RADIO_CONFERENCES_KEY = '@uisync/radio-conferences';
const INVENTORY_COUNTS_KEY = '@uisync/inventory-counts';
const STOCK_MEASUREMENTS_KEY = '@uisync/stock-measurements';
const RADIO_LOOKUP_CACHE_KEY = '@uisync/radio-lookup-cache';
const RADIO_OFFLINE_PREFERENCE_KEY = '@uisync/radio-offline-preference';
const INVENTORY_PRODUCT_CACHE_KEY = '@uisync/inventory-product-cache';
const INVENTORY_OFFLINE_PREFERENCE_KEY = '@uisync/inventory-offline-preference';
const AUTH_SESSION_KEY = '@uisync/auth-session';

export async function readStorage<T>(key: string, fallback: T): Promise<T> {
  try {
    const rawValue = await AsyncStorage.getItem(key);

    if (!rawValue) {
      return fallback;
    }

    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

export async function writeStorage<T>(key: string, value: T) {
  // O app usa JSON para todos os objetos persistidos localmente.
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export const storageKeys = {
  authSession: AUTH_SESSION_KEY,
  syncQueue: SYNC_QUEUE_KEY,
  radioConferences: RADIO_CONFERENCES_KEY,
  inventoryCounts: INVENTORY_COUNTS_KEY,
  stockMeasurements: STOCK_MEASUREMENTS_KEY,
  radioLookupCache: RADIO_LOOKUP_CACHE_KEY,
  radioOfflinePreference: RADIO_OFFLINE_PREFERENCE_KEY,
  inventoryProductCache: INVENTORY_PRODUCT_CACHE_KEY,
  inventoryOfflinePreference: INVENTORY_OFFLINE_PREFERENCE_KEY,
};
