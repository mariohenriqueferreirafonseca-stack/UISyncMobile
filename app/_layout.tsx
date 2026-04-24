// Layout raiz do Expo Router.
// Também é o ponto onde o bootstrap da fila offline é iniciado para o app inteiro.
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { startSyncBootstrap } from '@/services/sync/bootstrap';

export default function RootLayout() {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    setAuthReady(true);
  }, []);

  useEffect(() => {
    // Inicia o observador de rede/app ativo para tentar sincronizar pendências.
    return startSyncBootstrap();
  }, []);

  if (!authReady) {
    return <View style={{ flex: 1, backgroundColor: '#021B13' }} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
