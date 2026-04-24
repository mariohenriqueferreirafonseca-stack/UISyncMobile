import { getAuthSession, userHasSectorAccess, type AuthSession } from '@/services/auth';
import {
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
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

const TOTAL_ARCOS = 27;
const SIDES: StockMeasurementSide[] = ['DIREITO', 'ESQUERDO'];
const WAREHOUSE_OPTIONS = ['SOJA', 'FARELO E CASCA'] as const;

type InputPair = {
  id: string;
  angulo: string;
  medida: string;
};

type PairsBySideState = {
  DIREITO: InputPair[];
  ESQUERDO: InputPair[];
};

type MeasurementSession = {
  localId: string;
  idMedicao: string;
  dataMedicao: string;
  usuarioMedicao: string;
  usuarioMatricula: string;
  nomeAfericao: string;
  nomeArmazem: string;
};

function createPair(): InputPair {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    angulo: '',
    medida: '',
  };
}

function createInitialSides(): PairsBySideState {
  return {
    DIREITO: [createPair()],
    ESQUERDO: [createPair()],
  };
}

export default function MedicaoEstoqueScreen() {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
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
  const [pairsBySide, setPairsBySide] = useState(createInitialSides);
  const [saving, setSaving] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const scrollOffsetRef = useRef(0);
  const pairCardRefs = useRef<Record<string, View | null>>({});
  const angleInputRefs = useRef<Record<string, TextInput | null>>({});

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

  const getPairKey = useCallback(
    (lado: StockMeasurementSide, pairId: string) => `${lado}:${pairId}`,
    [],
  );

  const centralizarEFocarLeitura = useCallback(
    (lado: StockMeasurementSide, pairId: string) => {
      const pairKey = getPairKey(lado, pairId);

      const attemptFocus = (retries = 8) => {
        const pairCard = pairCardRefs.current[pairKey];
        const angleInput = angleInputRefs.current[pairKey];

        if (!angleInput) {
          if (retries > 0) {
            setTimeout(() => attemptFocus(retries - 1), 50);
          }
          return;
        }

        if (!pairCard || typeof pairCard.measureInWindow !== 'function') {
          scrollViewRef.current?.scrollToEnd({ animated: true });
          setTimeout(() => {
            angleInputRefs.current[pairKey]?.focus();
          }, 180);
          return;
        }

        pairCard.measureInWindow((_x, y, _width, height) => {
          const targetTop = Math.max(0, windowHeight / 2 - height / 2);
          const delta = y - targetTop;
          const nextOffset = Math.max(0, scrollOffsetRef.current + delta);

          scrollViewRef.current?.scrollTo({
            y: nextOffset,
            animated: true,
          });

          setTimeout(() => {
            angleInputRefs.current[pairKey]?.focus();
          }, 180);
        });
      };

      setTimeout(() => attemptFocus(), 40);
    },
    [getPairKey, windowHeight],
  );

  const resetMeasurementForm = useCallback(() => {
    setMeasurementSession(null);
    setCurrentArco(null);
    setArcoInicial('');
    setNomeAfericao('');
    setNomeArmazem('');
    setSavedRows([]);
    setPairsBySide(createInitialSides());
  }, []);

  const iniciarMedicao = () => {
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

    setMeasurementSession(
      createStockMeasurementSession({
        usuarioMedicao,
        usuarioMatricula,
        nomeAfericao: nomeAfericao.trim(),
        nomeArmazem,
      }),
    );
    setCurrentArco(numeroArco);
    setSavedRows([]);
    setPairsBySide(createInitialSides());
  };

  const adicionarPar = (lado: StockMeasurementSide) => {
    const nextPair = createPair();

    setPairsBySide((current) => ({
      ...current,
      [lado]: [...current[lado], nextPair],
    }));

    centralizarEFocarLeitura(lado, nextPair.id);
  };

  const atualizarPar = (
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
  };

  const removerPar = (lado: StockMeasurementSide, pairId: string) => {
    setPairsBySide((current) => {
      const filtered = current[lado].filter((pair) => pair.id !== pairId);

      return {
        ...current,
        [lado]: filtered.length > 0 ? filtered : [createPair()],
      };
    });
  };

  const buildRowsForCurrentArco = (sourcePairsBySide: PairsBySideState = pairsBySide) => {
    if (!measurementSession || !currentArco) {
      return null;
    }

    const rows: StockMeasurementRow[] = [];

    for (const lado of SIDES) {
      const validPairs = sourcePairsBySide[lado].filter(
        (pair) => pair.angulo.trim() || pair.medida.trim(),
      );

      if (validPairs.length === 0) {
        return {
          error: `Adicione pelo menos uma leitura para o lado ${lado.toLowerCase()}.`,
          rows: [] as StockMeasurementRow[],
        };
      }

      const incompletePair = validPairs.find(
        (pair) => !pair.angulo.trim(),
      );

      if (incompletePair) {
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
  };

  const salvarArcoAtual = useCallback(
    async (
      rows: StockMeasurementRow[],
      options?: {
        focusNextFirstAngle?: boolean;
      },
    ) => {
      if (!measurementSession || !currentArco) {
        Alert.alert('Inicie a medicao', 'Informe o arco inicial para comecar.');
        return;
      }

      const allRows = [...savedRows, ...rows];
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
          resetMeasurementForm();
          return;
        }

        const nextSides = createInitialSides();
        setCurrentArco(currentArco - 1);
        setPairsBySide(nextSides);

        if (options?.focusNextFirstAngle) {
          centralizarEFocarLeitura('DIREITO', nextSides.DIREITO[0].id);
          return;
        }

        Alert.alert(
          'Arco salvo',
          `As leituras do arco ${currentArco} foram salvas. Agora siga para o arco ${currentArco - 1}.`,
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
      centralizarEFocarLeitura,
      currentArco,
      measurementSession,
      resetMeasurementForm,
      savedRows,
    ],
  );

  const avancarArco = async () => {
    if (!measurementSession || !currentArco) {
      Alert.alert('Inicie a medicao', 'Informe o arco inicial para comecar.');
      return;
    }

    const result = buildRowsForCurrentArco();

    if (!result || result.error) {
      Alert.alert('Campos obrigatorios', result?.error || 'Nao foi possivel montar a medicao.');
      return;
    }

    await salvarArcoAtual(result.rows);
  };

  const duplicarDireitoParaEsquerdoEAvancar = async () => {
    const leiturasDireitas = pairsBySide.DIREITO
      .filter((pair) => pair.angulo.trim() || pair.medida.trim())
      .map((pair) => ({
        id: createPair().id,
        angulo: pair.angulo.trim(),
        medida: pair.medida.trim(),
      }));

    if (leiturasDireitas.length === 0) {
      Alert.alert(
        'Campos obrigatorios',
        'Preencha pelo menos uma leitura completa no lado direito antes de duplicar.',
      );
      return;
    }

    const leituraIncompleta = leiturasDireitas.find(
      (pair) => !pair.angulo.trim(),
    );

    if (leituraIncompleta) {
      Alert.alert(
        'Campos obrigatorios',
        'Preencha o angulo em todas as leituras do lado direito antes de duplicar.',
      );
      return;
    }

    const duplicatedPairsBySide: PairsBySideState = {
      DIREITO: pairsBySide.DIREITO,
      ESQUERDO: leiturasDireitas,
    };

    setPairsBySide(duplicatedPairsBySide);

    const result = buildRowsForCurrentArco(duplicatedPairsBySide);

    if (!result || result.error) {
      Alert.alert('Campos obrigatorios', result?.error || 'Nao foi possivel montar a medicao.');
      return;
    }

    await salvarArcoAtual(result.rows, {
      focusNextFirstAngle: true,
    });
  };

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
            scrollEventThrottle={16}
            onScroll={(event) => {
              scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
            }}
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
                Cada arco e preenchido separadamente. Ao salvar, o app registra o arco
                no offline e avanca para o proximo em ordem decrescente.
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

              {measurementSession ? (
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryText}>ID da medicao: {measurementSession.idMedicao}</Text>
                  <Text style={styles.summaryText}>
                    Nome: {measurementSession.nomeAfericao}
                  </Text>
                  <Text style={styles.summaryText}>
                    Armazem: {measurementSession.nomeArmazem}
                  </Text>
                  <Text style={styles.summaryText}>
                    Data: {measurementSession.dataMedicao} | Operador: {measurementSession.usuarioMedicao}
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

                    {pairsBySide[lado].map((pair, index) => (
                      <View
                        key={pair.id}
                        ref={(node) => {
                          pairCardRefs.current[getPairKey(lado, pair.id)] = node;
                        }}
                        collapsable={false}
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
                            angleInputRefs.current[getPairKey(lado, pair.id)] = node;
                          }}
                          style={styles.input}
                          value={pair.angulo}
                          onChangeText={(value) => atualizarPar(lado, pair.id, 'angulo', value)}
                          keyboardType="numeric"
                          placeholder="Digite o angulo"
                          placeholderTextColor="#7A857D"
                        />

                        <Text style={styles.label}>MEDIDA</Text>
                        <TextInput
                          style={styles.input}
                          value={pair.medida}
                          onChangeText={(value) => atualizarPar(lado, pair.id, 'medida', value)}
                          keyboardType="numeric"
                          placeholder="Digite a medida"
                          placeholderTextColor="#7A857D"
                        />
                      </View>
                    ))}

                    {lado === 'DIREITO' ? (
                      <View style={styles.sideActionRow}>
                        <TouchableOpacity
                          style={[styles.sideActionButton, saving && styles.buttonDisabled]}
                          onPress={() => adicionarPar(lado)}
                          disabled={saving}
                        >
                          <Ionicons name="add" size={18} color="#173328" />
                          <Text style={styles.sideActionButtonText}>Adicionar leitura</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.sideActionButton,
                            styles.duplicateButton,
                            saving && styles.buttonDisabled,
                          ]}
                          onPress={() => void duplicarDireitoParaEsquerdoEAvancar()}
                          disabled={saving}
                        >
                          <Ionicons name="copy-outline" size={18} color="#173328" />
                          <Text style={styles.duplicateButtonText}>
                            {currentArco === 1
                              ? 'Duplicar e concluir'
                              : 'Duplicar e avancar'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.buttonDisabled]}
                  onPress={() => void avancarArco()}
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
              </View>
            ) : null}
          </ScrollView>
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
  sideActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  sideActionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#C7D7CB',
    backgroundColor: '#E7EFE8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  sideActionButtonText: {
    color: '#173328',
    fontWeight: '800',
    textAlign: 'center',
  },
  duplicateButton: {
    marginTop: 0,
  },
  duplicateButtonText: {
    color: '#173328',
    fontWeight: '800',
    textAlign: 'center',
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
});
