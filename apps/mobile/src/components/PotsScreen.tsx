import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch, ApiError } from '../lib/apiClient';
import { Button, Input, ErrorBanner } from './ui';
import StatusModal, { ResultStatus } from './StatusModal';
import { colors, spacing, fontSize, radius, shadow } from '../theme';

interface Pot {
  id: string;
  label: string;
  icon: string | null;
  balance: string;
}

/**
 * Écran commun aux « pots » d'argent : Collecte et Épargne Gold.
 *
 * § Les deux services partagent exactement la même mécanique — créer des
 * pots nommés, y déposer, en retirer — seuls le vocabulaire, la couleur et
 * les endpoints changent. Un écran paramétrable évite de maintenir deux
 * copies qui divergeraient à la première évolution.
 */
export default function PotsScreen({
  title,
  basePath,
  accent,
  emptyHint,
  createLabel,
}: {
  title: string;
  /** Racine des endpoints : "/collecte/types" ou "/savings/types". */
  basePath: string;
  accent: string;
  emptyHint: string;
  createLabel: string;
}) {
  const router = useRouter();

  const [pots, setPots] = useState<Pot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [action, setAction] = useState<{ pot: Pot; kind: 'deposit' | 'withdraw' } | null>(null);
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: ResultStatus; message: string } | null>(null);

  const load = useCallback(async () => {
    const list = await apiFetch<Pot[]>(basePath);
    setPots(list);
  }, [basePath]);

  useEffect(() => {
    load()
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Chargement impossible.'),
      )
      .finally(() => setLoading(false));
  }, [load]);

  const total = pots.reduce((sum, p) => sum + Number(p.balance), 0);

  const create = async () => {
    if (newLabel.trim().length < 2) return;
    setCreating(true);
    setError(null);
    try {
      await apiFetch(basePath, {
        method: 'POST',
        body: JSON.stringify({ label: newLabel.trim() }),
      });
      setNewLabel('');
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible.');
    } finally {
      setCreating(false);
    }
  };

  const submitAction = async () => {
    if (!action || !amount || pin.length < 4) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`${basePath}/${action.pot.id}/${action.kind}`, {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({ amount: Math.round(Number(amount) * 100), pin }),
      });
      const verb = action.kind === 'deposit' ? 'déposés dans' : 'retirés de';
      setResult({
        status: 'success',
        message: `${Number(amount).toLocaleString('fr-FR')} FCFA ${verb} « ${action.pot.label} ».`,
      });
      setAction(null);
      setAmount('');
      setPin('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "L'opération a échoué.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.accent}
              onRefresh={() => {
                setRefreshing(true);
                load()
                  .catch(() => null)
                  .finally(() => setRefreshing(false));
              }}
            />
          }
        >
          {error && <ErrorBanner message={error} />}

          <View style={[styles.totalCard, { backgroundColor: accent }]}>
            <Text style={styles.totalLabel}>Total mis de côté</Text>
            <Text style={styles.totalAmount}>
              {(total / 100).toLocaleString('fr-FR')}
              <Text style={styles.currency}> FCFA</Text>
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
          ) : pots.length === 0 ? (
            <Text style={styles.empty}>{emptyHint}</Text>
          ) : (
            pots.map((pot) => (
              <View key={pot.id} style={styles.potCard}>
                <View style={styles.potTop}>
                  <Text style={styles.potIcon}>{pot.icon ?? '🗃️'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.potLabel}>{pot.label}</Text>
                    <Text style={styles.potBalance}>
                      {(Number(pot.balance) / 100).toLocaleString('fr-FR')} FCFA
                    </Text>
                  </View>
                </View>
                <View style={styles.potActions}>
                  <Button
                    onPress={() => {
                      setAction({ pot, kind: 'deposit' });
                      setAmount('');
                      setPin('');
                    }}
                    style={{ flex: 1 }}
                  >
                    + Déposer
                  </Button>
                  <Button
                    variant="ghost"
                    onPress={() => {
                      setAction({ pot, kind: 'withdraw' });
                      setAmount('');
                      setPin('');
                    }}
                    style={{ flex: 1 }}
                  >
                    − Retirer
                  </Button>
                </View>
              </View>
            ))
          )}

          {showCreate ? (
            <View style={styles.createBox}>
              <Input
                label="Nom du pot"
                value={newLabel}
                onChangeText={setNewLabel}
                placeholder="Ex : Scolarité, Voyage, Loyer"
                autoFocus
              />
              <Button onPress={create} loading={creating} style={{ alignSelf: 'stretch' }}>
                Créer
              </Button>
              <Button
                variant="ghost"
                onPress={() => {
                  setShowCreate(false);
                  setNewLabel('');
                }}
                style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
              >
                Annuler
              </Button>
            </View>
          ) : (
            <Button
              variant="ghost"
              onPress={() => setShowCreate(true)}
              style={{ alignSelf: 'stretch', marginTop: spacing.lg }}
            >
              {createLabel}
            </Button>
          )}

          {/* Formulaire de dépôt/retrait, affiché sous le pot concerné. */}
          {action && (
            <View style={styles.actionBox}>
              <Text style={styles.actionTitle}>
                {action.kind === 'deposit' ? 'Déposer dans' : 'Retirer de'} « {action.pot.label} »
              </Text>
              <Input
                label="Montant (FCFA)"
                value={amount}
                onChangeText={(v) => setAmount(v.replace(/\D/g, ''))}
                placeholder="0"
                keyboardType="number-pad"
                autoFocus
              />
              <Input
                label="Code secret"
                value={pin}
                onChangeText={(v) => setPin(v.replace(/\D/g, ''))}
                placeholder="••••"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
              />
              <Button
                onPress={submitAction}
                loading={submitting}
                disabled={!amount || pin.length < 4}
                style={{ alignSelf: 'stretch' }}
              >
                Confirmer
              </Button>
              <Button
                variant="ghost"
                onPress={() => setAction(null)}
                style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
              >
                Annuler
              </Button>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {result && (
        <StatusModal
          status={result.status}
          message={result.message}
          onClose={() => setResult(null)}
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
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },

  totalCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  totalLabel: { color: 'rgba(255,255,255,0.9)', fontSize: fontSize.sm, fontWeight: '600' },
  totalAmount: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 4 },
  currency: { fontSize: fontSize.md, fontWeight: '800' },

  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginVertical: spacing.xl,
  },

  potCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  potTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  potIcon: { fontSize: 28 },
  potLabel: { fontSize: fontSize.md, fontWeight: '800', color: colors.textPrimary },
  potBalance: { fontSize: fontSize.lg, fontWeight: '800', color: colors.accentDark, marginTop: 2 },
  potActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },

  createBox: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBox: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  actionTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
});
