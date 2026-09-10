import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch, ApiError } from '../src/lib/apiClient';
import { Button, Input, ErrorBanner } from '../src/components/ui';
import StepHeader from '../src/components/StepHeader';
import StatusModal, { ResultStatus } from '../src/components/StatusModal';
import CountryPicker from '../src/components/CountryPicker';
import { WORLD_COUNTRIES } from '../src/lib/worldCountries';
import { resolveDefaultCountry } from '../src/lib/deviceCountry';
import { useAuth } from '../src/contexts/AuthContext';
import { colors, spacing, fontSize, radius } from '../src/theme';

type BillType =
  | 'ELECTRICITY_BILL_PAYMENT'
  | 'WATER_BILL_PAYMENT'
  | 'TV_BILL_PAYMENT'
  | 'INTERNET_BILL_PAYMENT';

const BILL_TYPES: { id: BillType; label: string; icon: string; hint: string }[] = [
  { id: 'ELECTRICITY_BILL_PAYMENT', label: 'Électricité', icon: '⚡', hint: 'CIE, compteurs' },
  { id: 'WATER_BILL_PAYMENT', label: 'Eau', icon: '💧', hint: 'SODECI et autres' },
  { id: 'TV_BILL_PAYMENT', label: 'TV', icon: '📺', hint: 'Canal+, décodeurs' },
  { id: 'INTERNET_BILL_PAYMENT', label: 'Internet', icon: '🌐', hint: 'Abonnements' },
];

interface Biller {
  id: number;
  name: string;
  type: BillType;
  localTransactionCurrencyCode: string;
  minLocalTransactionAmount: number | null;
  maxLocalTransactionAmount: number | null;
}

const STEPS = ['Pays', 'Type', 'Fournisseur', 'Compte', 'Montant', 'Code secret'];

