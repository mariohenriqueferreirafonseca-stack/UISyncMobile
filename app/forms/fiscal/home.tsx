// Mini-home do fiscal.
// Faz a guarda de acesso do setor antes de liberar o formulário de rádios.
import { getAuthSession, userHasSectorAccess } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function FiscalHome() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        // O setor 1161 (e o setor global 0000 via service) pode entrar aqui.
        const session = await getAuthSession();
        const canAccess = userHasSectorAccess(session, ['1161']);

        if (!active) {
          return;
        }

        setAuthorized(canAccess);
      })();

      return () => {
        active = false;
      };
    }, []),
  );

  if (authorized === false) {
    return <Redirect href="/home" />;
  }

  if (authorized === null) {
    return <View style={{ flex: 1, backgroundColor: '#021B13' }} />;
  }

  return (
    <LinearGradient colors={['#021B13', '#0B3D2E']} style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="stats-chart-outline" size={36} color="#0B3D2E" />
        </View>

        <Text style={styles.title}>Fiscal</Text>
        <Text style={styles.subtitle}>
          Acesse os formulários disponíveis para o setor fiscal.
        </Text>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/forms/fiscal/radios')}
        >
          <Text style={styles.secondaryButtonText}>Conferência de rádios</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => router.push('/forms/fiscal/radios/cadastro')}
        >
          <Text style={styles.secondaryButtonText}>Cadastro de rádios</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  content: {
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    padding: 24,
    marginTop: 60,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#475569',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#0B3D2E',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#E2EFE7',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryButtonText: {
    color: '#0B3D2E',
    fontSize: 16,
    fontWeight: '700',
  },
});
