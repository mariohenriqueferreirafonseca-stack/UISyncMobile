// Formulário principal do inventário.
// Combina scanner, busca manual, base offline de produtos, fotos e gravação na fila local.
import { Ionicons } from '@expo/vector-icons';
import { getAuthSession, type AuthSession } from '@/services/auth';
import {
  createInventoryCount,
  findInventoryProduct,
  getInventoryOfflinePreference,
  getOfflineInventoryCatalogStatus,
  persistInventoryImage,
  saveInventoryOfflinePreference,
  syncOfflineInventoryCatalog,
} from '@/services/inventory';
import { getPendingSyncCount } from '@/services/sync/queue';
import type {
  InventoryCountImage,
  InventoryOfflinePreference,
  InventoryProductLookup,
} from '@/services/sync/types';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

function formatDate(dateString?: string | null) {
  if (!dateString) {
    return '-';
  }

  const parsed = new Date(dateString);

  if (Number.isNaN(parsed.getTime())) {
    return String(dateString);
  }

  return parsed.toLocaleDateString('pt-BR');
}

function formatStockValue(value?: string | number | null) {
  if (value === null || value === undefined || value === '') {
    return '0,00';
  }

  const normalized =
    typeof value === 'number' ? value : Number(String(value).replace(',', '.'));

  if (Number.isNaN(normalized)) {
    return String(value);
  }

  return normalized.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function InventarioScreen() {
  const router = useRouter();
  const cameraRef = useRef<any>(null);
  const boxScale = useRef(new Animated.Value(1)).current;
  const [permission, requestPermission] = useCameraPermissions();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [scanned, setScanned] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [codigoBarras, setCodigoBarras] = useState('');
  const [codigoManual, setCodigoManual] = useState('');
  const [produto, setProduto] = useState<InventoryProductLookup | null>(null);
  const [quantidadeFisica, setQuantidadeFisica] = useState('');
  const [observacao, setObservacao] = useState('');
  const [image, setImage] = useState<InventoryCountImage | null>(null);
  const [loadingProduto, setLoadingProduto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [showOfflineChoiceModal, setShowOfflineChoiceModal] = useState(false);
  const [skipOfflinePrompt, setSkipOfflinePrompt] = useState(false);
  const [backgroundSyncingCatalog, setBackgroundSyncingCatalog] = useState(false);
  const [catalogStatusMessage, setCatalogStatusMessage] = useState('');
  const [inventoryMode, setInventoryMode] = useState<'online' | 'offline'>('online');
  const [lastScanned, setLastScanned] = useState<{ value: string; ts: number }>({
    value: '',
    ts: 0,
  });

  useEffect(() => {
    // A animação visualiza o estado "atualizando base de dados" sem travar a tela.
    if (!backgroundSyncingCatalog) {
      boxScale.stopAnimation();
      boxScale.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(boxScale, {
          toValue: 1.12,
          duration: 550,
          useNativeDriver: true,
        }),
        Animated.timing(boxScale, {
          toValue: 0.92,
          duration: 550,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
      boxScale.setValue(1);
    };
  }, [backgroundSyncingCatalog, boxScale]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        // Ao abrir a tela, além de validar sessão, a gente decide se precisa
        // perguntar o modo online/offline ou iniciar a atualização em segundo plano.
        const currentSession = await getAuthSession();
        const preference = await getInventoryOfflinePreference();
        const catalogStatus = await getOfflineInventoryCatalogStatus();

        if (!active) {
          return;
        }

        if (!currentSession) {
          router.replace('/login');
          return;
        }

        setSession(currentSession);

        if (!preference || !preference.skipPrompt) {
          setSkipOfflinePrompt(Boolean(preference?.skipPrompt));
          setShowOfflineChoiceModal(true);
          return;
        }

        setInventoryMode(preference.mode);

        if (preference.mode === 'offline') {
          if (catalogStatus.items.length === 0) {
            setCatalogStatusMessage('Atualizando base de dados');
          }

          void iniciarAtualizacaoCatalogoOffline(false);
        }
      })();

      return () => {
        active = false;
      };
    }, [router]),
  );

  const iniciarAtualizacaoCatalogoOffline = useCallback(
    async (showSuccessMessage = true) => {
      // Atualiza a fotografia local da BaseProdutos.
      // O formulário continua usável enquanto isso acontece.
      const currentCache = await getOfflineInventoryCatalogStatus();

      if (currentCache.items.length > 0) {
        setCatalogStatusMessage(
          `Base offline pronta com ${currentCache.items.length} produtos. Nao sera baixada novamente.`,
        );

        if (showSuccessMessage) {
          Alert.alert(
            'Base offline pronta',
            'A base de produtos ja esta salva neste dispositivo. Voce pode consultar e salvar sem conexao.',
          );
        }

        return true;
      }

      setBackgroundSyncingCatalog(true);
      setCatalogStatusMessage('Atualizando base de dados');

      try {
        const synced = await syncOfflineInventoryCatalog();

        if (!synced) {
          setCatalogStatusMessage(
            'Sem conexao com o servidor para atualizar a base offline.',
          );
          return false;
        }

        const cache = await getOfflineInventoryCatalogStatus();
        setCatalogStatusMessage(
          `Base offline atualizada com ${cache.items.length} produtos.`,
        );

        if (showSuccessMessage) {
          Alert.alert(
            'Base offline pronta',
            'Os produtos foram baixados e agora o inventario pode pesquisar offline.',
          );
        }

        return true;
      } catch (error) {
        setCatalogStatusMessage(
          error instanceof Error
            ? error.message
            : 'Nao foi possivel atualizar a base offline.',
        );
        return false;
      } finally {
        setBackgroundSyncingCatalog(false);
      }
    },
    [],
  );

  const escolherModoInventario = async (mode: 'online' | 'offline') => {
    const preference: InventoryOfflinePreference = {
      mode,
      skipPrompt: skipOfflinePrompt,
    };

    await saveInventoryOfflinePreference(preference);
    setInventoryMode(mode);
    setShowOfflineChoiceModal(false);

    if (mode === 'offline') {
      const cacheStatus = await getOfflineInventoryCatalogStatus();

      if (cacheStatus.items.length > 0) {
        setCatalogStatusMessage(
          `Base offline pronta com ${cacheStatus.items.length} produtos. Nao sera baixada novamente.`,
        );
        Alert.alert(
          'Modo offline ativado',
          'As consultas usarao a base ja salva no dispositivo. Novas contagens ficarao no aparelho e serao enviadas quando a conexao voltar.',
        );
        return;
      }

      void iniciarAtualizacaoCatalogoOffline(true);
    } else {
      setCatalogStatusMessage('');
    }
  };

  const limparFormulario = () => {
    setScanned(false);
    setCodigoBarras('');
    setCodigoManual('');
    setProduto(null);
    setQuantidadeFisica('');
    setObservacao('');
    setImage(null);
    setLastScanned({ value: '', ts: 0 });
  };

  const buscarProduto = async (codigo: string) => {
    const sanitizedCode = codigo.trim();

    if (!sanitizedCode) {
      Alert.alert('Codigo obrigatorio', 'Informe ou escaneie um codigo de barras.');
      return;
    }

    setLoadingProduto(true);
    setProduto(null);
    setCodigoBarras(sanitizedCode);
    setCodigoManual(sanitizedCode);

    try {
      const result = await findInventoryProduct(sanitizedCode);
      setProduto(result);
      setScanned(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Nao foi possivel consultar o produto.';
      Alert.alert('Erro ao buscar produto', message);
    } finally {
      setLoadingProduto(false);
    }
  };

  const onBarcodeScanned = async ({ data }: { data?: string }) => {
    const code = String(data || '').trim();

    if (!code) {
      return;
    }

    const now = Date.now();

    if (code === lastScanned.value && now - lastScanned.ts < 1500) {
      return;
    }

    setLastScanned({ value: code, ts: now });
    await buscarProduto(code);
  };

  const anexarImagem = async (sourceUri: string, fileName?: string | null, mimeType?: string | null) => {
    const persisted = await persistInventoryImage({
      sourceUri,
      fileName,
      mimeType,
    });

    setImage(persisted);
  };

  const tirarFoto = async () => {
    try {
      setProcessingImage(true);

      if (!cameraRef.current?.takePictureAsync) {
        Alert.alert('Camera', 'A camera ainda nao esta pronta.');
        return;
      }

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
      });

      if (!photo?.uri) {
        throw new Error('A foto nao foi capturada corretamente.');
      }

      await anexarImagem(photo.uri, `inventario-${Date.now()}.jpg`, 'image/jpeg');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Nao foi possivel tirar a foto.';
      Alert.alert('Erro ao tirar foto', message);
    } finally {
      setProcessingImage(false);
    }
  };

  const escolherDaGaleria = async () => {
    try {
      setProcessingImage(true);
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert('Permissao necessaria', 'Libere a galeria para selecionar imagens.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsMultipleSelection: false,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      await anexarImagem(asset.uri, asset.fileName, asset.mimeType);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Nao foi possivel selecionar a imagem.';
      Alert.alert('Erro', message);
    } finally {
      setProcessingImage(false);
    }
  };

  const salvarContagem = async () => {
    // A contagem também passa pela fila offline; o usuário recebe feedback
    // diferente dependendo se a sincronização já ocorreu ou não.
    if (!produto || !codigoBarras.trim()) {
      Alert.alert('Produto obrigatorio', 'Escaneie ou busque um produto antes de salvar.');
      return;
    }

    if (!quantidadeFisica.trim()) {
      Alert.alert('Quantidade obrigatoria', 'Informe a quantidade fisica contada.');
      return;
    }

    const parsedQuantity = Number(quantidadeFisica.replace(',', '.'));

    if (!Number.isFinite(parsedQuantity)) {
      Alert.alert('Quantidade invalida', 'Informe uma quantidade numerica valida.');
      return;
    }

    setSaving(true);

    try {
      await createInventoryCount(
        {
          codigoBarras: codigoBarras.trim(),
          codigoProduto: String(produto.ProdutoCodigo || '').trim(),
          quantidadeFisica: String(parsedQuantity),
          observacao: observacao.trim(),
          usuarioNome: session?.nome || 'usuario desconhecido',
          usuarioMatricula: session?.matricula || '',
          image,
          productSnapshot: produto,
        },
        {
          syncImmediately: inventoryMode !== 'offline',
        },
      );

      const pendencias = await getPendingSyncCount();
      limparFormulario();

      if (inventoryMode === 'offline') {
        Alert.alert(
          'Salvo offline',
          `A contagem foi salva no dispositivo por ${session?.nome || 'usuario desconhecido'}. Voce pode continuar registrando; quando o app ficar online, tudo sera enviado ao servidor.`,
        );
        return;
      }

      if (pendencias > 0) {
        Alert.alert(
          'Salvo no dispositivo',
          `A contagem foi salva localmente por ${session?.nome || 'usuario desconhecido'} e sera enviada quando o servidor estiver disponivel.`,
        );
        return;
      }

      Alert.alert(
        'Sucesso',
        `A contagem foi salva por ${session?.nome || 'usuario desconhecido'} e sincronizada com o servidor.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Nao foi possivel salvar a contagem.';
      Alert.alert('Erro', message);
    } finally {
      setSaving(false);
    }
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.centeredScreen}>
        <ActivityIndicator color="#1D4ED8" />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centeredScreen}>
        <Text style={styles.permissionTitle}>Permissao da camera</Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Permitir camera</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <LinearGradient colors={['#F4F0E8', '#E6EFE8']} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Modal
            visible={showOfflineChoiceModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowOfflineChoiceModal(false)}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>
                  Vai trabalhar offline? baixe os arquivos necessarios!
                </Text>

                <Pressable
                  style={styles.checkboxRow}
                  onPress={() => setSkipOfflinePrompt((current) => !current)}
                >
                  <View
                    style={[
                      styles.checkbox,
                      skipOfflinePrompt && styles.checkboxChecked,
                    ]}
                  />
                  <Text style={styles.checkboxLabel}>Nao perguntar novamente</Text>
                </Pressable>

                <Pressable
                  style={[styles.modalButton, styles.onlineButton]}
                  onPress={() => void escolherModoInventario('online')}
                >
                  <Text style={styles.modalButtonText}>Trabalhar online</Text>
                </Pressable>

                <Pressable
                  style={[styles.modalButton, styles.offlineButton]}
                  onPress={() => void escolherModoInventario('offline')}
                >
                  <Text style={[styles.modalButtonText, styles.offlineButtonText]}>
                    Trabalhar offline
                  </Text>
                </Pressable>
              </View>
            </View>
          </Modal>

          <View style={styles.header}>
            <Pressable style={styles.backChip} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="#0B3D2E" />
            </Pressable>
          </View>

          <View style={styles.heroCard}>
            <Text style={styles.eyebrow}>Inventario</Text>
            <Text style={styles.headerTitle}>Contagem de Produto</Text>
            <Text style={styles.helperText}>
              Escaneie o codigo de barras, confira os dados do produto e registre a
              quantidade fisica com um fluxo mais claro para uso no celular.
            </Text>
            <Pressable
              style={styles.flashChip}
              onPress={() => setFlashEnabled((current) => !current)}
            >
              <Text style={styles.flashButton}>
                {flashEnabled ? 'Flash on' : 'Flash off'}
              </Text>
            </Pressable>
          </View>

          {backgroundSyncingCatalog ? (
            <View style={styles.catalogBanner}>
              <Animated.View
                style={[
                  styles.catalogAnimatedBox,
                  { transform: [{ scale: boxScale }] },
                ]}
              />
              <Text style={styles.catalogBannerText}>Atualizando base de dados</Text>
            </View>
          ) : null}

          {catalogStatusMessage ? (
            <Text style={styles.catalogStatusText}>
              {inventoryMode === 'offline'
                ? catalogStatusMessage
                : 'Modo online selecionado.'}
            </Text>
          ) : null}

          <View style={styles.cameraBox}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={flashEnabled}
              onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
            />
          </View>

          <View style={styles.actionRow}>
            <Pressable style={styles.secondaryButton} onPress={() => void tirarFoto()}>
              <Text style={styles.secondaryButtonText}>Tirar foto</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => void escolherDaGaleria()}
            >
              <Text style={styles.secondaryButtonText}>Galeria</Text>
            </Pressable>
          </View>

          {image ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Imagem anexada</Text>
              <Image source={{ uri: image.uri }} style={styles.previewImage} />
              <Pressable onPress={() => setImage(null)}>
                <Text style={styles.removeImageText}>Remover imagem</Text>
              </Pressable>
            </View>
          ) : null}

          {processingImage ? (
            <Text style={styles.statusText}>Processando imagem...</Text>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Codigo de barras</Text>
            <TextInput
              style={styles.input}
              value={codigoManual}
              onChangeText={setCodigoManual}
              placeholder="Digite manualmente se precisar"
              autoCapitalize="none"
            />
            <Pressable
              style={[styles.primaryButton, styles.searchButton]}
              onPress={() => void buscarProduto(codigoManual)}
              disabled={loadingProduto}
            >
              <Text style={styles.primaryButtonText}>
                {loadingProduto ? 'Buscando...' : 'Buscar produto'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            {loadingProduto ? (
              <ActivityIndicator color="#1D4ED8" />
            ) : produto ? (
              <>
                <Text style={styles.productTitle}>
                  {produto.ProdutoDescricao || 'Produto sem descricao'}
                </Text>
                <Text style={styles.metaText}>
                  Codigo: {produto.ProdutoCodigo || '-'}
                </Text>
                <Text style={styles.metaText}>
                  Barras: {produto.ProdutoCodigoBarras || codigoBarras}
                </Text>
                <Text style={styles.metaText}>
                  Local: S{produto.ProdutoSessao || '-'} / P
                  {produto.ProdutoPrateleira || '-'} / T{produto.ProdutoTabua || '-'} /
                  I{produto.ProdutoItem || '-'}
                </Text>
                <Text style={styles.metaText}>
                  Qtd sistema: {produto.ProdutoQuantidade ?? '-'}
                </Text>
                <Text style={styles.metaText}>
                  Valor estoque (R$): {formatStockValue(produto.ProdutoValorEstoque)}
                </Text>
                <Text style={styles.metaText}>
                  Ultima saida: {formatDate(produto.ProdutoDataUltimaVenda)}
                </Text>
                <Text style={styles.metaText}>
                  Qtd saida mes: {produto.ProdutoQTDE_VendaMes ?? '-'}
                </Text>
                <Text style={styles.metaText}>
                  Ultima compra: {formatDate(produto.ProdutoDataUltimaCompra)}
                </Text>
                <Text style={styles.metaText}>
                  Qtd ultima compra: {produto.ProdutoQTDEUltimaCompra ?? '-'}
                </Text>
                <Text style={styles.metaText}>
                  Vlr ultima compra: {produto.ProdutoVLRUltimaCompra ?? '-'}
                </Text>
              </>
            ) : (
              <Text style={styles.statusText}>Nenhum produto carregado.</Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Quantidade fisica</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={quantidadeFisica}
              onChangeText={setQuantidadeFisica}
              placeholder="Ex: 12,5"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Observacoes</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              multiline
              textAlignVertical="top"
              value={observacao}
              onChangeText={setObservacao}
              placeholder="Digite alguma observacao sobre a contagem"
            />
          </View>

          <Pressable
            style={[styles.primaryButton, saving && styles.disabledButton]}
            onPress={() => void salvarContagem()}
            disabled={saving}
          >
            <Text style={styles.primaryButtonText}>
              {saving ? 'Salvando...' : 'Salvar contagem'}
            </Text>
          </Pressable>

          <Pressable style={styles.resetButton} onPress={limparFormulario}>
            <Text style={styles.resetButtonText}>Limpar / novo produto</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
  screen: {
    flex: 1,
  },
  content: {
    padding: 18,
    paddingBottom: 40,
    gap: 16,
  },
  centeredScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F0E8',
    padding: 24,
  },
  permissionTitle: {
    color: '#173328',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
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
  headerTitle: {
    color: '#F8F6EF',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    marginTop: 8,
  },
  flashChip: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#28483B',
  },
  flashButton: {
    color: '#F8F6EF',
    fontWeight: '700',
  },
  helperText: {
    marginTop: 10,
    color: '#D2DED5',
    lineHeight: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#F8F6EF',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#D6DDD4',
    gap: 14,
  },
  modalTitle: {
    color: '#173328',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 26,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#7AA486',
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    backgroundColor: '#7AA486',
  },
  checkboxLabel: {
    color: '#4E6B5D',
    fontWeight: '600',
  },
  modalButton: {
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  onlineButton: {
    backgroundColor: '#E8EEE7',
    borderWidth: 1,
    borderColor: '#D4DBD1',
  },
  offlineButton: {
    backgroundColor: '#7AA486',
  },
  modalButtonText: {
    color: '#173328',
    fontWeight: '800',
  },
  offlineButtonText: {
    color: '#FFFFFF',
  },
  catalogBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#E8F0EA',
    borderWidth: 1,
    borderColor: '#BFD0C5',
  },
  catalogAnimatedBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: '#7AA486',
  },
  catalogBannerText: {
    color: '#264337',
    fontWeight: '700',
  },
  catalogStatusText: {
    color: '#4E6B5D',
    fontSize: 13,
  },
  cameraBox: {
    height: 280,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#DDE7DF',
    borderWidth: 1,
    borderColor: '#CBD7CF',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 28,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D6DDD4',
  },
  cardLabel: {
    color: '#264337',
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F7F8F4',
    color: '#1F2F27',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D4DBD1',
  },
  multilineInput: {
    minHeight: 110,
  },
  primaryButton: {
    backgroundColor: '#7AA486',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#EEF2EC',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D4DBD1',
  },
  secondaryButtonText: {
    color: '#264337',
    fontWeight: '700',
  },
  resetButton: {
    backgroundColor: '#E5ECE6',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#264337',
    fontWeight: '700',
  },
  searchButton: {
    marginTop: 12,
  },
  disabledButton: {
    opacity: 0.7,
  },
  productTitle: {
    color: '#173328',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
  },
  metaText: {
    color: '#4E6B5D',
    marginTop: 4,
  },
  statusText: {
    color: '#64746D',
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 18,
    marginTop: 6,
    marginBottom: 8,
    backgroundColor: '#E5ECE6',
  },
  removeImageText: {
    color: '#FCA5A5',
    fontWeight: '700',
    alignSelf: 'flex-end',
  },
});
