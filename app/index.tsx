// Tela-raiz do app.
// Decide apenas para onde o usuário vai ser redirecionado:
// login quando não existe sessão local, ou home quando a sessão já está salva.
import { getAuthSession } from '@/services/auth';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [isLogged, setIsLogged] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      // A sessão fica persistida no AsyncStorage.
      // Aqui a gente só consulta isso uma vez para montar o primeiro redirect.
      const session = await getAuthSession();

      if (!active) {
        return;
      }

      setIsLogged(Boolean(session));
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: '#021B13' }} />;
  }

  if (!isLogged) {
    return <Redirect href="/login" />;
  }

  return <Redirect href="/home" />;
}
