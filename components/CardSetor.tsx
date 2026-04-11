// Card visual usado na home para representar cada setor do app.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

type Props = {
  title: string;
  // O tipo do icone esta aberto porque o pacote Ionicons e tolerante aqui
  // e isso deixa o componente simples de reutilizar na home.
  icon: any;
  onPress?: () => void;
  disabled?: boolean;
};

export default function CardSetor({
  title,
  icon,
  onPress,
  disabled = false,
}: Props) {
  return (
    <TouchableOpacity
      style={[styles.card, disabled && styles.cardDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={disabled ? 1 : 0.2}
    >
      <Ionicons name={icon} size={32} color={disabled ? '#6B7280' : '#1F2937'} />
      <Text style={[styles.text, disabled && styles.textDisabled]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#E5E7EB',
    borderRadius: 16,
    padding: 20,
    width: '48%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardDisabled: {
    opacity: 0.6,
  },
  text: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  textDisabled: {
    color: '#4B5563',
  },
});
