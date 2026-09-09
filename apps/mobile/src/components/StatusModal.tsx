import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { colors, spacing, fontSize, radius } from '../theme';
import { Button } from './ui';

export type ResultStatus = 'success' | 'failed' | 'pending' | 'unknown';

const CONFIG: Record<ResultStatus, { icon: string; title: string; color: string }> = {
  success: { icon: '✅', title: 'Succès 🎉', color: colors.accent },
  failed: { icon: '❌', title: "Ça n'a pas fonctionné", color: colors.error },
  pending: { icon: '⏳', title: 'Opération en attente', color: colors.pending },
  unknown: { icon: '⚠️', title: 'Statut inconnu', color: colors.warning },
};

/**
 * Modal de résultat commun à tous les parcours financiers.
 *
 * Les 4 états sont distincts et volontaires : "pending" (l'opérateur n'a pas
 * encore confirmé) ne doit jamais être présenté comme un échec, et "unknown"
 * (aucune réponse exploitable) encore moins — l'argent peut très bien être
 * parti.
 */
export default function StatusModal({
  status,
  message,
  onClose,
}: {
  status: ResultStatus;
  message: string;
  onClose: () => void;
}) {
  const cfg = CONFIG[status];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.icon}>{cfg.icon}</Text>
          <Text style={[styles.title, { color: cfg.color }]}>{cfg.title}</Text>
          <Text style={styles.message}>{message}</Text>
          <Button onPress={onClose} style={{ marginTop: spacing.lg, alignSelf: 'stretch' }}>
            Fermer
          </Button>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,45,82,0.45)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  icon: { fontSize: 48, marginBottom: spacing.sm },
  title: { fontSize: fontSize.xl, fontWeight: '800', textAlign: 'center' },
  message: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 21,
  },
});
