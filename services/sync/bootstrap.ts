// Bootstrap da sincronização offline.
// Reprocessa a fila quando o app abre, volta para foreground ou a conexão reaparece.
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import { migrateLocalRadioConferenceImageNames } from '@/services/radios';
import { processSyncQueue } from '@/services/sync/queue';

export function startSyncBootstrap() {
  const runSync = () => {
    void (async () => {
      await migrateLocalRadioConferenceImageNames();
      await processSyncQueue();
    })();
  };

  runSync();

  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      runSync();
    }
  });

  const appStateSubscription = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      runSync();
    }
  });

  return () => {
    unsubscribeNetInfo();
    appStateSubscription.remove();
  };
}
