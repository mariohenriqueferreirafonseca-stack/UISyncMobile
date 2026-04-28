import { getAuthSession, userHasSectorAccess, type AuthSession } from '@/services/auth';
import {
  cancelStockMeasurementSession,
  createStockMeasurementSession,
  persistStockMeasurementProgress,
} from '@/services/stockMeasurement';
import type { StockMeasurementRow, StockMeasurementSide } from '@/services/sync/types';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

const TOTAL_ARCOS = 27;
const SIDES: StockMeasurementSide[] = ['DIREITO', 'ESQUERDO'];
const WAREHOUSE_OPTIONS = ['SOJA', 'FARELO E CASCA'] as const;

type InputPair = {
  id: string;
  angulo: string;
  medida: string;
};

type PairsBySide = Record<StockMeasurementSide, InputPair[]>;

type MeasurementSession = {
  localId: string;
  idMedicao: string;
  dataMedicao: string;
  usuarioMedicao: string;
  usuarioMatricula: string;
  nomeAfericao: string;
  nomeArmazem: string;
};

function createPairId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createPair(overrides?: Partial<InputPair>): InputPair {
  return {
    id: overrides?.id || createPairId(),
    angulo: overrides?.angulo || '',
    medida: overrides?.medida || '',
  };
}

function createInitialSides(): PairsBySide {
  return {
    DIREITO: [createPair()],
    ESQUERDO: [createPair()],
  };
}

function getPairRefKey(lado: StockMeasurementSide, pairId: string) {
  return `${lado}:${pairId}`;
}

