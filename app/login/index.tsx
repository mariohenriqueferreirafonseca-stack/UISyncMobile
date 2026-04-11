// Tela de login.
// Valida credenciais no backend, persiste a sessão localmente e redireciona para a home.
import { saveAuthSession } from '@/services/auth';
import {
  getApiBaseUrl,
  loginWithDatabase,
} from '@/services/sync/api';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function Login() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView | null>(null);
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  const apiBaseUrl = getApiBaseUrl();

  const entrar = async () => {
    if (!usuario.trim() || !senha.trim()) {
      Alert.alert('Campos obrigatorios', 'Informe usuario e senha.');
      return;
    }

    setLoading(true);

    try {
      // O backend devolve a sessão completa (nome, setor, matrícula etc.).
      const session = await loginWithDatabase({
        matricula: usuario.trim(),
        senha: senha.trim(),
      });

      await saveAuthSession(session);
      router.replace('/home');
    } catch (error) {
      Alert.alert(
        'Login invalido',
        error instanceof Error
          ? `${error.message}\nAPI: ${apiBaseUrl || 'ENV ausente'}`
          : 'Nao foi possivel entrar.',
      );
    } finally {
      setLoading(false);
    }
  };

  const revelarCampoDigitando = (targetY: number) => {
    // No Android o teclado pode esconder o campo focado.
    // Forçamos a rolagem para baixo para manter o input visível durante a digitação.
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: targetY,
        animated: true,
      });
    }, 120);
  };

  return (
    <LinearGradient colors={['#021B13', '#0B3D2E']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.logoContainer}>
              <Image
                source={require('../../assets/images/logo_lar_branco.png')}
                style={styles.logo}
              />
              <Text style={styles.logoText}>UISync</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.left}>
                <Text style={styles.welcome}>BEM-VINDO</Text>
                <Text style={styles.desc}>
                  Central das Unidades Industriais de Soja.
                </Text>

                <Text style={styles.novo}>Novo acesso?</Text>
                <Text style={styles.info}>
                  Solicite um usuario a equipe de desenvolvimento da UIS2 para
                  lancar, acompanhar e consultar os registros operacionais da sua
                  unidade.
                </Text>
                <Text style={styles.info}>Atendimento: (67) 3453-5733</Text>
              </View>

              <View style={styles.right}>
                <Text style={styles.loginTitle}>Faca login</Text>

                <Text style={styles.label}>Usuario</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Digite seu usuario"
                  placeholderTextColor="#9CA3AF"
                  value={usuario}
                  onChangeText={setUsuario}
                  onFocus={() => revelarCampoDigitando(280)}
                />

                <Text style={styles.label}>Senha</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  value={senha}
                  onChangeText={setSenha}
                  onFocus={() => revelarCampoDigitando(360)}
                />

                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={() => void entrar()}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>
                    {loading ? 'Entrando...' : 'Entrar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 120,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  logo: {
    width: 88,
    height: 56,
    resizeMode: 'contain',
  },
  logoText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '500',
    letterSpacing: 1,
    marginLeft: 6,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    backgroundColor: '#0B1F17',
    borderRadius: 20,
    overflow: 'hidden',
  },
  left: {
    backgroundColor: '#7C9E6B',
    padding: 20,
  },
  welcome: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
  },
  desc: {
    marginTop: 10,
    color: '#1F2937',
    fontSize: 14,
    lineHeight: 21,
  },
  novo: {
    marginTop: 20,
    fontWeight: '600',
    color: '#1F2937',
    fontSize: 15,
  },
  info: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    color: '#1F2937',
  },
  right: {
    padding: 20,
  },
  loginTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
  },
  label: {
    color: '#D1D5DB',
    marginBottom: 5,
    fontSize: 14,
  },
  input: {
    backgroundColor: '#E5E7EB',
    borderRadius: 30,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 15,
  },
  button: {
    backgroundColor: '#5FA777',
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
