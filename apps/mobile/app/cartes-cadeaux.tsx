import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
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

interface GiftCardProduct {
  productId: number;
  productName: string;
  brandName: string;
  logoUrl: string | null;
  denominationType: 'FIXED' | 'RANGE';
  fixedRecipientDenominations: number[];
  minRecipientDenomination: number | null;
  maxRecipientDenomination: number | null;
  recipientCurrencyCode: string;
}

const STEPS = ['Pays', 'Carte', 'Montant', 'Bénéficiaire', 'Code secret'];

export default function CartesCadeauxScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [country, setCountry] = useState(() => resolveDefaultCountry(user?.country));
  const [countryTouched, setCountryTouched] = useState(false);
  const [products, setProducts] = useState<GiftCardProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [product, setProduct] = useState<GiftCardProduct | null>(null);
  const [amount, setAmount] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [pin, setPin] = useState('');
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: ResultStatus; message: string } | null>(null);

  useEffect(() => {
    if (countryTouched || !user?.country) return;
    setCountry(resolveDefaultCountry(user.country));
  }, [user?.country, countryTouched]);

  // Le catalogue dépend du pays : une carte vendue au Sénégal n'existe pas
  // forcément en France, et sa devise diffère.
  useEffect(() => {
    if (step !== 1) return;
    setLoadingProducts(true);
    setError(null);
    apiFetch<GiftCardProduct[]>(`/gift-cards/products?country=${country}`)
      .then(setProducts)
      .catch(() => setError('Aucune carte cadeau disponible pour ce pays.'))
      .finally(() => setLoadingProducts(false));
  }, [step, country]);

  useEffect(() => {
    setProduct(null);
    setProducts([]);
    setAmount('');
  }, [country]);

  // Les frais réels viennent du serveur — jamais calculés côté client.
  useEffect(() => {
    if (step !== 3 || !amount) return;
    apiFetch<{ feeAmount: string }>(`/pricing/preview?amount=${amount}`)
      .then((r) => setFeeAmount(Number(r.feeAmount)))
      .catch(() => setFeeAmount(null));
  }, [step, amount]);

  const isFixed = product?.denominationType === 'FIXED';

  const amountValid = (): boolean => {
    if (!amount || Number(amount) <= 0) return false;
    if (isFixed) return product!.fixedRecipientDenominations.includes(Number(amount));
    const min = product?.minRecipientDenomination ?? 0;
    const max = product?.maxRecipientDenomination ?? Infinity;
    return Number(amount) >= min && Number(amount) <= max;
  };

  const canGoNext = (): boolean => {
    switch (step) {
      case 0:
        return !!country;
      case 1:
        return product !== null;
      case 2:
        return amountValid();
      case 3:
        return /\S+@\S+\.\S+/.test(recipientEmail);
      case 4:
        return pin.length >= 4;
      default:
        return false;
    }
  };

  const submit = async () => {
    if (!product) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{
        status: string;
        failureReason?: string;
        cardCode?: string;
      }>('/gift-cards/orders', {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          productId: product.productId,
          unitPrice: Number(amount),
          recipientEmail,
          pin,
          countryCode: country,
        }),
      });

      if (res.status === 'SUCCESS') {
        setResult({
          status: 'success',
          message: res.cardCode
            ? `Carte ${product.brandName} achetée ! Le code a été envoyé à ${recipientEmail}.`
            : `Carte ${product.brandName} achetée ! Le code arrive par email à ${recipientEmail}.`,
        });
      } else if (res.status === 'FAILED') {
        setResult({
          status: 'failed',
          message: res.failureReason ?? "L'achat n'a pas pu être finalisé.",
        });
      } else {
        setResult({
          status: 'pending',
          message: "Commande en cours. Le code sera envoyé par email dès validation.",
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec de l'achat.");
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
        title="🎁 Cartes cadeaux"
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
              label="Pays de la carte"
              helper="Le catalogue et la devise dépendent du pays où la carte sera utilisée."
            />
          )}

          {step === 1 && (
            <>
              <Text style={styles.hint}>Quelle carte veux-tu offrir ?</Text>
              {loadingProducts ? (
                <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
              ) : (
                products.map((p) => (
                  <Pressable
                    key={p.productId}
                    onPress={() => {
                      setProduct(p);
                      setAmount('');
                    }}
                    style={[
                      styles.choice,
                      product?.productId === p.productId && styles.choiceActive,
                    ]}
                  >
                    {p.logoUrl ? (
                      <Image source={{ uri: p.logoUrl }} style={styles.logo} resizeMode="contain" />
                    ) : (
                      <Text style={styles.choiceIcon}>🎁</Text>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.choiceLabel} numberOfLines={1}>
                        {p.brandName}
                      </Text>
                      <Text style={styles.choiceHint} numberOfLines={1}>
                        {p.productName}
                      </Text>
                    </View>
                    {product?.productId === p.productId && <Text style={styles.check}>✓</Text>}
                  </Pressable>
                ))
              )}
            </>
          )}

          {step === 2 && product && (
            <>
              {/* § Reloadly distingue deux types : montants imposés par la
                  marque, ou libre dans une fourchette. Proposer une saisie
                  libre sur une carte à montants fixes ferait échouer l'achat
                  après validation. */}
              {isFixed ? (
                <>
                  <Text style={styles.hint}>
                    Choisis un montant proposé par {product.brandName}.
                  </Text>
                  <View style={styles.denomGrid}>
                    {product.fixedRecipientDenominations.map((d) => (
                      <Pressable
                        key={d}
                        onPress={() => setAmount(String(d))}
                        style={[styles.denom, Number(amount) === d && styles.denomActive]}
                      >
                        <Text
                          style={[
                            styles.denomText,
                            Number(amount) === d && { color: '#fff' },
                          ]}
                        >
                          {d.toLocaleString('fr-FR')} {product.recipientCurrencyCode}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.hint}>
                    Montant libre entre{' '}
                    {(product.minRecipientDenomination ?? 0).toLocaleString('fr-FR')} et{' '}
                    {(product.maxRecipientDenomination ?? 0).toLocaleString('fr-FR')}{' '}
                    {product.recipientCurrencyCode}.
                  </Text>
                  <Input
                    label={`Montant (${product.recipientCurrencyCode})`}
                    value={amount}
                    onChangeText={(v) => setAmount(v.replace(/\D/g, ''))}
                    placeholder="0"
                    keyboardType="number-pad"
                  />
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <Text style={styles.hint}>
                À quelle adresse email envoyer le code de la carte ?
              </Text>
              <Input
                label="Email du bénéficiaire"
                value={recipientEmail}
                onChangeText={setRecipientEmail}
                placeholder="exemple@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <View style={styles.summary}>
                <Text style={styles.summaryTitle}>🔍 Récapitulatif</Text>
                <Row k="Carte" v={product?.brandName ?? ''} />
                <Row
                  k="Montant"
                  v={`${Number(amount).toLocaleString('fr-FR')} ${product?.recipientCurrencyCode ?? ''}`}
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

          {step === 4 && (
            <>
              <Text style={styles.hint}>
                Saisis ton code secret pour confirmer l'achat.
              </Text>
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
            {step === STEPS.length - 1 ? "✅ Confirmer l'achat" : 'Continuer →'}
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
  logo: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: '#fff' },
  choiceLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  choiceHint: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  check: { color: colors.accent, fontSize: fontSize.lg, fontWeight: '800' },

  denomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  denom: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  denomActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  denomText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },

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
