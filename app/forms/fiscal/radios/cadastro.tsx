import { getAuthSession, userHasSectorAccess } from '@/services/auth';
import {
  createRegisteredRadio,
  getRadioRegistrySchema,
  getRegisteredRadioBySelo,
  listRegisteredRadios,
  updateRegisteredRadio,
  type RadioRegistryOwner,
  type RadioRegistryRecord,
  type RadioRegistrySchema,
} from '@/services/radioRegistry';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

function formatFieldLabel(fieldName: string) {
  return fieldName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

function createEmptyRecord(schema: RadioRegistrySchema | null): RadioRegistryRecord {
  if (!schema) {
    return { dimRadios: {}, owners: [{ MatriculaUsuario: '', NomeUsuario: '' }] };
  }

  return {
    dimRadios: Object.fromEntries(schema.dimRadios.map((column) => [column.name, ''])),
    owners: [{ MatriculaUsuario: '', NomeUsuario: '' }],
  };
}

export default function CadastroRadiosScreen() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [schema, setSchema] = useState<RadioRegistrySchema | null>(null);
  const [items, setItems] = useState<
    Array<{
      selo: string;
      modelo: string;
      setor: string;
      situacao: string;
      equipamento: string;
      owners: RadioRegistryOwner[];
    }>
  >([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<RadioRegistryRecord>(createEmptyRecord(null));
  const [editingSelo, setEditingSelo] = useState<string | null>(null);
  const [loadingSchema, setLoadingSchema] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadSchemaAndList = useCallback(
    async (query?: string) => {
      setLoadingSchema(true);
      setLoadingList(true);

      try {
        const [nextSchema, nextItems] = await Promise.all([
          getRadioRegistrySchema(),
          listRegisteredRadios(query),
        ]);

        setSchema(nextSchema);
        setItems(nextItems);
        setForm((currentForm) => {
          if (Object.keys(currentForm.dimRadios).length > 0 || editingSelo) {
            return currentForm;
          }

          return createEmptyRecord(nextSchema);
        });
      } catch (error) {
        Alert.alert(
          'Erro',
          error instanceof Error
            ? error.message
            : 'Nao foi possivel carregar o cadastro de radios.',
        );
      } finally {
        setLoadingSchema(false);
        setLoadingList(false);
      }
    },
    [editingSelo],
  );

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

        if (canAccess) {
          await loadSchemaAndList();
        }
      })();

      return () => {
        active = false;
      };
    }, [loadSchemaAndList]),
  );

  const primaryKey = schema?.primaryKey || 'RadioSeloComplemeno';
  const dimFields = schema?.dimRadios || [];

  const ownersSummary = useMemo(
    () =>
      form.owners
        .filter((owner) => owner.MatriculaUsuario || owner.NomeUsuario)
        .map((owner) => owner.NomeUsuario || owner.MatriculaUsuario)
        .join(', '),
    [form.owners],
  );

  const resetForm = useCallback(() => {
    setEditingSelo(null);
    setForm(createEmptyRecord(schema));
  }, [schema]);

  const handleSearch = useCallback(async () => {
    setLoadingList(true);

    try {
      const nextItems = await listRegisteredRadios(search);
      setItems(nextItems);
    } catch (error) {
      Alert.alert(
        'Erro',
        error instanceof Error ? error.message : 'Nao foi possivel pesquisar os radios.',
      );
    } finally {
      setLoadingList(false);
    }
  }, [search]);

  const handleSelectForEdit = useCallback(async (selo: string) => {
    setLoadingRecord(true);

    try {
      const record = await getRegisteredRadioBySelo(selo);
      setForm({
        dimRadios: record.dimRadios,
        owners:
          record.owners.length > 0
            ? record.owners
            : [{ MatriculaUsuario: '', NomeUsuario: '' }],
      });
      setEditingSelo(selo);
    } catch (error) {
      Alert.alert(
        'Erro',
        error instanceof Error ? error.message : 'Nao foi possivel carregar este radio.',
      );
    } finally {
      setLoadingRecord(false);
    }
  }, []);

  const updateDimField = useCallback((fieldName: string, value: string) => {
    setForm((current) => ({
      ...current,
      dimRadios: {
        ...current.dimRadios,
        [fieldName]: value,
      },
    }));
  }, []);

  const updateOwnerField = useCallback(
    (index: number, fieldName: keyof RadioRegistryOwner, value: string) => {
      setForm((current) => ({
        ...current,
        owners: current.owners.map((owner, ownerIndex) =>
          ownerIndex === index
            ? {
                ...owner,
                [fieldName]: value,
              }
            : owner,
        ),
      }));
    },
    [],
  );

  const addOwner = useCallback(() => {
    setForm((current) => ({
      ...current,
      owners: [...current.owners, { MatriculaUsuario: '', NomeUsuario: '' }],
    }));
  }, []);

  const removeOwner = useCallback((index: number) => {
    setForm((current) => {
      const nextOwners = current.owners.filter((_, ownerIndex) => ownerIndex !== index);

      return {
        ...current,
        owners:
          nextOwners.length > 0
            ? nextOwners
            : [{ MatriculaUsuario: '', NomeUsuario: '' }],
      };
    });
  }, []);

  const handleSave = useCallback(async () => {
    const selo = (form.dimRadios[primaryKey] || '').trim();

    if (!selo) {
      Alert.alert('Campo obrigatorio', `Informe o campo ${formatFieldLabel(primaryKey)}.`);
      return;
    }

    setSaving(true);

    try {
      if (editingSelo) {
        const result = await updateRegisteredRadio(editingSelo, form);
        setEditingSelo(result.selo);
        Alert.alert('Sucesso', 'Cadastro de radio atualizado com sucesso.');
      } else {
        const result = await createRegisteredRadio(form);
        setEditingSelo(result.selo);
        Alert.alert('Sucesso', 'Radio cadastrado com sucesso.');
      }

      const [nextItems, nextRecord] = await Promise.all([
        listRegisteredRadios(search),
        getRegisteredRadioBySelo((form.dimRadios[primaryKey] || '').trim()),
      ]);

      setItems(nextItems);
      setForm({
        dimRadios: nextRecord.dimRadios,
        owners:
          nextRecord.owners.length > 0
            ? nextRecord.owners
            : [{ MatriculaUsuario: '', NomeUsuario: '' }],
      });
    } catch (error) {
      Alert.alert(
        'Erro ao salvar',
        error instanceof Error ? error.message : 'Nao foi possivel salvar o radio.',
      );
    } finally {
      setSaving(false);
    }
  }, [editingSelo, form, primaryKey, search]);

  if (authorized === false) {
    return <Redirect href="/home" />;
  }

  if (authorized === null) {
    return <View style={{ flex: 1, backgroundColor: '#021B13' }} />;
  }

  return (
    <LinearGradient colors={['#F3EEE3', '#E3EBDD']} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={22} color="#163227" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerButton} onPress={resetForm}>
                <Ionicons name="add-outline" size={24} color="#163227" />
              </TouchableOpacity>
            </View>

            <View style={styles.heroCard}>
              <Text style={styles.eyebrow}>Fiscal</Text>
              <Text style={styles.title}>Cadastro de Radios</Text>
              <Text style={styles.helperText}>
                Cadastre e edite todas as informacoes da tabela dimRadios e os donos vinculados
                pela fatoUsuariosRadios.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Radios cadastrados</Text>
              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.input, styles.searchInput]}
                  placeholder="Buscar por selo, modelo ou equipamento"
                  placeholderTextColor="#7A857D"
                  value={search}
                  onChangeText={setSearch}
                />
                <TouchableOpacity style={styles.searchButton} onPress={() => void handleSearch()}>
                  <Ionicons name="search" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              {loadingSchema || loadingList ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator color="#7AA486" />
                  <Text style={styles.loadingText}>Carregando radios...</Text>
                </View>
              ) : items.length === 0 ? (
                <Text style={styles.emptyText}>Nenhum radio encontrado.</Text>
              ) : (
                <View style={styles.listBlock}>
                  {items.map((item) => (
                    <TouchableOpacity
                      key={item.selo}
                      style={styles.radioRow}
                      onPress={() => void handleSelectForEdit(item.selo)}
                    >
                      <View style={styles.radioRowTextWrap}>
                        <Text style={styles.radioRowTitle}>{item.selo}</Text>
                        <Text style={styles.radioRowText}>
                          Modelo: {item.modelo || 'Nao informado'}
                        </Text>
                        <Text style={styles.radioRowText}>
                          Setor: {item.setor || 'Nao informado'}
                        </Text>
                        <Text style={styles.radioRowText}>
                          Donos:{' '}
                          {item.owners.length > 0
                            ? item.owners
                                .map((owner) => owner.NomeUsuario || owner.MatriculaUsuario)
                                .join(', ')
                            : 'Nao informados'}
                        </Text>
                      </View>
                      <Ionicons name="create-outline" size={20} color="#163227" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                {editingSelo ? `Editando ${editingSelo}` : 'Novo cadastro'}
              </Text>

              {loadingRecord ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator color="#7AA486" />
                  <Text style={styles.loadingText}>Carregando dados do radio...</Text>
                </View>
              ) : (
                <>
                  {dimFields.map((field) => (
                    <View key={field.name} style={styles.fieldBlock}>
                      <Text style={styles.label}>
                        {formatFieldLabel(field.name)}
                        {!field.isNullable ? ' *' : ''}
                      </Text>
                      <TextInput
                        style={styles.input}
                        placeholder={`Informe ${formatFieldLabel(field.name)}`}
                        placeholderTextColor="#7A857D"
                        value={form.dimRadios[field.name] || ''}
                        onChangeText={(value) => updateDimField(field.name, value)}
                        autoCapitalize={field.name === primaryKey ? 'characters' : 'sentences'}
                        keyboardType={
                          ['int', 'float', 'decimal', 'numeric', 'real', 'money', 'smallmoney'].includes(
                            field.dataType,
                          )
                            ? 'numeric'
                            : 'default'
                        }
                      />
                    </View>
                  ))}

                  <View style={styles.ownersHeader}>
                    <View>
                      <Text style={styles.sectionTitle}>Donos do radio</Text>
                      <Text style={styles.ownersHint}>
                        Salvos na fatoUsuariosRadios. Informe um ou mais usuarios.
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.addOwnerButton} onPress={addOwner}>
                      <Ionicons name="add" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>

                  {form.owners.map((owner, index) => (
                    <View key={`${index}-${owner.MatriculaUsuario}-${owner.NomeUsuario}`} style={styles.ownerCard}>
                      <View style={styles.ownerHeader}>
                        <Text style={styles.ownerTitle}>Dono {index + 1}</Text>
                        <TouchableOpacity onPress={() => removeOwner(index)}>
                          <Text style={styles.removeText}>Remover</Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.label}>MatriculaUsuario</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Informe a matricula do usuario"
                        placeholderTextColor="#7A857D"
                        value={owner.MatriculaUsuario}
                        onChangeText={(value) =>
                          updateOwnerField(index, 'MatriculaUsuario', value)
                        }
                      />

                      <Text style={styles.label}>NomeUsuario</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Informe o nome do usuario"
                        placeholderTextColor="#7A857D"
                        value={owner.NomeUsuario}
                        onChangeText={(value) => updateOwnerField(index, 'NomeUsuario', value)}
                      />
                    </View>
                  ))}

                  <View style={styles.resumeCard}>
                    <Text style={styles.resumeText}>
                      Selo atual: {form.dimRadios[primaryKey] || 'Nao informado'}
                    </Text>
                    <Text style={styles.resumeText}>
                      Donos: {ownersSummary || 'Nao informados'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
                    onPress={() => void handleSave()}
                    disabled={saving}
                  >
                    <Text style={styles.primaryButtonText}>
                      {saving
                        ? 'Salvando...'
                        : editingSelo
                          ? 'Salvar alteracoes'
                          : 'Cadastrar radio'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
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
  content: {
    padding: 18,
    paddingBottom: 40,
    gap: 16,
  },
  header: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: '#D6DDD4',
  },
  heroCard: {
    backgroundColor: '#163227',
    borderRadius: 28,
    padding: 22,
  },
  eyebrow: {
    color: '#A9D1BA',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  title: {
    marginTop: 8,
    color: '#F8F6EF',
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '800',
  },
  helperText: {
    marginTop: 10,
    color: '#D2DED5',
    lineHeight: 21,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 28,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D6DDD4',
  },
  sectionTitle: {
    color: '#173328',
    fontSize: 18,
    fontWeight: '800',
  },
  searchRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  searchInput: {
    flex: 1,
  },
  searchButton: {
    width: 54,
    borderRadius: 16,
    backgroundColor: '#173328',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingState: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#4E6B5D',
  },
  emptyText: {
    marginTop: 14,
    color: '#64746D',
  },
  listBlock: {
    marginTop: 14,
    gap: 10,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#F7F8F4',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D6DDD4',
    padding: 14,
  },
  radioRowTextWrap: {
    flex: 1,
    gap: 2,
  },
  radioRowTitle: {
    color: '#173328',
    fontWeight: '800',
    fontSize: 15,
  },
  radioRowText: {
    color: '#4E6B5D',
    lineHeight: 18,
  },
  fieldBlock: {
    marginTop: 12,
  },
  label: {
    marginBottom: 8,
    color: '#264337',
    fontWeight: '700',
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
  ownersHeader: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  ownersHint: {
    marginTop: 4,
    color: '#64746D',
  },
  addOwnerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7AA486',
  },
  ownerCard: {
    marginTop: 14,
    backgroundColor: '#F7F8F4',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D6DDD4',
    padding: 14,
  },
  ownerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ownerTitle: {
    color: '#173328',
    fontWeight: '800',
  },
  removeText: {
    color: '#C76B6B',
    fontWeight: '700',
  },
  resumeCard: {
    marginTop: 18,
    borderRadius: 18,
    backgroundColor: '#E9F0E8',
    borderWidth: 1,
    borderColor: '#C6D5C7',
    padding: 14,
    gap: 4,
  },
  resumeText: {
    color: '#264337',
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: '#7AA486',
    paddingVertical: 15,
    borderRadius: 18,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
});
