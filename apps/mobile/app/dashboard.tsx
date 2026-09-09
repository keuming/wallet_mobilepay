import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/contexts/AuthContext';
import { apiFetch } from '../src/lib/apiClient';
import { colors, spacing, fontSize, radius, shadow } from '../src/theme';
import SideMenu from '../src/components/SideMenu';

interface Wallet {
  cachedBalance: number;
  currency: string;
}

interface LedgerEntry {
  id: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
  description: string;
  createdAt: string;
  transaction: { reference: string; type: string; status: string };
  counterparty: { name: string; phone: string | null } | null;
}

function formatFcfa(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR');
}

/** Actions principales — mêmes destinations que le web. */
const ACTIONS = [
  { icon: '↗️', label: 'Transfert', route: '/envoyer' },
  { icon: '🏪', label: 'Payer', route: '/payer' },
  { icon: '📶', label: 'Crédit/Data', route: '/recharger' },
] as const;

export default function DashboardScreen() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [collecteTotal, setCollecteTotal] = useState(0);
  const [fetching, setFetching] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, history, collecteTypes] = await Promise.all([
        apiFetch<Wallet>('/wallet'),
        apiFetch<{ entries: LedgerEntry[] }>('/wallet/transactions?pageSize=10'),
        apiFetch<{ balance: string }[]>('/collecte/types').catch(() => []),
      ]);
      setWallet(w);
      setEntries(history.entries);
      setCollecteTotal(collecteTypes.reduce((sum, t) => sum + Number(t.balance), 0));
    } finally {
      setFetching(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    load();
  }, [user, loading, load, router]);

  const totalSent = entries.filter((e) => e.type === 'DEBIT').reduce((s, e) => s + e.amount, 0);
  const totalReceived = entries.filter((e) => e.type === 'CREDIT').reduce((s, e) => s + e.amount, 0);

  if (loading || !user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.accent}
          />
        }
      >
        {/* En-tête */}
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={() => setMenuOpen(true)}>
            <Text style={styles.iconBtnText}>☰</Text>
          </Pressable>
          <View style={styles.logoBadge}>
            <View style={styles.logoMark}>
              <Text style={styles.logoMarkText}>📈</Text>
            </View>
            <Text style={styles.logoText}>
              Mobile<Text style={{ color: colors.accent }}>Pay</Text>
            </Text>
          </View>
          <Pressable style={styles.avatar} onPress={() => router.push('/profil')}>
            <Text style={styles.avatarText}>{user.firstName.charAt(0).toUpperCase()}</Text>
          </Pressable>
        </View>

        {/* Carte solde */}
        <View style={styles.balanceCard}>
          <Text style={styles.holder}>
            {user.firstName} {user.lastName}
          </Text>
          <View style={styles.balanceLabelRow}>
            <Text style={styles.balanceLabel}>💳 Solde disponible</Text>
            <Pressable onPress={() => setBalanceHidden((h) => !h)} hitSlop={10}>
              <Text style={styles.eye}>{balanceHidden ? '🙈' : '👁️'}</Text>
            </Pressable>
          </View>
          <Text style={styles.balanceAmount}>
            {balanceHidden ? '••••••' : wallet ? formatFcfa(wallet.cachedBalance) : '—'}
            <Text style={styles.currency}> FCFA</Text>
          </Text>

          <Pressable style={styles.depositBtn} onPress={() => router.push('/recevoir')}>
            <Text style={styles.depositBtnText}>+ Dépôt</Text>
          </Pressable>

          <View style={styles.pillRow}>
            {ACTIONS.map((a) => (
              <Pressable key={a.route} style={styles.pill} onPress={() => router.push(a.route as any)}>
                <Text style={styles.pillText} numberOfLines={1}>
                  {a.icon} {a.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Mini-cartes */}
        <View style={styles.miniRow}>
          <View style={[styles.miniCard, { backgroundColor: colors.accent }]}>
            <Text style={styles.miniIcon}>💸</Text>
            <Text style={[styles.miniLabel, { color: 'rgba(255,255,255,0.75)' }]}>ENVOYÉ</Text>
            <Text style={[styles.miniAmount, { color: '#fff' }]}>{formatFcfa(totalSent)} F</Text>
          </View>
          <View style={styles.miniCard}>
            <Text style={styles.miniIcon}>💰</Text>
            <Text style={styles.miniLabel}>REÇU</Text>
            <Text style={styles.miniAmount}>{formatFcfa(totalReceived)} F</Text>
          </View>
          <Pressable style={styles.miniCard} onPress={() => router.push('/collecte')}>
            <Text style={styles.miniIcon}>🗃️</Text>
            <Text style={styles.miniLabel}>COLLECTE</Text>
            <Text style={styles.miniAmount}>{formatFcfa(collecteTotal)} F</Text>
          </Pressable>
        </View>

        {/* Bannière Carte virtuelle */}
        <View style={styles.promoCard}>
          <View style={styles.promoTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.promoTitle}>Carte virtuelle</Text>
              <Text style={styles.promoSubtitle}>Payer en ligne partout dans le monde</Text>
            </View>
            <Pressable style={styles.promoBtn} onPress={() => router.push('/carte')}>
              <Text style={styles.promoBtnText}>Découvrir</Text>
            </Pressable>
          </View>

          <View style={styles.pillRow}>
            <Pressable style={styles.pillLight} onPress={() => router.push('/cartes-cadeaux')}>
              <Text style={styles.pillLightText} numberOfLines={1}>🎁 Cartes cadeaux</Text>
            </Pressable>
            <Pressable style={styles.pillLight} onPress={() => router.push('/factures')}>
              <Text style={styles.pillLightText} numberOfLines={1}>🧾 Factures</Text>
            </Pressable>
            <Pressable style={styles.pillGold} onPress={() => router.push('/epargne')}>
              <Text style={styles.pillGoldText} numberOfLines={1}>🥇 Épargne Gold</Text>
            </Pressable>
          </View>
        </View>

        {/* Historique */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📋 Transactions récentes</Text>
            <Pressable onPress={() => router.push('/historique')}>
              <Text style={styles.seeAll}>Voir tout →</Text>
            </Pressable>
          </View>

          {fetching ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
          ) : entries.length === 0 ? (
            <Text style={styles.empty}>Aucune transaction pour le moment.</Text>
          ) : (
            entries.map((e) => (
              <View key={e.id} style={styles.txRow}>
                <View style={styles.txIcon}>
                  <Text>{e.type === 'CREDIT' ? '↙️' : '↗️'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txTitle} numberOfLines={1}>
                    {e.counterparty?.name ?? e.description}
                  </Text>
                  <Text style={styles.txDate}>
                    {new Date(e.createdAt).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.txAmount,
                    { color: e.type === 'CREDIT' ? colors.success : colors.textPrimary },
                  ]}
                >
                  {e.type === 'CREDIT' ? '+' : '−'}
                  {formatFcfa(e.amount)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(11,31,18,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 22, fontWeight: '900', color: '#000' },
logoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  logoMark: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMarkText: { fontSize: 13 },
  logoText: { color: '#fff', fontWeight: '800', fontSize: fontSize.lg },

  promoCard: {
    margin: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: '#c8f0da',
  },
  promoTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  promoTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  promoSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  promoBtn: {
    backgroundColor: 'rgba(255,255,255,0.75)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
  },
  promoBtnText: { fontWeight: '700', fontSize: fontSize.sm, color: colors.textPrimary },

  pillLight: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  pillLightText: { fontWeight: '700', fontSize: 11.5, color: colors.textPrimary },
  pillGold: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  pillGoldText: { fontWeight: '700', fontSize: 11.5, color: '#3d2b00' },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  seeAll: { color: colors.accent, fontWeight: '700', fontSize: fontSize.sm },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: fontSize.lg },

  balanceCard: {
    margin: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.accent,
    ...shadow.raised,
  },
  holder: { color: '#000', fontWeight: '700', fontSize: fontSize.sm, marginBottom: spacing.xs },
  balanceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  balanceLabel: { color: 'rgba(255,255,255,0.9)', fontSize: fontSize.sm },
  eye: { fontSize: fontSize.sm },
  balanceAmount: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: spacing.xs },
  currency: { fontSize: fontSize.md, fontWeight: '800' },

  depositBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    backgroundColor: '#fff',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
  },
  depositBtnText: { color: colors.accent, fontWeight: '800', fontSize: fontSize.sm },

  pillRow: { flexDirection: 'row', gap: 6, marginTop: spacing.lg },
  pill: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  miniRow: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.lg },
  miniCard: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniIcon: { fontSize: 16 },
  miniLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 2,
  },
  miniAmount: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginTop: 1 },

  section: { padding: spacing.lg },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  empty: { color: colors.textSecondary, fontSize: fontSize.sm },

  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  txDate: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  txAmount: { fontSize: fontSize.md, fontWeight: '700' },
});
