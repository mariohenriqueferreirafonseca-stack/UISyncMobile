import ButtonSelect from '@/components/ButtonSelect';
import {
  getAuthSession,
  type AuthSession,
  userHasSectorAccess,
} from '@/services/auth';
import {
  createRadioConference,
  findRadioSelos,
  persistRadioConferenceImage,
} from '@/services/radios';
import { getPendingSyncCount } from '@/services/sync/queue';
import type {
  RadioConferenceImage,
  RadioLookupItem,
} from '@/services/sync/types';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Redirect,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

const CHECKLIST_FIELDS = [
  { key: 'equipamentoOperante', label: 'Equipamento operante?' },
  { key: 'botaoFunciona', label: 'Botao liga/desliga funciona?' },
  { key: 'bateriaEncaixa', label: 'Bateria encaixa corretamente?' },
  { key: 'existemRachaduras', label: 'Existem rachaduras?' },
  { key: 'riscosProfundos', label: 'Ha riscos profundos?' },
  { key: 'capaProtetora', label: 'Possui capa protetora?' },
  { key: 'alcaTransporte', label: 'Possui alca de transporte?' },
  { key: 'identificacaoIntegra', label: 'Identificacao esta integra?' },
  { key: 'equipamentoLimpo', label: 'Equipamento esta limpo?' },
] as const;

type ChecklistKey = (typeof CHECKLIST_FIELDS)[number]['key'];
type ChecklistState = Record<ChecklistKey, string>;

function createEmptyChecklist(): ChecklistState {
  return {
    equipamentoOperante: '',
    botaoFunciona: '',
    bateriaEncaixa: '',
    existemRachaduras: '',
    riscosProfundos: '',
    capaProtetora: '',
    alcaTransporte: '',
    identificacaoIntegra: '',
    equipamentoLimpo: '',
  };
}

function getParamValue(value?: string | string[]) {
  if (Array.isArray(value)) {
    return String(value[0] || '');
  }

  return String(value || '');
}

function formatRadioSetor(item: RadioLookupItem | null) {
  if (!item) {
    return 'Nao informado';
  }

  const value = String(item.RadioSetor ?? item.Setor ?? '').trim();
  return value || 'Nao informado';
}

function formatRadioEquipamento(item: RadioLookupItem | null) {
  return item?.Equipamento?.trim() || 'Nao informado';
}

function formatRadioResponsavel(item: RadioLookupItem | null) {
  return item?.Usuario?.trim() || 'Nao informado';
}

