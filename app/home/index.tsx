// Home principal do app.
// Monta os cards de setor e aplica as regras de acesso por setor do usuario logado.
import CardSetor from '../../components/CardSetor';
import { Ionicons } from '@expo/vector-icons';
import {
  clearAuthSession,
  getAuthSession,
  type AuthSession,
  userHasSectorAccess,
} from '@/services/auth';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
  const [showLogoutModal, setShowLogoutModal] = useState(false);

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

  const sair = useCallback(async () => {
    setShowLogoutModal(false);
    await clearAuthSession();
    setSession(null);
    router.replace('/login');
  }, [router]);

  const confirmarSaida = useCallback(() => {
    setShowLogoutModal(true);
  }, []);

  return (
    <LinearGradient colors={['#021B13', '#0B3D2E']} style={styles.container}>
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalDismissLayer}
            onPress={() => setShowLogoutModal(false)}
          />

          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="log-out-outline" size={26} color="#173328" />
            </View>

            <Text style={styles.modalTitle}>Sair da sessao?</Text>
            <Text style={styles.modalDescription}>
              Voce sera redirecionado para a tela de login. Se estiver offline,
              precisara ficar online para entrar novamente.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setShowLogoutModal(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.modalButtonSecondaryText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={() => void sair()}
                activeOpacity={0.85}
              >
                <Text style={styles.modalButtonPrimaryText}>Sair</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <View>
          <Text style={styles.userName}>
            {firstName ? `Bem vindo, ${firstName}` : 'Bem vindo'}
          </Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={confirmarSaida}>
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
  logoutButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    justifyContent: 'center',
    padding: 24,
  },
  modalDismissLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    backgroundColor: '#F8F6EF',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#D6DDD4',
    gap: 14,
  },
  modalIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#E8EEE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D4DBD1',
  },
  modalTitle: {
    color: '#173328',
    fontSize: 21,
    fontWeight: '800',
  },
  modalDescription: {
    color: '#4E6B5D',
    lineHeight: 21,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalButtonSecondary: {
    backgroundColor: '#E8EEE7',
    borderWidth: 1,
    borderColor: '#D4DBD1',
  },
  modalButtonPrimary: {
    backgroundColor: '#173328',
  },
  modalButtonSecondaryText: {
    color: '#173328',
    fontWeight: '800',
  },
  modalButtonPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
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