export default function FacturesScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [country, setCountry] = useState(() => resolveDefaultCountry(user?.country));
  const [countryTouched, setCountryTouched] = useState(false);
  const [billType, setBillType] = useState<BillType | null>(null);
  const [billers, setBillers] = useState<Biller[]>([]);
  const [loadingBillers, setLoadingBillers] = useState(false);
  const [biller, setBiller] = useState<Biller | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: ResultStatus; message: string } | null>(null);

  useEffect(() => {
    if (countryTouched || !user?.country) return;
    setCountry(resolveDefaultCountry(user.country));
  }, [user?.country, countryTouched]);

  // Les fournisseurs dépendent du pays ET du type : la CIE n'existe qu'en
  // Côte d'Ivoire, et pas dans la catégorie « TV ».
  useEffect(() => {
    if (step !== 2 || !billType) return;
    setLoadingBillers(true);
    setError(null);
    apiFetch<Biller[]>(`/utility-payments/billers?country=${country}&type=${billType}`)
      .then(setBillers)
      .catch(() => setError('Aucun fournisseur disponible pour ce pays et ce type.'))
      .finally(() => setLoadingBillers(false));
  }, [step, country, billType]);

  useEffect(() => {
    setBiller(null);
    setBillers([]);
  }, [country, billType]);

  useEffect(() => {
    if (step !== 4 || !amount) return;
    apiFetch<{ feeAmount: string }>(`/pricing/preview?amount=${amount}`)
      .then((r) => setFeeAmount(Number(r.feeAmount)))
      .catch(() => setFeeAmount(null));
  }, [step, amount]);

  const amountValid = (): boolean => {
    if (!amount || Number(amount) <= 0) return false;
    const min = biller?.minLocalTransactionAmount ?? 0;
    const max = biller?.maxLocalTransactionAmount ?? Infinity;
    return Number(amount) >= min && Number(amount) <= max;
  };

  const canGoNext = (): boolean => {
    switch (step) {
      case 0:
        return !!country;
      case 1:
        return billType !== null;
      case 2:
        return biller !== null;
      case 3:
        return accountNumber.trim().length >= 3;
      case 4:
        return amountValid();
      case 5:
        return pin.length >= 4;
      default:
        return false;
    }
  };

  const submit = async () => {
    if (!biller) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ status: string; failureReason?: string }>(
        '/utility-payments/pay',
        {
          method: 'POST',
          idempotent: true,
          body: JSON.stringify({
            billerId: biller.id,
            billerName: biller.name,
            billType: biller.type,
            subscriberAccountNumber: accountNumber,
            amount: Number(amount),
            pin,
          }),
        },
      );

      if (res.status === 'SUCCESS' || res.status === 'PROCESSING') {
        setResult({
          status: res.status === 'SUCCESS' ? 'success' : 'pending',
          message:
            res.status === 'SUCCESS'
              ? `Facture ${biller.name} payée !`
              : `Paiement de la facture ${biller.name} en cours de traitement.`,
        });
      } else {
        setResult({
          status: 'failed',
          message: res.failureReason ?? "Le paiement n'a pas pu être effectué.",
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec du paiement.');
    } finally {
      setSubmitting(false);
      setPin('');
    }
  };

  const goNext = () => {
    if (step === STEPS.length - 1) submit();
    else setStep((s) => s + 1);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StepHeader
        title="🧾 Factures"
        steps={STEPS}
        current={step}
        onBack={() => setStep((s) => s - 1)}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {error && <ErrorBanner message={error} />}

          {step === 0 && (
            <CountryPicker
              countries={WORLD_COUNTRIES}
              value={country}
              onChange={(code) => {
                setCountryTouched(true);
                setCountry(code);
              }}
              label="Pays du fournisseur"
              helper="Dans quel pays se trouve la facture à régler ?"
            />
          )}

          {step === 1 && (
            <>
              <Text style={styles.hint}>Quel type de facture ?</Text>
              {BILL_TYPES.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => setBillType(t.id)}
                  style={[styles.choice, billType === t.id && styles.choiceActive]}
                >
                  <Text style={styles.choiceIcon}>{t.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.choiceLabel}>{t.label}</Text>
                    <Text style={styles.choiceHint}>{t.hint}</Text>
                  </View>
                  {billType === t.id && <Text style={styles.check}>✓</Text>}
                </Pressable>
              ))}
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.hint}>Chez quel fournisseur ?</Text>
              {loadingBillers ? (
                <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
              ) : (
                billers.map((b) => (
                  <Pressable
                    key={b.id}
                    onPress={() => {
                      setBiller(b);
                      setAmount('');
                    }}
                    style={[styles.choice, biller?.id === b.id && styles.choiceActive]}
                  >
                    <Text style={styles.choiceIcon}>
                      {BILL_TYPES.find((t) => t.id === billType)?.icon ?? '🧾'}
                    </Text>
                    <Text style={styles.choiceLabel} numberOfLines={2}>
                      {b.name}
                    </Text>
                    {biller?.id === b.id && <Text style={styles.check}>✓</Text>}
                  </Pressable>
                ))
              )}
            </>
          )}

          {step === 3 && (
            <>
              <Text style={styles.hint}>
                Numéro de compte, de compteur ou d'abonné chez {biller?.name}.
              </Text>
              <Input
                label="Numéro de compte"
                value={accountNumber}
                onChangeText={setAccountNumber}
                placeholder="Tel qu'il figure sur ta facture"
                autoCapitalize="characters"
              />
            </>
          )}

          {step === 4 && biller && (
            <>
              <Text style={styles.hint}>
                {biller.minLocalTransactionAmount || biller.maxLocalTransactionAmount
                  ? `Montant entre ${(biller.minLocalTransactionAmount ?? 0).toLocaleString('fr-FR')} et ${(biller.maxLocalTransactionAmount ?? 0).toLocaleString('fr-FR')} ${biller.localTransactionCurrencyCode}.`
                  : 'Quel montant veux-tu régler ?'}
              </Text>
              <Input
                label={`Montant (${biller.localTransactionCurrencyCode})`}
                value={amount}
                onChangeText={(v) => setAmount(v.replace(/\D/g, ''))}
                placeholder="0"
                keyboardType="number-pad"
              />

              <View style={styles.summary}>
                <Text style={styles.summaryTitle}>🔍 Récapitulatif</Text>
                <Row k="Fournisseur" v={biller.name} />
                <Row k="Compte" v={accountNumber} />
                <Row
                  k="Montant"
                  v={`${Number(amount || 0).toLocaleString('fr-FR')} ${biller.localTransactionCurrencyCode}`}
                />
                <Row
                  k="Frais de transaction"
                  v={
                    feeAmount !== null
                      ? `${(feeAmount / 100).toLocaleString('fr-FR')} FCFA`
                      : '…'
                  }
                />
              </View>
            </>
          )}

          {step === 5 && (
            <>
              <Text style={styles.hint}>Saisis ton code secret pour confirmer le paiement.</Text>
              <Input
                label="Code secret"
                value={pin}
                onChangeText={(v) => setPin(v.replace(/\D/g, ''))}
                placeholder="••••"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                style={styles.pinInput}
                autoFocus
              />
            </>
          )}

          <Button
            onPress={goNext}
            disabled={!canGoNext()}
            loading={submitting}
            style={{ marginTop: spacing.lg }}
          >
            {step === STEPS.length - 1 ? '✅ Payer la facture' : 'Continuer →'}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>

      {result && (
        <StatusModal
          status={result.status}
          message={result.message}
          onClose={() => {
            setResult(null);
            if (result.status !== 'failed') router.replace('/dashboard');
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{k}</Text>
      <Text style={styles.rowValue}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  hint: { fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.md },

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
  choiceIcon: { fontSize: 24 },
  choiceLabel: { flex: 1, fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  choiceHint: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  check: { color: colors.accent, fontSize: fontSize.lg, fontWeight: '800' },

  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.lg,
  },
  summaryTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  rowKey: { fontSize: fontSize.sm, color: colors.textSecondary },
  rowValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  pinInput: { textAlign: 'center', letterSpacing: 10, fontSize: fontSize.xl },
});
