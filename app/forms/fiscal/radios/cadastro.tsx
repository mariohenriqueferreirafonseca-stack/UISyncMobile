import { getAuthSession, userHasSectorAccess } from '@/services/auth';
import {
  createRegisteredRadio,
  deleteRegisteredRadio,
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
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

function normalizeFieldName(fieldName: string) {
  return fieldName.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

const RADIO_REGISTRY_FIELD_LABELS: Record<string, string> = {
  RADIOSELOCOMPLEMENO: 'Selo do Rádio',
  RADIOSELOCOMPLEMENTO: 'Selo do Rádio',
  RADIOSETOR: 'Setor do Rádio',
  RADIOSITUACAO: 'Situacao do Rádio',
  EQUIPAMENTO: 'Tipo do Equipamento',
  RADIOEQUIPAMENTO: 'Equipamento',
  RADIOEQUIPAMENTOMODELO: 'Modelo do Rádio',
  RADIOMODELO: 'Modelo do Rádio',
  RADIOINICIOLOCACAO: 'Inicio da Locacao',
  RADIOFIMLOCACAO: 'Fim da Locacao',
  RADIOPATRIMONIO: 'Patrimonio',
  RADIOOBSERVACAO: 'Observacao',
  MATRICULAUSUARIO: 'Matricula do Usuario',
  NOMEUSUARIO: 'Nome do Usuario',
};

function formatFieldLabel(fieldName: string) {
  const normalizedFieldName = normalizeFieldName(fieldName);
  const customLabel = RADIO_REGISTRY_FIELD_LABELS[normalizedFieldName];

  if (customLabel) {
    return customLabel;
  }

  return fieldName
    .replace(/^Radio/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

function isNumericRegistryField(dataType: string) {
  return ['int', 'float', 'decimal', 'numeric', 'real', 'money', 'smallmoney'].includes(
    String(dataType).toLowerCase(),
  );
}

function isDateRegistryField(field: { name: string; dataType: string }) {
  const normalizedDataType = String(field.dataType).toLowerCase();
  const normalizedFieldName = normalizeFieldName(field.name);

  if (
    ['date', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset'].includes(
      normalizedDataType,
    )
  ) {
    return true;
  }

  return normalizedFieldName.includes('INICIOLOCACAO');
}

function normalizeDateValue(value: string) {
  const sanitized = String(value || '').trim();

  if (!sanitized) {
    return '';
  }

  const yearFirstMatch = sanitized.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (yearFirstMatch) {
    const [, year, month, day] = yearFirstMatch;
    return `${day}-${month}-${year}`;
  }

  const dayFirstMatch = sanitized.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);

  if (dayFirstMatch) {
    const [, day, month, year] = dayFirstMatch;
    return `${day}-${month}-${year}`;
  }

  const digits = sanitized.replace(/\D/g, '').slice(0, 8);

  if (!digits) {
    return '';
  }

  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  return [day, month, year].filter(Boolean).join('-');
}

type OwnerFormItem = RadioRegistryOwner & {
  rowKey: string;
};

type RadioRegistryFormState = Omit<RadioRegistryRecord, 'owners'> & {
  owners: OwnerFormItem[];
};

function createOwnerFormItem(owner?: Partial<RadioRegistryOwner>): OwnerFormItem {
  return {
    rowKey: `owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    MatriculaUsuario: owner?.MatriculaUsuario || '',
    NomeUsuario: owner?.NomeUsuario || '',
  };
}

function createEmptyRecord(schema: RadioRegistrySchema | null): RadioRegistryFormState {
  if (!schema) {
    return { dimRadios: {}, owners: [createOwnerFormItem()] };
  }

  return {
    dimRadios: Object.fromEntries(schema.dimRadios.map((column) => [column.name, ''])),
    owners: [createOwnerFormItem()],
  };
}

function normalizeRecordForForm(
  schema: RadioRegistrySchema | null,
  record: RadioRegistryRecord,
): RadioRegistryFormState {
  if (!schema) {
    return {
      ...record,
      owners:
        record.owners.length > 0
          ? record.owners.map((owner) => createOwnerFormItem(owner))
          : [createOwnerFormItem()],
    };
  }

  return {
    ...record,
    dimRadios: Object.fromEntries(
      Object.entries(record.dimRadios).map(([fieldName, fieldValue]) => {
        const field = schema.dimRadios.find((item) => item.name === fieldName);

        if (field && isDateRegistryField(field)) {
          return [fieldName, normalizeDateValue(fieldValue)];
        }

        return [fieldName, fieldValue];
      }),
    ),
    owners:
      record.owners.length > 0
        ? record.owners.map((owner) => createOwnerFormItem(owner))
        : [createOwnerFormItem()],
  };
}

export default function CadastroRadiosScreen() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [schema, setSchema] = useState<RadioRegistrySchema | null>(null);
  const [items, setItems] = useState<
    {
      selo: string;
      modelo: string;
      setor: string;
      situacao: string;
      equipamento: string;
      owners: RadioRegistryOwner[];
    }[]
  >([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<RadioRegistryFormState>(createEmptyRecord(null));
  const [editingSelo, setEditingSelo] = useState<string | null>(null);
  const [loadingSchema, setLoadingSchema] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeSelectFieldName, setActiveSelectFieldName] = useState<string | null>(null);
  const [deletePasswordVisible, setDeletePasswordVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  const loadSchemaAndList = useCallback(
    async (query?: string) => {
      setLoadingSchema(true);
      setLoadingList(Boolean(query?.trim()));

      try {
        const trimmedQuery = query?.trim();
        const nextSchema = await getRadioRegistrySchema();
        const nextItems = trimmedQuery ? await listRegisteredRadios(trimmedQuery) : [];

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
  const fieldOptions = schema?.fieldOptions || {};
  const activeSelectField =
    dimFields.find((field) => field.name === activeSelectFieldName) || null;
  const activeSelectOptions = activeSelectFieldName ? fieldOptions[activeSelectFieldName] || [] : [];

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
    setActiveSelectFieldName(null);
    setDeletePasswordVisible(false);
    setDeletePassword('');
    setForm(createEmptyRecord(schema));
  }, [schema]);

  const handleSearch = useCallback(async () => {
    const trimmedSearch = search.trim();

    if (!trimmedSearch) {
      setItems([]);
      return;
    }

    setLoadingList(true);

    try {
      const nextItems = await listRegisteredRadios(trimmedSearch);
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
      setForm(
        normalizeRecordForForm(schema, {
          dimRadios: record.dimRadios,
          owners:
            record.owners.length > 0
              ? record.owners
              : [createOwnerFormItem()],
        }),
      );
      setEditingSelo(selo);
    } catch (error) {
      Alert.alert(
        'Erro',
        error instanceof Error ? error.message : 'Nao foi possivel carregar este radio.',
      );
    } finally {
      setLoadingRecord(false);
    }
  }, [schema]);

  const updateDimField = useCallback((fieldName: string, value: string) => {
    setForm((current) => ({
      ...current,
      dimRadios: {
        ...current.dimRadios,
        [fieldName]: value,
      },
    }));
  }, []);

  const handleOpenSelectField = useCallback((fieldName: string) => {
    setActiveSelectFieldName(fieldName);
  }, []);

  const handleCloseSelectField = useCallback(() => {
    setActiveSelectFieldName(null);
  }, []);

  const handleSelectFieldOption = useCallback(
    (fieldName: string, value: string) => {
      updateDimField(fieldName, value);
      setActiveSelectFieldName(null);
    },
    [updateDimField],
  );

  const handleOpenDeleteModal = useCallback(() => {
    setDeletePassword('');
    setDeletePasswordVisible(true);
  }, []);

  const handleCloseDeleteModal = useCallback(() => {
    if (deleting) {
      return;
    }

    setDeletePasswordVisible(false);
    setDeletePassword('');
  }, [deleting]);

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
      owners: [...current.owners, createOwnerFormItem()],
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
            : [createOwnerFormItem()],
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
      const payload: RadioRegistryRecord = {
        dimRadios: form.dimRadios,
        owners: form.owners.map(({ MatriculaUsuario, NomeUsuario }) => ({
          MatriculaUsuario,
          NomeUsuario,
        })),
      };

      if (editingSelo) {
        const result = await updateRegisteredRadio(editingSelo, payload);
        setEditingSelo(result.selo);
        Alert.alert('Sucesso', 'Cadastro de radio atualizado com sucesso.');
      } else {
        const result = await createRegisteredRadio(payload);
        setEditingSelo(result.selo);
        Alert.alert('Sucesso', 'Radio cadastrado com sucesso.');
      }

      const [nextItems, nextRecord] = await Promise.all([
        search.trim() ? listRegisteredRadios(search.trim()) : Promise.resolve([]),
        getRegisteredRadioBySelo((form.dimRadios[primaryKey] || '').trim()),
      ]);

      setItems(nextItems);
      setForm(
        normalizeRecordForForm(schema, {
          dimRadios: nextRecord.dimRadios,
          owners:
            nextRecord.owners.length > 0
              ? nextRecord.owners
              : [createOwnerFormItem()],
        }),
      );
    } catch (error) {
      Alert.alert(
        'Erro ao salvar',
        error instanceof Error ? error.message : 'Nao foi possivel salvar o radio.',
      );
    } finally {
      setSaving(false);
    }
  }, [editingSelo, form, primaryKey, schema, search]);

  const handleDelete = useCallback(async () => {
    if (!editingSelo) {
      return;
    }

    if (!deletePassword.trim()) {
      Alert.alert('Senha obrigatoria', 'Informe a senha para excluir o cadastro.');
      return;
    }

    setDeleting(true);

    try {
      await deleteRegisteredRadio(editingSelo, deletePassword.trim());

      const nextItems = search.trim()
        ? await listRegisteredRadios(search.trim())
        : [];

      setItems(nextItems);
      setDeletePasswordVisible(false);
      setDeletePassword('');
      setEditingSelo(null);
      setForm(createEmptyRecord(schema));

      Alert.alert('Sucesso', 'Cadastro de radio excluido com sucesso.');
    } catch (error) {
      Alert.alert(
        'Erro ao excluir',
        error instanceof Error ? error.message : 'Nao foi possivel excluir o radio.',
      );
    } finally {
      setDeleting(false);
    }
  }, [deletePassword, editingSelo, schema, search]);

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
                  onChangeText={(value) => {
                    setSearch(value);

                    if (!value.trim()) {
                      setItems([]);
                    }
                  }}
                  onSubmitEditing={() => void handleSearch()}
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
              ) : !search.trim() ? (
                <Text style={styles.emptyText}>
                  Digite um selo, modelo ou equipamento para pesquisar os radios.
                </Text>
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
                      {(fieldOptions[field.name] || []).length > 0 ? (
                        <TouchableOpacity
                          style={[styles.input, styles.selectInput]}
                          onPress={() => handleOpenSelectField(field.name)}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={[
                              styles.selectInputText,
                              !form.dimRadios[field.name] && styles.selectPlaceholderText,
                            ]}
                          >
                            {form.dimRadios[field.name] ||
                              `Selecione ${formatFieldLabel(field.name)}`}
                          </Text>
                          <Ionicons name="chevron-down" size={20} color="#4E6B5D" />
                        </TouchableOpacity>
                      ) : (
                        <>
                          <TextInput
                            style={styles.input}
                            placeholder={
                              isDateRegistryField(field)
                                ? 'DD-MM-YYYY'
                                : `Informe ${formatFieldLabel(field.name)}`
                            }
                            placeholderTextColor="#7A857D"
                            value={
                              isDateRegistryField(field)
                                ? normalizeDateValue(form.dimRadios[field.name] || '')
                                : form.dimRadios[field.name] || ''
                            }
                            onChangeText={(value) =>
                              updateDimField(
                                field.name,
                                isDateRegistryField(field) ? normalizeDateValue(value) : value,
                              )
                            }
                            autoCapitalize={
                              field.name === primaryKey || isDateRegistryField(field)
                                ? 'characters'
                                : 'sentences'
                            }
                            keyboardType={
                              isDateRegistryField(field)
                                ? Platform.OS === 'ios'
                                  ? 'numbers-and-punctuation'
                                  : 'default'
                                : isNumericRegistryField(field.dataType)
                                  ? 'numeric'
                                  : 'default'
                            }
                            maxLength={isDateRegistryField(field) ? 10 : undefined}
                          />

                          {isDateRegistryField(field) ? (
                            <Text style={styles.fieldHint}>Formato: DD-MM-YYYY</Text>
                          ) : null}
                        </>
                      )}
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
                    <View key={owner.rowKey} style={styles.ownerCard}>
                      <View style={styles.ownerHeader}>
                        <Text style={styles.ownerTitle}>Dono {index + 1}</Text>
                        <TouchableOpacity onPress={() => removeOwner(index)}>
                          <Text style={styles.removeText}>Remover</Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.label}>{formatFieldLabel('MatriculaUsuario')}</Text>
                      <TextInput
                        style={styles.input}
                        placeholder={`Informe ${formatFieldLabel('MatriculaUsuario').toLowerCase()}`}
                        placeholderTextColor="#7A857D"
                        value={owner.MatriculaUsuario}
                        onChangeText={(value) =>
                          updateOwnerField(index, 'MatriculaUsuario', value)
                        }
                      />

                      <Text style={styles.label}>{formatFieldLabel('NomeUsuario')}</Text>
                      <TextInput
                        style={styles.input}
                        placeholder={`Informe ${formatFieldLabel('NomeUsuario').toLowerCase()}`}
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

                  {editingSelo ? (
                    <TouchableOpacity
                      style={[styles.deleteButton, deleting && styles.primaryButtonDisabled]}
                      onPress={handleOpenDeleteModal}
                      disabled={deleting}
                    >
                      <Text style={styles.deleteButtonText}>Excluir cadastro</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal
        visible={Boolean(activeSelectField)}
        transparent
        animationType="fade"
        onRequestClose={handleCloseSelectField}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {activeSelectField
                ? formatFieldLabel(activeSelectField.name)
                : 'Selecionar opcao'}
            </Text>
            <Text style={styles.modalSubtitle}>
              Escolha uma opcao carregada da base atual do servidor.
            </Text>

            <ScrollView
              style={styles.modalList}
              contentContainerStyle={styles.modalListContent}
              keyboardShouldPersistTaps="handled"
            >
              {activeSelectField?.isNullable ? (
                <TouchableOpacity
                  style={styles.modalOption}
                  onPress={() =>
                    handleSelectFieldOption(activeSelectField.name, '')
                  }
                >
                  <Text style={styles.modalOptionText}>Limpar selecao</Text>
                </TouchableOpacity>
              ) : null}

              {activeSelectOptions.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.modalOption,
                    form.dimRadios[activeSelectField?.name || ''] === option &&
                      styles.modalOptionSelected,
                  ]}
                  onPress={() =>
                    activeSelectField
                      ? handleSelectFieldOption(activeSelectField.name, option)
                      : undefined
                  }
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      form.dimRadios[activeSelectField?.name || ''] === option &&
                        styles.modalOptionTextSelected,
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.modalCloseButton} onPress={handleCloseSelectField}>
              <Text style={styles.modalCloseButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={deletePasswordVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseDeleteModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Excluir cadastro</Text>
            <Text style={styles.modalSubtitle}>
              Digite a senha para excluir o radio selecionado. Essa acao remove o cadastro e os
              donos vinculados.
            </Text>

            <Text style={[styles.label, styles.deletePasswordLabel]}>Senha</Text>
            <TextInput
              style={styles.input}
              placeholder="Informe a senha"
              placeholderTextColor="#7A857D"
              value={deletePassword}
              onChangeText={setDeletePassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!deleting}
            />

            <View style={styles.deleteActionRow}>
              <TouchableOpacity
                style={[styles.modalCloseButton, styles.deleteCancelButton]}
                onPress={handleCloseDeleteModal}
                disabled={deleting}
              >
                <Text style={styles.modalCloseButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.deleteConfirmButton, deleting && styles.primaryButtonDisabled]}
                onPress={() => void handleDelete()}
                disabled={deleting}
              >
                <Text style={styles.deleteConfirmButtonText}>
                  {deleting ? 'Excluindo...' : 'Excluir'}
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
  selectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectInputText: {
    flex: 1,
    color: '#1F2F27',
  },
  selectPlaceholderText: {
    color: '#7A857D',
  },
  fieldHint: {
    marginTop: 6,
    color: '#64746D',
    fontSize: 12,
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
  deleteButton: {
    marginTop: 12,
    backgroundColor: '#FBE7E4',
    borderWidth: 1,
    borderColor: '#E4B6AF',
    paddingVertical: 15,
    borderRadius: 18,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#8F2D24',
    fontWeight: '800',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(6, 21, 15, 0.42)',
    padding: 22,
    justifyContent: 'center',
  },
  modalCard: {
    maxHeight: '78%',
    backgroundColor: '#F8FAF4',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#D6DDD4',
    padding: 18,
  },
  modalTitle: {
    color: '#173328',
    fontSize: 20,
    fontWeight: '800',
  },
  modalSubtitle: {
    marginTop: 6,
    color: '#64746D',
    lineHeight: 20,
  },
  modalList: {
    marginTop: 16,
  },
  modalListContent: {
    gap: 10,
    paddingBottom: 6,
  },
  modalOption: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D6DDD4',
    backgroundColor: '#F1F5EE',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalOptionSelected: {
    backgroundColor: '#173328',
    borderColor: '#173328',
  },
  modalOptionText: {
    color: '#264337',
    fontWeight: '600',
  },
  modalOptionTextSelected: {
    color: '#FFFFFF',
  },
  modalCloseButton: {
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#E7EEE3',
    paddingVertical: 14,
  },
  modalCloseButtonText: {
    color: '#173328',
    fontWeight: '800',
  },
  deletePasswordLabel: {
    marginTop: 16,
  },
  deleteActionRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 12,
  },
  deleteCancelButton: {
    flex: 1,
    marginTop: 0,
  },
  deleteConfirmButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#8F2D24',
    paddingVertical: 14,
  },
  deleteConfirmButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