export default function MedicaoEstoqueScreen() {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const pairCardRefs = useRef<Record<string, View | null>>({});
  const angleInputRefs = useRef<Record<string, TextInput | null>>({});

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [arcoInicial, setArcoInicial] = useState('');
  const [nomeAfericao, setNomeAfericao] = useState('');
  const [nomeArmazem, setNomeArmazem] = useState('');
  const [measurementSession, setMeasurementSession] = useState<MeasurementSession | null>(
    null,
  );
  const [currentArco, setCurrentArco] = useState<number | null>(null);
  const [savedRows, setSavedRows] = useState<StockMeasurementRow[]>([]);
  const [pairsBySide, setPairsBySide] = useState<PairsBySide>(createInitialSides);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [scrollOffsetY, setScrollOffsetY] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        const currentSession = await getAuthSession();
        const canAccess = userHasSectorAccess(currentSession, ['1161']);

        if (!active) {
          return;
        }

        setSession(currentSession);
        setAuthorized(canAccess);
      })();

      return () => {
        active = false;
      };
    }, []),
  );

  const totalLinhas = useMemo(() => savedRows.length, [savedRows.length]);
  const canCancelMeasurement = useMemo(
    () =>
      Boolean(
        measurementSession ||
          currentArco ||
          arcoInicial.trim() ||
          nomeAfericao.trim() ||
          nomeArmazem,
      ),
    [arcoInicial, currentArco, measurementSession, nomeAfericao, nomeArmazem],
  );

  const resetMeasurementState = useCallback((clearSetupFields = true) => {
    setMeasurementSession(null);
    setCurrentArco(null);
    setSavedRows([]);
    setPairsBySide(createInitialSides());
    setCancelModalVisible(false);
    setCancelling(false);

    if (clearSetupFields) {
      setArcoInicial('');
      setNomeAfericao('');
      setNomeArmazem('');
    }
  }, []);

  const centralizarEFocarLeitura = useCallback(
    (lado: StockMeasurementSide, pairId: string) => {
      const refKey = getPairRefKey(lado, pairId);
      const pairCard = pairCardRefs.current[refKey];
      const angleInput = angleInputRefs.current[refKey];

      const focusInput = () => {
        setTimeout(() => {
          angleInput?.focus();
        }, 180);
      };

      if (!pairCard || typeof pairCard.measureInWindow !== 'function') {
        scrollViewRef.current?.scrollToEnd({ animated: true });
        focusInput();
        return;
      }

      requestAnimationFrame(() => {
        pairCard.measureInWindow((_x, y, _width, height) => {
          const targetY = Math.max(
            scrollOffsetY + y - windowHeight / 2 + height / 2,
            0,
          );

          scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
          focusInput();
        });
      });
    },
    [scrollOffsetY, windowHeight],
  );

  const iniciarMedicao = useCallback(() => {
    const numeroArco = Number(arcoInicial);

    if (!Number.isInteger(numeroArco) || numeroArco < 1 || numeroArco > TOTAL_ARCOS) {
      Alert.alert('Arco invalido', `Informe um arco entre 1 e ${TOTAL_ARCOS}.`);
      return;
    }

    if (!nomeAfericao.trim()) {
      Alert.alert('Campo obrigatorio', 'Informe o nome da medicao.');
      return;
    }

    if (!nomeArmazem) {
      Alert.alert('Campo obrigatorio', 'Selecione qual armazem esta sendo medido.');
      return;
    }

    const usuarioMedicao = session?.nome || 'usuario desconhecido';
    const usuarioMatricula = session?.matricula || '';
    const nextSession = createStockMeasurementSession({
      usuarioMedicao,
      usuarioMatricula,
      nomeAfericao: nomeAfericao.trim(),
      nomeArmazem,
    });
    const nextSides = createInitialSides();

    setMeasurementSession(nextSession);
    setCurrentArco(numeroArco);
    setSavedRows([]);
    setPairsBySide(nextSides);

    setTimeout(() => {
      centralizarEFocarLeitura('DIREITO', nextSides.DIREITO[0].id);
    }, 120);
  }, [arcoInicial, centralizarEFocarLeitura, nomeAfericao, nomeArmazem, session]);

  const adicionarPar = useCallback(
    (lado: StockMeasurementSide) => {
      const nextPair = createPair();

      setPairsBySide((current) => ({
        ...current,
        [lado]: [...current[lado], nextPair],
      }));

      setTimeout(() => {
        centralizarEFocarLeitura(lado, nextPair.id);
      }, 100);
    },
    [centralizarEFocarLeitura],
  );

  const atualizarPar = useCallback(
    (
      lado: StockMeasurementSide,
      pairId: string,
      field: 'angulo' | 'medida',
      value: string,
    ) => {
      setPairsBySide((current) => ({
        ...current,
        [lado]: current[lado].map((pair) =>
          pair.id === pairId
            ? {
                ...pair,
                [field]: value,
              }
            : pair,
        ),
      }));
    },
    [],
  );

  const removerPar = useCallback((lado: StockMeasurementSide, pairId: string) => {
    setPairsBySide((current) => {
      const filtered = current[lado].filter((pair) => pair.id !== pairId);

      return {
        ...current,
        [lado]: filtered.length > 0 ? filtered : [createPair()],
      };
    });
  }, []);

  const buildRowsForCurrentArco = useCallback(
    (pairsSnapshot: PairsBySide = pairsBySide) => {
      if (!measurementSession || !currentArco) {
        return null;
      }

      const rows: StockMeasurementRow[] = [];

      for (const lado of SIDES) {
        const validPairs = pairsSnapshot[lado].filter(
          (pair) => pair.angulo.trim() || pair.medida.trim(),
        );

        if (validPairs.length === 0) {
          return {
            error: `Adicione pelo menos uma leitura para o lado ${lado.toLowerCase()}.`,
            rows: [] as StockMeasurementRow[],
          };
        }

        const invalidPair = validPairs.find((pair) => !pair.angulo.trim());

        if (invalidPair) {
          return {
            error: `Preencha o angulo em todas as leituras do lado ${lado.toLowerCase()}.`,
            rows: [] as StockMeasurementRow[],
          };
        }

        validPairs.forEach((pair) => {
          rows.push({
            id_medicao: measurementSession.idMedicao,
            data_medicao: measurementSession.dataMedicao,
            usuario_medicao: measurementSession.usuarioMedicao,
            nome_afericao: measurementSession.nomeAfericao,
            nome_armazem: measurementSession.nomeArmazem,
            lado_medicao: lado,
            arco: currentArco,
            angulo_graus: pair.angulo.trim(),
            medida_metros: pair.medida.trim(),
          });
        });
      }

      return {
        error: null,
        rows,
      };
    },
    [currentArco, measurementSession, pairsBySide],
  );

  const salvarArcoAtual = useCallback(
    async (options?: {
      pairsSnapshot?: PairsBySide;
      focusNextFirstAngle?: boolean;
    }) => {
      if (!measurementSession || !currentArco) {
        Alert.alert('Inicie a medicao', 'Informe o arco inicial para comecar.');
        return;
      }

      const result = buildRowsForCurrentArco(options?.pairsSnapshot);

      if (!result || result.error) {
        Alert.alert(
          'Campos obrigatorios',
          result?.error || 'Nao foi possivel montar a medicao.',
        );
        return;
      }

      const allRows = [...savedRows, ...result.rows];
      setSaving(true);

      try {
        await persistStockMeasurementProgress({
          localId: measurementSession.localId,
          idMedicao: measurementSession.idMedicao,
          dataMedicao: measurementSession.dataMedicao,
          usuarioMedicao: measurementSession.usuarioMedicao,
          usuarioMatricula: measurementSession.usuarioMatricula,
          nomeAfericao: measurementSession.nomeAfericao,
          nomeArmazem: measurementSession.nomeArmazem,
          rows: allRows,
        });

        setSavedRows(allRows);

        if (currentArco === 1) {
          Alert.alert(
            'Medicao concluida',
            `A medicao ${measurementSession.idMedicao} foi salva com ${allRows.length} linhas.`,
          );
          resetMeasurementState(true);
          return;
        }

        const nextSides = createInitialSides();
        const nextArco = currentArco - 1;

        setCurrentArco(nextArco);
        setPairsBySide(nextSides);

        if (options?.focusNextFirstAngle) {
          setTimeout(() => {
            centralizarEFocarLeitura('DIREITO', nextSides.DIREITO[0].id);
          }, 120);
          return;
        }

        Alert.alert(
          'Arco salvo',
          `As leituras do arco ${currentArco} foram salvas. Agora siga para o arco ${nextArco}.`,
        );
      } catch (error) {
        Alert.alert(
          'Erro',
          error instanceof Error ? error.message : 'Nao foi possivel salvar a medicao.',
        );
      } finally {
        setSaving(false);
      }
    },
    [
      buildRowsForCurrentArco,
      centralizarEFocarLeitura,
      currentArco,
      measurementSession,
      resetMeasurementState,
      savedRows,
    ],
  );

  const duplicarDireitoParaEsquerdoEAvancar = useCallback(async () => {
    const duplicatedLeft = pairsBySide.DIREITO.map((pair) =>
      createPair({
        angulo: pair.angulo,
        medida: pair.medida,
      }),
    );

    await salvarArcoAtual({
      pairsSnapshot: {
        ...pairsBySide,
        ESQUERDO: duplicatedLeft,
      },
      focusNextFirstAngle: true,
    });
  }, [pairsBySide, salvarArcoAtual]);

  const handleConfirmCancel = useCallback(async () => {
    setCancelling(true);

    try {
      if (measurementSession) {
        await cancelStockMeasurementSession({
          localId: measurementSession.localId,
          idMedicao: measurementSession.idMedicao,
        });
      }

      resetMeasurementState(true);
    } catch (error) {
      Alert.alert(
        'Erro',
        error instanceof Error ? error.message : 'Nao foi possivel cancelar a medicao.',
      );
    } finally {
      setCancelling(false);
    }
  }, [measurementSession, resetMeasurementState]);

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
          <ScrollView
            ref={scrollViewRef}
            style={styles.container}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            onScroll={(event) => setScrollOffsetY(event.nativeEvent.contentOffset.y)}
            scrollEventThrottle={16}
          >
            <View style={styles.header}>
              <TouchableOpacity style={styles.backChip} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#0B3D2E" />
              </TouchableOpacity>
            </View>

            <View style={styles.heroCard}>
              <Text style={styles.eyebrow}>PCP</Text>
              <Text style={styles.title}>Medicao de Estoque</Text>
              <Text style={styles.helperText}>
                Esse formulario tem como objetivo agilizar e digitalizar a medicao do
                estoque de soja, farelo, casca e demais.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Inicio da medicao</Text>
              <Text style={styles.label}>QUAL ARCO A MEDICAO VAI COMECAR</Text>
              <TextInput
                style={styles.input}
                value={arcoInicial}
                onChangeText={setArcoInicial}
                keyboardType="number-pad"
                editable={!currentArco}
                placeholder="Exemplo: 27"
                placeholderTextColor="#7A857D"
              />

              <Text style={styles.label}>NOME DA MEDICAO</Text>
              <TextInput
                style={styles.input}
                value={nomeAfericao}
                onChangeText={setNomeAfericao}
                editable={!currentArco}
                placeholder="Exemplo: SOJA MARIO 01-04-2026"
                placeholderTextColor="#7A857D"
              />

              <Text style={styles.label}>QUAL ARMAZEM ESTA SENDO MEDIDO</Text>
              <View style={styles.optionRow}>
                {WAREHOUSE_OPTIONS.map((option) => {
                  const selected = nomeArmazem === option;

                  return (
                    <TouchableOpacity
                      key={option}
                      style={[styles.optionButton, selected && styles.optionButtonSelected]}
                      onPress={() => setNomeArmazem(option)}
                      disabled={Boolean(currentArco)}
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          selected && styles.optionButtonTextSelected,
                        ]}
                      >
                        {option}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {!currentArco ? (
                <TouchableOpacity style={styles.primaryButton} onPress={iniciarMedicao}>
                  <Text style={styles.primaryButtonText}>Iniciar medicao</Text>
                </TouchableOpacity>
              ) : null}

              {!currentArco && canCancelMeasurement ? (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setCancelModalVisible(true)}
                >
                  <Text style={styles.secondaryButtonText}>Cancelar medicao</Text>
                </TouchableOpacity>
              ) : null}

              {measurementSession ? (
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryText}>
                    ID da medicao: {measurementSession.idMedicao}
                  </Text>
                  <Text style={styles.summaryText}>
                    Nome: {measurementSession.nomeAfericao}
                  </Text>
                  <Text style={styles.summaryText}>
                    Armazem: {measurementSession.nomeArmazem}
                  </Text>
                  <Text style={styles.summaryText}>
                    Data: {measurementSession.dataMedicao} | Operador:{' '}
                    {measurementSession.usuarioMedicao}
                  </Text>
                  <Text style={styles.summaryText}>Linhas salvas: {totalLinhas}</Text>
                </View>
              ) : null}
            </View>

            {currentArco ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Arco {currentArco}</Text>
                <Text style={styles.infoText}>
                  Preencha somente o arco atual. Depois toque em salvar para avancar ao
                  arco {currentArco - 1 > 0 ? currentArco - 1 : 1}.
                </Text>

                {SIDES.map((lado) => (
                  <View key={lado} style={styles.sideCard}>
                    <View style={styles.sideHeader}>
                      <Text style={styles.sideTitle}>{lado}</Text>
                      {lado !== 'DIREITO' ? (
                        <TouchableOpacity
                          style={styles.addButton}
                          onPress={() => adicionarPar(lado)}
                        >
                          <Ionicons name="add" size={18} color="#173328" />
                          <Text style={styles.addButtonText}>Adicionar leitura</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    {pairsBySide[lado].map((pair, index) => {
                      const refKey = getPairRefKey(lado, pair.id);

                      return (
                        <View
                          key={pair.id}
                          ref={(node) => {
                            pairCardRefs.current[refKey] = node;
                          }}
                          style={styles.pairCard}
                        >
                          <View style={styles.pairHeader}>
                            <Text style={styles.pairTitle}>Leitura {index + 1}</Text>
                            {pairsBySide[lado].length > 1 ? (
                              <TouchableOpacity onPress={() => removerPar(lado, pair.id)}>
                                <Text style={styles.removeText}>Remover</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>

                          <Text style={styles.label}>ANGULO</Text>
                          <TextInput
                            ref={(node) => {
                              angleInputRefs.current[refKey] = node;
                            }}
                            style={styles.input}
                            value={pair.angulo}
                            onChangeText={(value) =>
                              atualizarPar(lado, pair.id, 'angulo', value)
                            }
                            keyboardType="numeric"
                            placeholder="Digite o angulo"
                            placeholderTextColor="#7A857D"
                          />

                          <Text style={styles.label}>MEDIDA</Text>
                          <TextInput
                            style={styles.input}
                            value={pair.medida}
                            onChangeText={(value) =>
                              atualizarPar(lado, pair.id, 'medida', value)
                            }
                            keyboardType="numeric"
                            placeholder="Digite a medida"
                            placeholderTextColor="#7A857D"
                          />
                        </View>
                      );
                    })}

                    {lado === 'DIREITO' ? (
                      <View style={styles.sideActionRow}>
                        <TouchableOpacity
                          style={styles.sideActionButton}
                          onPress={() => adicionarPar(lado)}
                        >
                          <Ionicons name="add" size={18} color="#173328" />
                          <Text style={styles.sideActionButtonText}>Adicionar leitura</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.sideActionButton, styles.duplicateActionButton]}
                          onPress={() => void duplicarDireitoParaEsquerdoEAvancar()}
                          disabled={saving}
                        >
                          <Ionicons name="copy-outline" size={18} color="#173328" />
                          <Text style={styles.sideActionButtonText}>
                            Duplicar no lado esquerdo e avancar
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.buttonDisabled]}
                  onPress={() => void salvarArcoAtual()}
                  disabled={saving}
                >
                  <Text style={styles.saveButtonText}>
                    {saving
                      ? 'Salvando...'
                      : currentArco === 1
                        ? 'Salvar e concluir'
                        : `Salvar arco ${currentArco} e ir para ${currentArco - 1}`}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.secondaryButton, (saving || cancelling) && styles.buttonDisabled]}
                  onPress={() => setCancelModalVisible(true)}
                  disabled={saving || cancelling}
                >
                  <Text style={styles.secondaryButtonText}>Cancelar medicao</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal
        visible={cancelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!cancelling) {
            setCancelModalVisible(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cancelar medicao</Text>
            <Text style={styles.modalSubtitle}>
              {measurementSession
                ? 'Isso vai remover a medicao salva no aparelho, excluir no servidor quando possivel e voltar para o inicio do formulario.'
                : 'Isso vai descartar os dados preenchidos e voltar para o inicio do formulario.'}
            </Text>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalSecondaryButton}
                onPress={() => setCancelModalVisible(false)}
                disabled={cancelling}
              >
                <Text style={styles.modalSecondaryButtonText}>Voltar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalPrimaryButton, cancelling && styles.buttonDisabled]}
                onPress={() => void handleConfirmCancel()}
                disabled={cancelling}
              >
                <Text style={styles.modalPrimaryButtonText}>
                  {cancelling ? 'Cancelando...' : 'Confirmar cancelamento'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  container: {
    flex: 1,
  },
  content: {
    padding: 18,
    paddingBottom: 40,
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
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 28,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D6DDD4',
  },
  sectionTitle: {
    color: '#173328',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  label: {
    marginTop: 12,
    marginBottom: 8,
    color: '#264337',
    fontWeight: '800',
  },
  input: {
    minHeight: 54,
    backgroundColor: '#F7F8F4',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#D4DBD1',
    color: '#1F2F27',
  },
  primaryButton: {
    marginTop: 14,
    backgroundColor: '#7AA486',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  secondaryButton: {
    marginTop: 12,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C76B6B',
    backgroundColor: '#FFF6F6',
  },
  secondaryButtonText: {
    color: '#A24B4B',
    fontWeight: '800',
  },
  summaryBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#EEF2EC',
    gap: 6,
  },
  summaryText: {
    color: '#264337',
    fontWeight: '600',
  },
  optionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  optionButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D4DBD1',
    backgroundColor: '#F7F8F4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  optionButtonSelected: {
    backgroundColor: '#173328',
    borderColor: '#173328',
  },
  optionButtonText: {
    color: '#264337',
    fontWeight: '800',
    textAlign: 'center',
  },
  optionButtonTextSelected: {
    color: '#FFFFFF',
  },
  infoText: {
    marginTop: 6,
    color: '#4E6B5D',
    lineHeight: 20,
  },
  sideCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 22,
    backgroundColor: '#F7F8F4',
    borderWidth: 1,
    borderColor: '#DCE4DB',
  },
  sideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sideTitle: {
    color: '#173328',
    fontSize: 18,
    fontWeight: '800',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#E7EFE8',
  },
  addButtonText: {
    color: '#173328',
    fontWeight: '700',
  },
  pairCard: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#D6DDD4',
  },
  pairHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pairTitle: {
    color: '#173328',
    fontWeight: '800',
  },
  removeText: {
    color: '#C76B6B',
    fontWeight: '700',
  },
  sideActionRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  sideActionButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: '#E7EFE8',
    borderWidth: 1,
    borderColor: '#D4DBD1',
    gap: 6,
  },
  duplicateActionButton: {
    backgroundColor: '#EAF3EC',
  },
  sideActionButtonText: {
    color: '#173328',
    fontWeight: '800',
    textAlign: 'center',
  },
  saveButton: {
    marginTop: 18,
    backgroundColor: '#173328',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 20, 16, 0.42)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFDF8',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#D6DDD4',
  },
  modalTitle: {
    color: '#173328',
    fontSize: 20,
    fontWeight: '800',
  },
  modalSubtitle: {
    marginTop: 10,
    color: '#4E6B5D',
    lineHeight: 20,
  },
  modalActionRow: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 12,
  },
  modalSecondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D4DBD1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F8F4',
  },
  modalSecondaryButtonText: {
    color: '#264337',
    fontWeight: '800',
  },
  modalPrimaryButton: {
    flex: 1.4,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#173328',
    paddingHorizontal: 14,
  },
  modalPrimaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    textAlign: 'center',
  },
});
