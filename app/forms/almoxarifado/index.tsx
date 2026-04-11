// Mini-home do almoxarifado.
// Mantem o fluxo "Home -> Setor -> Formulario" com a mesma linguagem visual das telas novas.
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function AlmoxarifadoHome() {
  const router = useRouter();

  return (
    <LinearGradient colors={['#021B13', '#0B3D2E']} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>

        <View style={styles.content}>
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="cube-outline" size={36} color="#0B3D2E" />
            </View>
            <Text style={styles.title}>Almoxarifado</Text>
            <Text style={styles.subtitle}>
              Acesse os formularios disponiveis para o setor Almoxarifado.
            </Text>

            <Pressable
              style={styles.primaryButton}
              onPress={() => router.push('/forms/almoxarifado/inventario' as never)}
            >
              <Text style={styles.primaryButtonText}>Abrir ferramenta de inventario</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    paddingTop: 84,
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
  card: {
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    padding: 24,
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
  eyebrow: {
    color: '#0B3D2E',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 8,
    color: '#0F172A',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 10,
    color: '#475569',
    lineHeight: 21,
    marginBottom: 24,
  },
  primaryButton: {
    marginTop: 6,
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: '#0B3D2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
