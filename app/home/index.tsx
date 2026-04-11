// Home principal do app.
// Monta os cards de setor e aplica as regras de acesso por setor do usuario logado.
import CardSetor from '../../components/CardSetor';
import {
  clearAuthSession,
  getAuthSession,
  type AuthSession,
  userHasSectorAccess,
} from '@/services/auth';
import { pingSyncApi } from '@/services/sync/api';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type HomeSector = {
  nome: string;
  icon: string;
  rota: string;
  setores?: string[];
  disabled?: boolean;
};

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);

  const firstName = session?.nome?.trim().split(/\s+/)[0] || '';

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        const currentSession = await getAuthSession();

        if (!active) {
          return;
        }

        setSession(currentSession);
      })();

      return () => {
        active = false;
      };
    }, []),
  );

  const setores: HomeSector[] = [
    { nome: 'Almoxarifado', icon: 'cube-outline', rota: '/forms/almoxarifado' },
    { nome: 'Fiscal', icon: 'receipt-outline', rota: '/forms/fiscal/home', setores: ['1161'] },
    { nome: 'PCP', icon: 'stats-chart-outline', rota: '/forms/pcp' },
  ];

  const setoresDisponiveis = setores.filter((setor) =>
    setor.setores ? userHasSectorAccess(session, setor.setores) : true,
  );

  const confirmarSaida = async () => {
    let apiDisponivel = false;

    try {
      apiDisponivel = await pingSyncApi();
    } catch {
      apiDisponivel = false;
    }

    const message = apiDisponivel
      ? 'Deseja sair da sua sessao agora?'
      : 'Deseja sair da sua sessao agora?\n\nSe voce sair agora, so podera fazer login novamente quando estiver online.';

    Alert.alert('Tem certeza?', message, [
      {
        text: 'Cancelar',
        style: 'cancel',
      },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await clearAuthSession();
            router.replace('/login');
          })();
        },
      },
    ]);
  };

  return (
    <LinearGradient colors={['#021B13', '#0B3D2E']} style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.userName}>
            {firstName ? `Bem vindo, ${firstName}` : 'Bem vindo'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => void confirmarSaida()}>
          <Text style={styles.logout}>Sair</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>Selecione o Setor</Text>
      <Text style={styles.subtitle}>Acesse os dados e registros da unidade</Text>

      <View style={styles.grid}>
        {setoresDisponiveis.map((s, i) => (
          <CardSetor
            key={i}
            title={s.nome}
            icon={s.icon}
            onPress={s.disabled ? undefined : () => router.push(s.rota as never)}
            disabled={s.disabled}
          />
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginTop: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  logout: {
    color: '#D1FAE5',
    fontWeight: '700',
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 28,
  },
  subtitle: {
    color: '#cbd5e1',
    textAlign: 'center',
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
});
