import { getAuthSession, userHasSectorAccess } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function PCPIndexScreen() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        const session = await getAuthSession();
        const canAccess = userHasSectorAccess(session, ['1161']);

        if (active) {
          setAuthorized(canAccess);
        }
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
    return <View style={styles.loadingScreen} />;
  }

  return (
    <LinearGradient colors={['#F4F0E8', '#E6EFE8']} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <TouchableOpacity style={styles.backChip} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#0B3D2E" />
              </TouchableOpacity>
            </View>

            <View style={styles.heroCard}>
              <Text style={styles.eyebrow}>PCP</Text>
              <Text style={styles.title}>Formularios PCP</Text>
              <Text style={styles.helperText}>
                Toque no botao abaixo para abrir o formulario de medicao de estoque.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.primaryCard}
              onPress={() => router.push('/forms/pcp/medicao_estoque')}
            >
              <View style={styles.iconBadge}>
                <Ionicons name="clipboard-outline" size={26} color="#173328" />
              </View>
              <Text style={styles.primaryTitle}>Medicao de Estoque</Text>
              <Text style={styles.primaryDescription}>
                Abrir formulario de medicao por arcos.
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: '#F4F0E8',
  },
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 18,
    gap: 16,
  },
  header: {
    marginTop: 6,
  },
  backChip: {
    alignSelf: 'flex-start',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    backgroundColor: '#173328',
    borderRadius: 28,
    padding: 22,
    shadowColor: '#173328',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  eyebrow: {
    color: '#A9D1BA',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 8,
    color: '#F8F6EF',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
  },
  helperText: {
    marginTop: 10,
    color: '#D2DED5',
    lineHeight: 21,
  },
  primaryCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: '#D6DDD4',
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7EFE8',
  },
  primaryTitle: {
    marginTop: 14,
    color: '#173328',
    fontSize: 22,
    fontWeight: '800',
  },
  primaryDescription: {
    marginTop: 8,
    color: '#4E6B5D',
    lineHeight: 20,
  },
});
