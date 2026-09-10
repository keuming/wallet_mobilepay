import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch } from '../src/lib/apiClient';
import { colors, spacing, fontSize, radius } from '../src/theme';

interface LedgerEntry {
  id: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
  description: string;
  createdAt: string;
  transaction: { reference: string; type: string; status: string };
  counterparty: { name: string; phone: string | null } | null;
}

const PAGE_SIZE = 20;

const FILTERS = [
  { id: 'ALL', label: 'Tout' },
  { id: 'CREDIT', label: 'Reçu' },
  { id: 'DEBIT', label: 'Envoyé' },
] as const;

function fcfa(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR');
}

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  SUCCESS: { label: 'Réussi', color: colors.success },
  FAILED: { label: 'Échoué', color: colors.error },
  PENDING: { label: 'En cours', color: colors.pending },
  PROCESSING: { label: 'En cours', color: colors.pending },
  INITIATED: { label: 'En cours', color: colors.pending },
  CANCELLED: { label: 'Annulé', color: colors.textSecondary },
  EXPIRED: { label: 'Expiré', color: colors.textSecondary },
};

export default function HistoriqueScreen() {
  const router = useRouter();

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('ALL');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (targetPage: number, replace: boolean) => {
      const params = new URLSearchParams({
        page: String(targetPage + 1),
        pageSize: String(PAGE_SIZE),
      });
      if (filter !== 'ALL') params.set('type', filter);

      const res = await apiFetch<{ entries: LedgerEntry[]; total: number }>(
        `/wallet/transactions?${params}`,
      );
      setTotal(res.total);
      setEntries((prev) => (replace ? res.entries : [...prev, ...res.entries]));
    },
    [filter],
  );

  useEffect(() => {
    setLoading(true);
    setPage(0);
    load(0, true)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [filter, load]);

  // Chargement progressif : sur mobile, une pagination à boutons est pénible.
  // On charge la suite quand l'utilisateur approche du bas de la liste.
  const loadMore = () => {
    if (loadingMore || loading || entries.length >= total) return;
    setLoadingMore(true);
    const next = page + 1;
    load(next, false)
      .then(() => setPage(next))
      .catch(() => null)
      .finally(() => setLoadingMore(false));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>📋 Historique</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setFilter(f.id)}
            style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.accent}
              onRefresh={() => {
                setRefreshing(true);
                setPage(0);
                load(0, true)
                  .catch(() => null)
                  .finally(() => setRefreshing(false));
              }}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>Aucune transaction pour le moment.</Text>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.lg }} />
            ) : null
          }
          renderItem={({ item }) => {
            const status = STATUS_STYLE[item.transaction.status] ?? {
              label: item.transaction.status,
              color: colors.textSecondary,
            };
            const isCredit = item.type === 'CREDIT';
            return (
              <View style={styles.row}>
                <View style={styles.icon}>
                  <Text>{isCredit ? '↙️' : '↗️'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.counterparty?.name ?? item.description}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {new Date(item.createdAt).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {'  ·  '}
                    <Text style={{ color: status.color, fontWeight: '700' }}>{status.label}</Text>
                  </Text>
                </View>
                <Text
                  style={[
                    styles.amount,
                    { color: isCredit ? colors.success : colors.textPrimary },
                  ]}
                >
                  {isCredit ? '+' : '−'}
                  {fcfa(item.amount)}
                </Text>
              </View>
            );
          }}
        />
      )}
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

  filterRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary },
  filterTextActive: { color: '#fff' },

  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  rowMeta: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  amount: { fontSize: fontSize.md, fontWeight: '700' },
});
