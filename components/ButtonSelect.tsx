// Botão reutilizável de seleção binária/única.
// Ele recebe o estado atual e pinta a opção selecionada sem conhecer regra de negócio.
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

type ButtonSelectProps = {
  label: string;
  value: string;
  state: string;
  setState: (value: string) => void;
};

export default function ButtonSelect({
  label,
  value,
  state,
  setState,
}: ButtonSelectProps) {
  const selected = state === value;

  return (
    <TouchableOpacity
      style={[styles.select, selected && styles.selectActive]}
      onPress={() => setState(value)}
    >
      <Text style={[styles.selectText, selected && styles.selectTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  select: {
    flex: 1,
    backgroundColor: '#F7F8F4',
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D4DBD1',
  },
  selectActive: {
    backgroundColor: '#7AA486',
    borderColor: '#7AA486',
  },
  selectText: {
    color: '#264337',
    fontWeight: '600',
  },
  selectTextActive: {
    color: '#fff',
    fontWeight: '800',
  },
});
