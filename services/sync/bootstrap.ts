// Bootstrap da sincronização offline.
// Reprocessa a fila quando o app abre, volta para foreground ou a conexão reaparece.
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import { processSyncQueue } from '@/services/sync/queue';

export function startSyncBootstrap() {
  void processSyncQueue();

  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      void processSyncQueue();
    }
  });

  const appStateSubscription = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      void processSyncQueue();
    }
  });

  return () => {
    unsubscribeNetInfo();
    appStateSubscription.remove();
  };
}
