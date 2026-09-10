import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch } from '../src/lib/apiClient';
import { ErrorBanner } from '../src/components/ui';
import { colors, spacing, fontSize, radius, shadow } from '../src/theme';

interface Category {
  id: string;
  label: string;
  icon: string | null;
}

interface ExpenseItem {
  id: string;
  type: string;
  description: string | null;
  amount: string;
  feeAmount: string;
  createdAt: string;
  category: Category | null;
}

interface Statement {
  items: ExpenseItem[];
  totalAmount: string;
  count: number;
}

const TYPE_LABELS: Record<string, string> = {
  TRANSFER: 'Transfert',
  WITHDRAWAL: 'Envoi externe',
  PAYMENT: 'Paiement',
  AIRTIME: 'Crédit/Data',
  GIFT_CARD: 'Carte cadeau',
  UTILITY: 'Facture',
  CARD_LOAD: 'Chargement carte',
  COLLECTE_LOAD: 'Collecte',
};

/** Périodes proposées — les mêmes qu'en production sur le web. */
const PRESETS = [
  { id: '7', label: '7 jours' },
  { id: '30', label: '30 jours' },
  { id: '90', label: '3 mois' },
] as const;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function ReleveDepensesScreen() {
  const router = useRouter();

  const [preset, setPreset] = useState<string>('30');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Category[]>('/expenses/categories')
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      from: isoDaysAgo(Number(preset)),
      to: new Date().toISOString().slice(0, 10),
    });
    if (categoryId) params.set('categoryId', categoryId);

    apiFetch<Statement>(`/expenses/statement?${params.toString()}`)
      .then(setStatement)
      .catch(() => setError('Impossible de charger le relevé.'))
      .finally(() => setLoading(false));
  }, [preset, categoryId]);

  const total = Number(statement?.totalAmount ?? 0);

  // Répartition par type de charge : c'est ce qui donne du sens au relevé —
  // savoir COMBIEN part où, pas seulement la liste des opérations.
  const byCategory = (statement?.items ?? []).reduce<Record<string, number>>((acc, item) => {
    const key = item.category?.label ?? 'Non catégorisé';
    acc[key] = (acc[key] ?? 0) + Number(item.amount);
    return acc;
  }, {});
  const ranked = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>📊 Mes dépenses</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {error && <ErrorBanner message={error} />}

        <View style={styles.chipRow}>
          {PRESETS.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setPreset(p.id)}
              style={[styles.chip, preset === p.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, preset === p.id && styles.chipTextActive]}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total dépensé</Text>
          <Text style={styles.totalAmount}>
            {(total / 100).toLocaleString('fr-FR')}
            <Text style={styles.currency}> FCFA</Text>
          </Text>
          <Text style={styles.totalCount}>
            {statement?.count ?? 0} opération{(statement?.count ?? 0) > 1 ? 's' : ''}
          </Text>
        </View>

        {categories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
            <Pressable
              onPress={() => setCategoryId(null)}
              style={[styles.chip, !categoryId && styles.chipActive]}
            >
              <Text style={[styles.chipText, !categoryId && styles.chipTextActive]}>Tout</Text>
            </Pressable>
            {categories.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setCategoryId(c.id)}
                style={[styles.chip, categoryId === c.id && styles.chipActive]}
              >
                <Text style={[styles.chipText, categoryId === c.id && styles.chipTextActive]}>
                  {c.icon} {c.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            {ranked.length > 0 && (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Répartition</Text>
                {ranked.map(([label, value]) => {
                  const share = total > 0 ? (value / total) * 100 : 0;
                  return (
                    <View key={label} style={styles.barRow}>
                      <View style={styles.barTop}>
                        <Text style={styles.barLabel} numberOfLines={1}>
                          {label}
                        </Text>
                        <Text style={styles.barValue}>
                          {(value / 100).toLocaleString('fr-FR')} F
                        </Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${share}%` }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Opérations</Text>
              {(statement?.items ?? []).length === 0 ? (
                <Text style={styles.empty}>Aucune dépense sur cette période.</Text>
              ) : (
                statement!.items.map((item) => (
                  <View key={item.id} style={styles.item}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.description || TYPE_LABELS[item.type] || item.type}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {new Date(item.createdAt).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                        })}
                        {item.category ? `  ·  ${item.category.icon} ${item.category.label}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.itemAmount}>
                      {(Number(item.amount) / 100).toLocaleString('fr-FR')}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backText: { fontSize: 26, color: colors.textPrimary },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },

  chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  catRow: { marginBottom: spacing.lg },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary },
  chipTextActive: { color: '#fff' },

  totalCard: {
    backgroundColor: colors.accent,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  totalLabel: { color: 'rgba(255,255,255,0.9)', fontSize: fontSize.sm, fontWeight: '600' },
  totalAmount: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 4 },
  currency: { fontSize: fontSize.md, fontWeight: '800' },
  totalCount: { color: 'rgba(255,255,255,0.85)', fontSize: fontSize.xs, marginTop: 4 },

  block: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  blockTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  empty: { color: colors.textSecondary, fontSize: fontSize.sm, textAlign: 'center' },

  barRow: { marginBottom: spacing.md },
  barTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  barLabel: { flex: 1, fontSize: fontSize.sm, color: colors.textPrimary, fontWeight: '600' },
  barValue: { fontSize: fontSize.sm, fontWeight: '800', color: colors.textPrimary },
  barTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.border,
    marginTop: 5,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 4 },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  itemMeta: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  itemAmount: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
});
