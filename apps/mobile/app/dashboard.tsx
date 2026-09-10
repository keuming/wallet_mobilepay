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
import MPayIcon from '../src/components/MPayIcon';

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
            <MPayIcon size={26} />
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

        {/* § Services regroupés PAR USAGE et non par produit. Les mettre
            tous sous « Carte virtuelle » était trompeur : cartes cadeaux,
            factures et épargne n'ont rien d'une carte bancaire. On sépare
            donc ce qu'on fait SORTIR de l'argent de ce qu'on MET DE CÔTÉ —
            deux intentions opposées qui ne doivent pas se confondre. */}
        <View style={styles.section}>
          <Text style={styles.groupTitle}>Payer & acheter</Text>
          <View style={styles.tileGrid}>
            <Tile
              icon="💳"
              label="Carte virtuelle"
              hint="Payer en ligne"
              onPress={() => router.push('/carte')}
            />
            <Tile
              icon="🎁"
              label="Cartes cadeaux"
              hint="Offrir, s'offrir"
              onPress={() => router.push('/cartes-cadeaux')}
            />
            <Tile
              icon="🧾"
              label="Factures"
              hint="Électricité, eau"
              onPress={() => router.push('/factures')}
            />
          </View>

          <Text style={[styles.groupTitle, { marginTop: spacing.lg }]}>Mettre de côté</Text>
          <View style={styles.tileGrid}>
            <Tile
              icon="🥇"
              label="Épargne Gold"
              hint="Faire fructifier"
              gold
              onPress={() => router.push('/epargne')}
            />
            <Tile
              icon="🗃️"
              label="Collecte"
              hint="Mes cagnottes"
              onPress={() => router.push('/collecte')}
            />
            <Tile
              icon="📊"
              label="Mes dépenses"
              hint="Suivre mon budget"
              onPress={() => router.push('/releve-depenses')}
            />
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

/** Tuile de service — format carré, trois par ligne. */
function Tile({
  icon,
  label,
  hint,
  gold,
  onPress,
}: {
  icon: string;
  label: string;
  hint: string;
  gold?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, gold && styles.tileGold, pressed && { opacity: 0.85 }]}
    >
      <Text style={styles.tileIcon}>{icon}</Text>
      <Text style={[styles.tileLabel, gold && { color: '#3d2b00' }]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.tileHint, gold && { color: '#6b4e00' }]} numberOfLines={1}>
        {hint}
      </Text>
    </Pressable>
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
  groupTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  tileGrid: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    minWidth: 0,
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  tileGold: { backgroundColor: colors.goldLight, borderColor: colors.gold },
  tileIcon: { fontSize: 26, marginBottom: spacing.xs },
  tileLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  tileHint: {
    fontSize: 10.5,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
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
