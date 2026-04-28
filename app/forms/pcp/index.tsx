// Mini-home do PCP.
// Faz a guarda de acesso do setor antes de liberar o formulario de medicao.
import { getAuthSession, userHasSectorAccess } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function PCPIndexScreen() {
  const router = useRouter();

  // Controla se o usuario pode ou nao acessar a area do PCP.
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

  // Redireciona quem nao tem permissao.
  if (authorized === false) {
    return <Redirect href="/home" />;
  }

  // Mostra um fundo simples enquanto valida a sessao.
  if (authorized === null) {
    return <View style={styles.loadingScreen} />;
  }

  return (
    // Reaproveita o mesmo fundo da home do Fiscal.
    <LinearGradient colors={['#021B13', '#0B3D2E']} style={styles.container}>
      {/* Mantem o botao de voltar solto no topo, igual ao Fiscal. */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Card principal com o resumo do setor e os acessos disponiveis. */}
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="clipboard-outline" size={36} color="#0B3D2E" />
        </View>

        <Text style={styles.title}>PCP</Text>
        <Text style={styles.subtitle}>
          Acesse os formularios disponiveis para o setor de PCP.
        </Text>

        {/* Acao principal do PCP hoje: abrir a medicao de estoque. */}
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/forms/pcp/medicao_estoque')}
        >
          <Text style={styles.secondaryButtonText}>Medição de estoque</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  // Tela exibida durante a validacao inicial.
  loadingScreen: {
    flex: 1,
    backgroundColor: '#021B13',
  },

  // Fundo base da tela, igual ao Fiscal.
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },

  // Botao de voltar posicionado no topo esquerdo.
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

  // Card branco central com o conteudo da home.
  content: {
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    padding: 24,
    marginTop: 60,
  },

  // Bloco do icone do setor.
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  // Titulo principal do card.
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },

  // Texto auxiliar explicando o objetivo da area.
  subtitle: {
    fontSize: 15,
    color: '#475569',
    marginBottom: 24,
  },

  // Botao principal no mesmo padrao visual do Fiscal.
  secondaryButton: {
    backgroundColor: '#E2EFE7',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginBottom: 12,
  },

  // Texto do botao principal.
  secondaryButtonText: {
    color: '#0B3D2E',
    fontSize: 16,
    fontWeight: '700',
  },
});