export default function RadioConferenceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ selo?: string | string[] }>();
  const seloFromParams = getParamValue(params.selo).trim().toUpperCase();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [numeroSelo, setNumeroSelo] = useState(seloFromParams);
  const [selectedRadio, setSelectedRadio] = useState<RadioLookupItem | null>(null);
  const [suggestions, setSuggestions] = useState<RadioLookupItem[]>([]);
  const [checklist, setChecklist] = useState<ChecklistState>(createEmptyChecklist());
  const [situacaoGeral, setSituacaoGeral] = useState('');
  const [observacao, setObservacao] = useState('');
  const [images, setImages] = useState<RadioConferenceImage[]>([]);
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (seloFromParams) {
      setNumeroSelo(seloFromParams);
    }
  }, [seloFromParams]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        const currentSession = await getAuthSession();

        if (!active) {
          return;
        }

        if (!currentSession) {
          router.replace('/login');
          return;
        }

        setSession(currentSession);
        setAuthorized(userHasSectorAccess(currentSession, ['1161']));
      })();

      return () => {
        active = false;
      };
    }, [router]),
  );

  useEffect(() => {
    const query = numeroSelo.trim().toUpperCase();

    if (!query) {
      setSuggestions([]);
      setSelectedRadio(null);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        setLoadingLookup(true);

        try {
          const items = await findRadioSelos(query);

          if (!active) {
            return;
          }

          const nextSuggestions = items.slice(0, 6);
          const exactMatch =
            items.find(
              (item) =>
                item.RadioSeloComplemento.trim().toUpperCase() === query,
            ) || null;

          setSuggestions(nextSuggestions);
          setSelectedRadio(exactMatch);
        } catch {
          if (!active) {
            return;
          }

          setSuggestions([]);
          setSelectedRadio(null);
        } finally {
          if (active) {
            setLoadingLookup(false);
          }
        }
      })();
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [numeroSelo]);

  const radioImageUri = useMemo(
    () => selectedRadio?.OfflineImageUri || selectedRadio?.ImageUrl || null,
    [selectedRadio],
  );

  const setChecklistValue = useCallback((field: ChecklistKey, value: string) => {
    setChecklist((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const selectSuggestion = (item: RadioLookupItem) => {
    setNumeroSelo(item.RadioSeloComplemento);
    setSelectedRadio(item);
    setSuggestions([]);
  };

  const addPersistedImages = useCallback(
    async (
      assets: {
        uri?: string | null;
        fileName?: string | null;
        mimeType?: string | null;
      }[],
    ) => {
      const remainingSlots = 10 - images.length;

      if (remainingSlots <= 0) {
        Alert.alert('Limite atingido', 'Voce pode anexar ate 10 imagens.');
        return;
      }

      const nextAssets = assets.filter((asset) => asset.uri).slice(0, remainingSlots);

      if (nextAssets.length === 0) {
        return;
      }

      const persistedImages = await Promise.all(
        nextAssets.map((asset) =>
          persistRadioConferenceImage({
            sourceUri: String(asset.uri),
            fileName: asset.fileName,
            mimeType: asset.mimeType,
          }),
        ),
      );

      setImages((current) => [...current, ...persistedImages]);

      if (assets.length > remainingSlots) {
        Alert.alert(
          'Limite atingido',
          'Somente as primeiras imagens foram anexadas para manter o limite de 10 fotos.',
        );
      }
    },
    [images.length],
  );

  const handleTakePhoto = useCallback(async () => {
    try {
      setProcessingImage(true);
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert('Permissao necessaria', 'Libere a camera para tirar fotos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      await addPersistedImages(result.assets);
    } catch (error) {
      Alert.alert(
        'Erro ao tirar foto',
        error instanceof Error ? error.message : 'Nao foi possivel tirar a foto.',
      );
    } finally {
      setProcessingImage(false);
    }
  }, [addPersistedImages]);

  const handlePickFromLibrary = useCallback(async () => {
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
        allowsMultipleSelection: true,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      await addPersistedImages(result.assets);
    } catch (error) {
      Alert.alert(
        'Erro ao selecionar imagens',
        error instanceof Error
          ? error.message
          : 'Nao foi possivel selecionar as imagens.',
      );
    } finally {
      setProcessingImage(false);
    }
  }, [addPersistedImages]);

  const removeImage = (imageId: string) => {
    setImages((current) => current.filter((image) => image.id !== imageId));
  };

  const resetForm = useCallback(() => {
    setNumeroSelo('');
    setSelectedRadio(null);
    setSuggestions([]);
    setChecklist(createEmptyChecklist());
    setSituacaoGeral('');
    setObservacao('');
    setImages([]);
  }, []);

  const handleSave = useCallback(async () => {
    const sanitizedSelo = numeroSelo.trim().toUpperCase();

    if (!sanitizedSelo) {
      Alert.alert('Campo obrigatorio', 'Informe o selo do radio.');
      return;
    }

    const missingField = CHECKLIST_FIELDS.find(
      (field) => !checklist[field.key].trim(),
    );

    if (missingField) {
      Alert.alert('Checklist incompleto', `Preencha: ${missingField.label}`);
      return;
    }

    if (!situacaoGeral.trim()) {
      Alert.alert('Campo obrigatorio', 'Informe a situacao geral do radio.');
      return;
    }

    setSaving(true);

    try {
      await createRadioConference(
        {
          numeroSelo: sanitizedSelo,
          usuarioNome: session?.nome || 'usuario desconhecido',
          equipamentoOperante: checklist.equipamentoOperante,
          botaoFunciona: checklist.botaoFunciona,
          bateriaEncaixa: checklist.bateriaEncaixa,
          existemRachaduras: checklist.existemRachaduras,
          riscosProfundos: checklist.riscosProfundos,
          capaProtetora: checklist.capaProtetora,
          alcaTransporte: checklist.alcaTransporte,
          identificacaoIntegra: checklist.identificacaoIntegra,
          equipamentoLimpo: checklist.equipamentoLimpo,
          situacaoGeral,
          observacao: observacao.trim(),
          images,
        },
        {
          syncImmediately: true,
        },
      );

      const pendencias = await getPendingSyncCount();
      resetForm();

      Alert.alert(
        pendencias > 0 ? 'Salvo offline' : 'Conferencia salva',
        pendencias > 0
          ? 'A conferencia foi salva no dispositivo e sera enviada automaticamente quando o acesso ao servidor voltar.'
          : 'A conferencia foi salva e sincronizada com o servidor.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/forms/fiscal/radios'),
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        'Erro ao salvar',
        error instanceof Error ? error.message : 'Nao foi possivel salvar a conferencia.',
      );
    } finally {
      setSaving(false);
    }
  }, [checklist, images, numeroSelo, observacao, resetForm, router, session, situacaoGeral]);

  if (authorized === false) {
    return <Redirect href="/home" />;
  }

  if (authorized === null) {
    return (
      <SafeAreaView style={styles.centeredScreen}>
        <ActivityIndicator color="#1C6F47" />
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
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
              >
                <Ionicons name="arrow-back" size={22} color="#163126" />
              </TouchableOpacity>

              <View style={styles.headerText}>
                <Text style={styles.title}>Conferencia de Radio</Text>
                <Text style={styles.subtitle}>
                  Registre a conferencia mesmo offline. Quando o servidor voltar, dados e
                  imagens serao enviados automaticamente.
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Identificacao</Text>

              <Text style={styles.label}>Selo</Text>
              <View style={styles.searchWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Digite ou selecione o selo"
                  placeholderTextColor="#8A948D"
                  value={numeroSelo}
                  onChangeText={(value) => setNumeroSelo(value.toUpperCase())}
                  autoCapitalize="characters"
                />
                {loadingLookup ? (
                  <ActivityIndicator style={styles.searchSpinner} color="#1C6F47" />
                ) : null}
              </View>

              {suggestions.length > 0 ? (
                <View style={styles.suggestionsCard}>
                  {suggestions.map((item) => (
                    <TouchableOpacity
                      key={item.RadioSeloComplemento}
                      style={styles.suggestionRow}
                      onPress={() => selectSuggestion(item)}
                    >
                      <Text style={styles.suggestionTitle}>
                        {item.RadioSeloComplemento}
                      </Text>
                      <Text style={styles.suggestionMeta}>
                        Setor: {formatRadioSetor(item)} | Equipamento:{' '}
                        {formatRadioEquipamento(item)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              <View style={styles.radioDetailsCard}>
                <View style={styles.radioDetailsText}>
                  <Text style={styles.detailLabel}>Equipamento</Text>
                  <Text style={styles.detailValue}>
                    {formatRadioEquipamento(selectedRadio)}
                  </Text>

                  <Text style={styles.detailLabel}>Setor</Text>
                  <Text style={styles.detailValue}>
                    {formatRadioSetor(selectedRadio)}
                  </Text>

                  <Text style={styles.detailLabel}>Responsavel</Text>
                  <Text style={styles.detailValue}>
                    {formatRadioResponsavel(selectedRadio)}
                  </Text>

                  <Text style={styles.detailLabel}>Conferente</Text>
                  <Text style={styles.detailValue}>
                    {session?.nome || 'usuario desconhecido'}
                  </Text>
                </View>

                {radioImageUri ? (
                  <Image source={{ uri: radioImageUri }} style={styles.radioImage} />
                ) : (
                  <View style={styles.radioImagePlaceholder}>
                    <Ionicons name="radio-outline" size={28} color="#6B7C73" />
                  </View>
                )}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Checklist</Text>

              {CHECKLIST_FIELDS.map((field) => (
                <View key={field.key} style={styles.questionBlock}>
                  <Text style={styles.label}>{field.label}</Text>
                  <View style={styles.optionsRow}>
                    <ButtonSelect
                      label="Sim"
                      value="SIM"
                      state={checklist[field.key]}
                      setState={(value) => setChecklistValue(field.key, value)}
                    />
                    <ButtonSelect
                      label="Nao"
                      value="NAO"
                      state={checklist[field.key]}
                      setState={(value) => setChecklistValue(field.key, value)}
                    />
                    <ButtonSelect
                      label="N/A"
                      value="N/A"
                      state={checklist[field.key]}
                      setState={(value) => setChecklistValue(field.key, value)}
                    />
                  </View>
                </View>
              ))}

              <View style={styles.questionBlock}>
                <Text style={styles.label}>Situacao geral</Text>
                <View style={styles.optionsRow}>
                  <ButtonSelect
                    label="Conforme"
                    value="CONFORME"
                    state={situacaoGeral}
                    setState={setSituacaoGeral}
                  />
                  <ButtonSelect
                    label="Nao conforme"
                    value="NAO_CONFORME"
                    state={situacaoGeral}
                    setState={setSituacaoGeral}
                  />
                </View>
              </View>

              <Text style={styles.label}>Observacoes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Descreva detalhes encontrados durante a conferencia"
                placeholderTextColor="#8A948D"
                value={observacao}
                onChangeText={setObservacao}
                multiline
                textAlignVertical="top"
              />
            </View>

            <View style={styles.card}>
              <View style={styles.imagesHeader}>
                <Text style={styles.cardTitle}>Imagens</Text>
                <Text style={styles.imagesCounter}>{images.length}/10</Text>
              </View>

              <View style={styles.imageActions}>
                <TouchableOpacity
                  style={styles.imageActionButton}
                  onPress={() => void handleTakePhoto()}
                  disabled={processingImage}
                >
                  <Ionicons name="camera-outline" size={20} color="#163126" />
                  <Text style={styles.imageActionText}>Tirar foto</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.imageActionButton}
                  onPress={() => void handlePickFromLibrary()}
                  disabled={processingImage}
                >
                  <Ionicons name="images-outline" size={20} color="#163126" />
                  <Text style={styles.imageActionText}>Galeria</Text>
                </TouchableOpacity>
              </View>

              {processingImage ? (
                <View style={styles.processingRow}>
                  <ActivityIndicator color="#1C6F47" />
                  <Text style={styles.processingText}>Processando imagens...</Text>
                </View>
              ) : null}

              <View style={styles.imagesGrid}>
                {images.map((image) => (
                  <View key={image.id} style={styles.imageCard}>
                    <Image source={{ uri: image.uri }} style={styles.previewImage} />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => removeImage(image.id)}
                    >
                      <Ionicons name="close" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ))}

                {images.length === 0 ? (
                  <View style={styles.emptyImages}>
                    <Text style={styles.emptyImagesText}>
                      Nenhuma imagem anexada.
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={() => void handleSave()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.saveButtonText}>Salvar conferencia</Text>
                </>
              )}
            </TouchableOpacity>
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
  },
  screen: {
    flex: 1,
  },
  centeredScreen: {
    flex: 1,
    backgroundColor: '#F4F0E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 36,
    gap: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: '#D7DDD7',
  },
  headerText: {
    flex: 1,
    gap: 6,
    paddingTop: 2,
  },
  title: {
    color: '#1A2B22',
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '900',
  },
  subtitle: {
    color: '#51635A',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 22,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: '#D9E2DA',
  },
  cardTitle: {
    color: '#203128',
    fontSize: 19,
    fontWeight: '900',
  },
  label: {
    color: '#2D4438',
    fontSize: 15,
    fontWeight: '800',
  },
  searchWrapper: {
    position: 'relative',
  },
  searchSpinner: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CDD6CE',
    backgroundColor: '#F8FBF7',
    paddingHorizontal: 16,
    color: '#1E2E25',
    fontSize: 16,
    fontWeight: '700',
  },
  textArea: {
    minHeight: 110,
    paddingTop: 14,
  },
  suggestionsCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E7E0',
    overflow: 'hidden',
  },
  suggestionRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E7ECE7',
    backgroundColor: '#FBFCFB',
  },
  suggestionTitle: {
    color: '#1E2E25',
    fontSize: 15,
    fontWeight: '900',
  },
  suggestionMeta: {
    marginTop: 4,
    color: '#617167',
    fontSize: 12,
    fontWeight: '600',
  },
  radioDetailsCard: {
    flexDirection: 'row',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#EEF3EE',
    borderWidth: 1,
    borderColor: '#D9E2DA',
  },
  radioDetailsText: {
    flex: 1,
    gap: 4,
  },
  detailLabel: {
    color: '#678073',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  detailValue: {
    color: '#1F3429',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  radioImage: {
    width: 96,
    height: 96,
    borderRadius: 16,
    backgroundColor: '#DCE5DD',
  },
  radioImagePlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DCE5DD',
  },
  questionBlock: {
    gap: 10,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  imagesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  imagesCounter: {
    color: '#597165',
    fontSize: 14,
    fontWeight: '800',
  },
  imageActions: {
    flexDirection: 'row',
    gap: 10,
  },
  imageActionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#D8E6D8',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  imageActionText: {
    color: '#163126',
    fontSize: 14,
    fontWeight: '900',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  processingText: {
    color: '#597165',
    fontWeight: '700',
  },
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  imageCard: {
    width: 92,
    height: 92,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E6ECE6',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(14,23,17,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyImages: {
    width: '100%',
    paddingVertical: 8,
  },
  emptyImagesText: {
    color: '#66786D',
    fontSize: 14,
    fontWeight: '700',
  },
  saveButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#1C6F47',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
  },
  saveButtonDisabled: {
    opacity: 0.72,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
});
