import { getAuthSession, userHasSectorAccess } from '@/services/auth';
import {
  getOfflineRadioCatalogStatus,
  getRadioSetoresForConference,
  isOfflineRadioCatalogReady,
  listRadiosForConference,
  syncOfflineRadioCatalog,
} from '@/services/radios';
import type { RadioListItem } from '@/services/sync/types';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

function getSetor(item: RadioListItem) {
  return String(item.RadioSetor ?? item.Setor ?? '').trim();
}

function getEquipamento(item: RadioListItem) {
  return item.Equipamento?.trim() || 'Nao informado';
}

function getSeloCurto(item: RadioListItem) {
  return (
    item.RadioSeloComplemento.trim().split('-')[0]?.trim() ||
    item.RadioSeloComplemento
  );
}

export default function RadiosListScreen() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [radios, setRadios] = useState<RadioListItem[]>([]);
  const [setores, setSetores] = useState<string[]>([]);
  const [setorSearch, setSetorSearch] = useState('');
  const [seloSearch, setSeloSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const carregarSetores = useCallback(async () => {
    const cachedSetores = await getRadioSetoresForConference();
    setSetores(cachedSetores);
  }, []);

  const carregarRadios = useCallback(
    async (params?: { setor?: string; selo?: string }) => {
      setLoading(true);

      try {
        const response = await listRadiosForConference({
          setor: params?.setor ?? setorSearch,
          selo: params?.selo ?? seloSearch,
          limit: 500,
        });

        setRadios(response.items);
        setStatusMessage(
          response.items.length > 0
            ? 'Lista atualizada. Se estiver offline, os dados vieram da base salva no aparelho.'
            : 'Nenhum radio encontrado para os filtros informados.',
        );
        await carregarSetores();
      } finally {
        setLoading(false);
      }
    },
    [carregarSetores, seloSearch, setorSearch],
  );

  const atualizarBaseOffline = useCallback(async () => {
    setSyncingCatalog(true);
    setStatusMessage('Atualizando base offline de radios...');

    try {
      const synced = await syncOfflineRadioCatalog();
      const cache = await getOfflineRadioCatalogStatus();

      if (synced || isOfflineRadioCatalogReady(cache)) {
        setStatusMessage(
          `Base offline pronta com ${cache.items.length} radios. Ela sera usada sem acesso ao servidor.`,
        );
        await carregarSetores();
        return;
      }

      setStatusMessage(
        cache.items.length > 0
          ? `Sem conexao com o servidor. Usando a base offline salva com ${cache.items.length} radios.`
          : 'Sem conexao com o servidor e sem base offline salva neste aparelho.',
      );
    } finally {
      setSyncingCatalog(false);
    }
  }, [carregarSetores]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        const session = await getAuthSession();
        const canAccess = userHasSectorAccess(session, ['1161']);

        if (!active) {
          return;
        }

        setAuthorized(canAccess);

        if (!canAccess) {
          return;
        }

        const cache = await getOfflineRadioCatalogStatus();

        if (!isOfflineRadioCatalogReady(cache)) {
          void atualizarBaseOffline();
        } else {
          await carregarSetores();
        }

        await carregarRadios();
      })();

      return () => {
        active = false;
      };
    }, [atualizarBaseOffline, carregarRadios, carregarSetores]),
  );

  const aplicarSetorRapido = (setor: string) => {
    setSetorSearch(setor);
    void carregarRadios({ setor, selo: seloSearch });
  };

  const handleConferir = (radio: RadioListItem) => {
    router.push({
      pathname: '/forms/fiscal/radios/conferencia',
      params: { selo: radio.RadioSeloComplemento },
    });
  };

  if (authorized === false) {
    return <Redirect href="/home" />;
  }

  if (authorized === null) {
    return <View style={{ flex: 1, backgroundColor: '#002611' }} />;
  }

  return (
    <LinearGradient colors={['#002611', '#07391C']} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={28} color="#E7F2E8" />
            </TouchableOpacity>

            <View style={styles.headerText}>
              <Text style={styles.title}>Lista de Radios</Text>
              <Text style={styles.subtitle}>
                Filtre por RadioSetor ou RadioSeloComplemento e confira os radios
                pendentes.
              </Text>
            </View>
          </View>

          <View style={styles.filterCard}>
            <Text style={styles.fieldLabel}>Setor</Text>
            <TextInput
              style={styles.input}
              placeholder="Digite o RadioSetor"
              placeholderTextColor="#7C9382"
              value={setorSearch}
              onChangeText={setSetorSearch}
            />

            {setores.length > 0 ? (
              <View style={styles.quickSetorGrid}>
                {setores.map((setor) => (
                  <TouchableOpacity
                    key={setor}
                    style={[
                      styles.quickSetorButton,
                      setorSearch === setor && styles.quickSetorButtonActive,
                    ]}
                    onPress={() => aplicarSetorRapido(setor)}
                  >
                    <Text
                      style={[
                        styles.quickSetorText,
                        setorSearch === setor && styles.quickSetorTextActive,
                      ]}
                    >
                      {setor}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>Busca por selo</Text>
            <TextInput
              style={styles.input}
              placeholder="Digite o RadioSeloComplemento"
              placeholderTextColor="#7C9382"
              value={seloSearch}
              onChangeText={setSeloSearch}
              autoCapitalize="characters"
            />

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.outlineButton}
                onPress={() => {
                  setSetorSearch('');
                  setSeloSearch('');
                  void carregarRadios({ setor: '', selo: '' });
                }}
              >
                <Text style={styles.outlineButtonText}>Limpar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.searchButton}
                onPress={() => void carregarRadios()}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#082812" />
                ) : (
                  <Ionicons name="search" size={22} color="#082812" />
                )}
                <Text style={styles.searchButtonText}>Buscar</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.syncButton}
              onPress={() => void atualizarBaseOffline()}
              disabled={syncingCatalog}
            >
              <Ionicons name="cloud-download-outline" size={20} color="#DDF5D2" />
              <Text style={styles.syncButtonText}>
                {syncingCatalog ? 'Atualizando base...' : 'Atualizar base offline'}
              </Text>
            </TouchableOpacity>

            {statusMessage ? <Text style={styles.statusMessage}>{statusMessage}</Text> : null}
          </View>

          <View style={styles.resultsCard}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>Resultados</Text>
              <Text style={styles.resultsCount}>
                {radios.length} registro(s) encontrado(s)
              </Text>
            </View>

            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.tableHeadText, styles.seloColumn]}>SELO</Text>
                <Text style={[styles.tableHeadText, styles.equipamentoColumn]}>
                  EQUIPAMENTO
                </Text>
                <Text style={[styles.tableHeadText, styles.statusColumn]}>STATUS</Text>
                <Text style={[styles.tableHeadText, styles.acaoColumn]}>ACAO</Text>
              </View>

              {radios.map((radio) => (
                <View key={radio.RadioSeloComplemento} style={styles.tableRow}>
                  <Text style={[styles.tableCellText, styles.seloColumn]}>
                    {getSeloCurto(radio)}
                  </Text>
                  <View style={styles.equipamentoColumn}>
                    <Text style={styles.tableCellText} numberOfLines={1}>
                      {getEquipamento(radio)}
                    </Text>
                    <Text style={styles.metaCellText} numberOfLines={1}>
                      Setor: {getSetor(radio) || 'Nao informado'}
                    </Text>
                  </View>
                  <View style={styles.statusColumn}>
                    <View
                      style={[
                        styles.statusPill,
                        radio.ConferenceStatus === 'Conferido' && styles.statusPillDone,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          radio.ConferenceStatus === 'Conferido' &&
                            styles.statusPillTextDone,
                        ]}
                      >
                        {radio.ConferenceStatus}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.acaoColumn}>
                    <TouchableOpacity
                      style={styles.conferirButton}
                      onPress={() => handleConferir(radio)}
                    >
                      <Text style={styles.conferirButtonText}>Conferir</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {radios.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    {loading ? 'Carregando radios...' : 'Nenhum radio encontrado.'}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>
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
  content: {
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 42,
    gap: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(216,238,216,0.18)',
  },
  headerText: {
    flex: 1,
    paddingTop: 4,
    gap: 8,
  },
  title: {
    color: '#F1F8F0',
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '900',
  },
  subtitle: {
    color: '#BED1BF',
    fontSize: 18,
    lineHeight: 27,
    fontWeight: '600',
  },
  filterCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(199,228,198,0.18)',
    padding: 16,
    gap: 14,
    backgroundColor: 'rgba(11,56,27,0.46)',
  },
  fieldLabel: {
    color: '#DDEBDD',
    fontSize: 16,
    fontWeight: '900',
  },
  input: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(220,240,220,0.18)',
    backgroundColor: 'rgba(0,22,10,0.56)',
    paddingHorizontal: 18,
    color: '#F1F8F0',
    fontSize: 17,
    fontWeight: '800',
  },
  quickSetorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickSetorButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(220,240,220,0.18)',
    backgroundColor: 'rgba(0,22,10,0.34)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  quickSetorButtonActive: {
    borderColor: '#76DB48',
    backgroundColor: 'rgba(118,219,72,0.16)',
  },
  quickSetorText: {
    color: '#B9CDBA',
    fontWeight: '900',
  },
  quickSetorTextActive: {
    color: '#C9F59C',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  outlineButton: {
    minHeight: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(220,240,220,0.24)',
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineButtonText: {
    color: '#D7E5D7',
    fontSize: 16,
    fontWeight: '900',
  },
  searchButton: {
    minWidth: 124,
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: '#76DB48',
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  searchButtonText: {
    color: '#082812',
    fontSize: 19,
    fontWeight: '900',
  },
  syncButton: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(118,219,72,0.32)',
    backgroundColor: 'rgba(118,219,72,0.1)',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  syncButtonText: {
    color: '#DDF5D2',
    fontWeight: '900',
  },
  statusMessage: {
    color: '#BED1BF',
    lineHeight: 20,
    fontWeight: '700',
  },
  resultsCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(199,228,198,0.18)',
    padding: 10,
    backgroundColor: 'rgba(11,56,27,0.46)',
    gap: 20,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  resultsTitle: {
    color: '#F1F8F0',
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
  },
  resultsCount: {
    flex: 1,
    color: '#BED1BF',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'right',
  },
  table: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0A3B1C',
  },
  tableHeader: {
    minHeight: 50,
    backgroundColor: '#1D542F',
  },
  tableRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(215,239,214,0.1)',
    paddingHorizontal: 6,
    gap: 4,
  },
  tableHeadText: {
    color: '#D6E7D5',
    fontSize: 10,
    fontWeight: '900',
  },
  tableCellText: {
    color: '#F1F8F0',
    fontSize: 13,
    fontWeight: '900',
  },
  metaCellText: {
    marginTop: 4,
    color: '#A8C3AA',
    fontSize: 10,
    fontWeight: '700',
  },
  seloColumn: {
    width: 54,
  },
  equipamentoColumn: {
    flex: 1,
    minWidth: 56,
  },
  statusColumn: {
    width: 68,
  },
  acaoColumn: {
    width: 58,
    alignItems: 'center',
  },
  statusPill: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(118,219,72,0.46)',
    paddingHorizontal: 5,
    paddingVertical: 6,
    alignItems: 'center',
  },
  statusPillDone: {
    borderColor: 'rgba(221,245,210,0.32)',
    backgroundColor: 'rgba(221,245,210,0.12)',
  },
  statusPillText: {
    color: '#B6E66D',
    fontSize: 9,
    fontWeight: '900',
  },
  statusPillTextDone: {
    color: '#DDF5D2',
  },
  conferirButton: {
    width: 56,
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#3E8F35',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(42,112,38,0.18)',
  },
  conferirButtonText: {
    color: '#B6E66D',
    fontSize: 10,
    fontWeight: '900',
  },
  emptyState: {
    padding: 18,
  },
  emptyText: {
    color: '#BED1BF',
    fontSize: 15,
    fontWeight: '700',
  },
});
