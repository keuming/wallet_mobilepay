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
import { apiFetch, ApiError } from '../src/lib/apiClient';
import { Button, Input, ErrorBanner } from '../src/components/ui';
import StatusModal, { ResultStatus } from '../src/components/StatusModal';
import { colors, spacing, fontSize, radius, shadow } from '../src/theme';

interface VirtualCard {
  id: string;
  brand: 'VISA' | 'MASTERCARD';
  maskedPan: string;
  expiryMonth: number;
  expiryYear: number;
  status: 'ACTIVE' | 'FROZEN' | 'TERMINATED';
  balance: string;
  holderName: string;
  simulated?: boolean;
}

const BRANDS = [
  { id: 'VISA', label: 'Visa', hint: 'Acceptée quasiment partout' },
  { id: 'MASTERCARD', label: 'Mastercard', hint: 'Large couverture internationale' },
] as const;

export default function CarteScreen() {
  const router = useRouter();

  const [cards, setCards] = useState<VirtualCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [brand, setBrand] = useState<'VISA' | 'MASTERCARD'>('VISA');
  const [holderName, setHolderName] = useState('');

  const [loadTarget, setLoadTarget] = useState<VirtualCard | null>(null);
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: ResultStatus; message: string } | null>(null);

  const load = useCallback(async () => {
    setCards(await apiFetch<VirtualCard[]>('/cards/mine'));
  }, []);

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Chargement impossible.'))
      .finally(() => setLoading(false));
  }, [load]);

  const createCard = async () => {
    if (holderName.trim().length < 3) return;
    setCreating(true);
    setError(null);
    try {
      await apiFetch('/cards', {
        method: 'POST',
        body: JSON.stringify({ brand, holderName: holderName.trim().toUpperCase() }),
      });
      setShowCreate(false);
      setHolderName('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Création impossible.");
    } finally {
      setCreating(false);
    }
  };

  const toggleFreeze = async (card: VirtualCard) => {
    setError(null);
    try {
      const action = card.status === 'FROZEN' ? 'unfreeze' : 'freeze';
      await apiFetch(`/cards/${card.id}/${action}`, { method: 'PATCH' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action impossible.");
    }
  };

  const loadCard = async () => {
    if (!loadTarget || !amount || pin.length < 4) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/cards/${loadTarget.id}/load`, {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({ amount: Math.round(Number(amount) * 100), pin }),
      });
      setResult({
        status: 'success',
        message: `${Number(amount).toLocaleString('fr-FR')} FCFA chargés sur ta carte.`,
      });
      setLoadTarget(null);
      setAmount('');
      setPin('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Le chargement a échoué.");
    } finally {
      setSubmitting(false);
    }
  };

  const hasSimulated = cards.some((c) => c.simulated);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>💳 Carte virtuelle</Text>
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
                load().catch(() => null).finally(() => setRefreshing(false));
              }}
            />
          }
        >
          {error && <ErrorBanner message={error} />}

          {/* § Avertissement non négociable : tant qu'aucun émetteur agréé
              n'est branché, ces cartes ne peuvent PAS servir à payer. Laisser
              croire le contraire exposerait l'utilisateur à des refus de
              paiement et nous à une perte de confiance. */}
          {hasSimulated && (
            <View style={styles.warning}>
              <Text style={styles.warningTitle}>⚠️ Mode démonstration</Text>
              <Text style={styles.warningText}>
                Ces cartes sont générées à titre de démonstration : leurs numéros ne
                permettent aucun paiement réel. L'émission de vraies cartes nécessite
                un partenaire bancaire agréé, en cours de mise en place.
              </Text>
            </View>
          )}

          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
          ) : cards.length === 0 ? (
            <Text style={styles.empty}>
              Aucune carte pour l'instant.{'\n'}
              Crée une carte virtuelle pour payer en ligne.
            </Text>
          ) : (
            cards.map((card) => (
              <View key={card.id}>
                <View
                  style={[
                    styles.card,
                    card.status === 'FROZEN' && styles.cardFrozen,
                  ]}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.cardBrand}>{card.brand}</Text>
                    {card.status === 'FROZEN' && (
                      <Text style={styles.frozenTag}>Gelée</Text>
                    )}
                  </View>
                  <Text style={styles.cardPan}>{card.maskedPan}</Text>
                  <View style={styles.cardBottom}>
                    <View>
                      <Text style={styles.cardMeta}>TITULAIRE</Text>
                      <Text style={styles.cardValue}>{card.holderName}</Text>
                    </View>
                    <View>
                      <Text style={styles.cardMeta}>EXPIRE</Text>
                      <Text style={styles.cardValue}>
                        {String(card.expiryMonth).padStart(2, '0')}/
                        {String(card.expiryYear).slice(-2)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardBalance}>
                    Solde : {(Number(card.balance) / 100).toLocaleString('fr-FR')} FCFA
                  </Text>
                </View>

                <View style={styles.cardActions}>
                  <Button
                    onPress={() => {
                      setLoadTarget(card);
                      setAmount('');
                      setPin('');
                    }}
                    style={{ flex: 1 }}
                  >
                    + Recharger
                  </Button>
                  <Button variant="ghost" onPress={() => toggleFreeze(card)} style={{ flex: 1 }}>
                    {card.status === 'FROZEN' ? '🔓 Dégeler' : '🔒 Geler'}
                  </Button>
                </View>
              </View>
            ))
          )}

          {showCreate ? (
            <View style={styles.createBox}>
              <Text style={styles.boxTitle}>Nouvelle carte</Text>
              {BRANDS.map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => setBrand(b.id)}
                  style={[styles.choice, brand === b.id && styles.choiceActive]}
                >
                  <Text style={styles.choiceIcon}>💳</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.choiceLabel}>{b.label}</Text>
                    <Text style={styles.choiceHint}>{b.hint}</Text>
                  </View>
                  {brand === b.id && <Text style={styles.check}>✓</Text>}
                </Pressable>
              ))}
              <Input
                label="Nom du titulaire"
                value={holderName}
                onChangeText={setHolderName}
                placeholder="Tel qu'il apparaîtra sur la carte"
                autoCapitalize="characters"
              />
              <Button onPress={createCard} loading={creating} style={{ alignSelf: 'stretch' }}>
                Créer la carte
              </Button>
              <Button
                variant="ghost"
                onPress={() => setShowCreate(false)}
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
              + Créer une carte virtuelle
            </Button>
          )}

          {loadTarget && (
            <View style={styles.actionBox}>
              <Text style={styles.boxTitle}>Recharger {loadTarget.maskedPan}</Text>
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
                onPress={loadCard}
                loading={submitting}
                disabled={!amount || pin.length < 4}
                style={{ alignSelf: 'stretch' }}
              >
                Confirmer le chargement
              </Button>
              <Button
                variant="ghost"
                onPress={() => setLoadTarget(null)}
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

  warning: {
    backgroundColor: 'rgba(255, 153, 0, 0.12)',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
    marginBottom: spacing.lg,
  },
  warningTitle: { fontWeight: '800', color: colors.warning, fontSize: fontSize.sm },
  warningText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 17,
  },

  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginVertical: spacing.xl,
  },

  card: {
    backgroundColor: colors.navy,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.raised,
  },
  cardFrozen: { opacity: 0.55 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardBrand: { color: '#fff', fontWeight: '900', fontSize: fontSize.lg, letterSpacing: 1 },
  frozenTag: {
    color: colors.warning,
    fontWeight: '800',
    fontSize: fontSize.xs,
  },
  cardPan: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: spacing.lg,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    gap: spacing.lg,
  },
  cardMeta: { color: 'rgba(255,255,255,0.6)', fontSize: 9.5, fontWeight: '700' },
  cardValue: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700', marginTop: 2 },
  cardBalance: {
    color: colors.accent,
    fontSize: fontSize.md,
    fontWeight: '800',
    marginTop: spacing.md,
  },
  cardActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.lg },

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
  boxTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  choiceActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  choiceIcon: { fontSize: 22 },
  choiceLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  choiceHint: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  check: { color: colors.accent, fontSize: fontSize.lg, fontWeight: '800' },
});
