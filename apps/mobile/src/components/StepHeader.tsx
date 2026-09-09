import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSize } from '../theme';

/**
 * En-tête commun aux parcours multi-étapes (Transfert, Payer, Recharger…).
 * Affiche le titre, l'étape courante et une barre de progression — même
 * logique que la version web.
 */
export default function StepHeader({
  title,
  steps,
  current,
  onBack,
}: {
  title: string;
  steps: string[];
  current: number;
  onBack: () => void;
}) {
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Pressable
          onPress={() => (current === 0 ? router.back() : onBack())}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.stepLabel}>
        Étape {current + 1}/{steps.length} — {steps[current]}
      </Text>

      <View style={styles.progressRow}>
        {steps.map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressBar,
              { backgroundColor: i <= current ? colors.accent : colors.border },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backText: { fontSize: 26, color: colors.textPrimary },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  stepLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  progressRow: { flexDirection: 'row', gap: 4, marginTop: spacing.sm },
  progressBar: { flex: 1, height: 4, borderRadius: 2 },
});
