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
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch, ApiError } from '../src/lib/apiClient';
import { Button, Input, ErrorBanner } from '../src/components/ui';
import StepHeader from '../src/components/StepHeader';
import StatusModal, { ResultStatus } from '../src/components/StatusModal';
import { colors, spacing, fontSize, radius } from '../src/theme';
import { WORLD_COUNTRIES } from '../src/lib/worldCountries';
import CountryPicker from '../src/components/CountryPicker';
import { resolveDefaultCountry } from '../src/lib/deviceCountry';
import { useAuth } from '../src/contexts/AuthContext';

interface Operator {
  operatorId: string;
  name: string;
  logoUrls?: string[];
}

type Category = 'AIRTIME' | 'DATA_PASS';

const CATEGORIES: { id: Category; label: string; icon: string; hint: string }[] = [
  { id: 'AIRTIME', label: 'Crédit de communication', icon: '📞', hint: 'Recharge classique' },
  { id: 'DATA_PASS', label: 'Pass internet', icon: '📶', hint: 'Forfait data' },
];

// § Le pays est une étape à part entière : Reloadly couvre plus de 190
// pays, et recharger un numéro à l'étranger est un usage courant de la
// diaspora. Le pays du profil est simplement pré-sélectionné pour que le
// cas le plus fréquent (recharge locale) reste rapide.
const STEPS = ['Pays', 'Catégorie', 'Opérateur', 'Bénéficiaire', 'Montant', 'Code secret'];

export default function RechargerScreen() {
  const router = useRouter();

  const { user } = useAuth();

  const [step, setStep] = useState(0);
  // Reloadly couvrant plus de 190 pays, aucune restriction n'est appliquée :
  // le pays de l'appareil est retenu tel quel.
  const [country, setCountry] = useState(() => resolveDefaultCountry(user?.country));
  // Voir explication identique dans l'écran Transfert : le profil peut
  // arriver après le montage de l'écran.
  const [countryTouched, setCountryTouched] = useState(false);
  useEffect(() => {
    if (countryTouched || !user?.country) return;
    setCountry(resolveDefaultCountry(user.country));
  }, [user?.country, countryTouched]);
  const [category, setCategory] = useState<Category | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [loadingOperators, setLoadingOperators] = useState(false);
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: ResultStatus; message: string } | null>(null);

  useEffect(() => {
    if (step !== 2) return;
    setLoadingOperators(true);
    setError(null);
    apiFetch<Operator[]>(`/airtime/operators?country=${country}`)
      .then(setOperators)
      .catch(() => setError("Impossible de charger la liste des opérateurs pour ce pays."))
      .finally(() => setLoadingOperators(false));
  }, [step, country]);

  // Changer de pays invalide l'opérateur choisi : il n'existe pas ailleurs.
  useEffect(() => {
    setOperator(null);
    setOperators([]);
  }, [country]);

  const canGoNext = (): boolean => {
    switch (step) {
      case 0:
        return !!country;
      case 1:
        return category !== null;
      case 2:
        return operator !== null;
      case 3:
        return phone.replace(/\D/g, '').length >= 8;
      case 4:
        return !!amount && Number(amount) > 0;
      case 5:
        return pin.length >= 4;
      default:
        return false;
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ status?: string; id?: string }>('/airtime', {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          phoneNumber: phone,
          amount: Math.round(Number(amount) * 100),
          kind: category === 'DATA_PASS' ? 'DATA' : 'AIRTIME',
          operatorId: operator?.operatorId,
          paymentMethod: 'WALLET',
          countryCode: country,
          pin,
        }),
      });

      const label = CATEGORIES.find((c) => c.id === category)?.label ?? 'Recharge';
      if (res.status === 'SUCCESS') {
        setResult({ status: 'success', message: `C'est fait ! ${label} activé pour ${phone}.` });
      } else if (res.status === 'FAILED') {
        setResult({ status: 'failed', message: "La recharge n'a pas pu être effectuée." });
      } else {
        setResult({
          status: 'pending',
          message: "Recharge en cours de traitement. Tu recevras une confirmation sous peu.",
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de la recharge.');
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
        title="📶 Crédit / Data"
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
              onChange={(code) => { setCountryTouched(true); setCountry(code); }}
              label="Pays du numéro"
              helper="Dans quel pays se trouve le numéro à recharger ? Plus de 190 pays sont couverts."
            />
          )}

          {step === 1 && (
            <>
              <Text style={styles.hint}>Que veux-tu acheter ?</Text>
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCategory(c.id)}
                  style={[styles.choice, category === c.id && styles.choiceActive]}
                >
                  <Text style={styles.choiceIcon}>{c.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.choiceLabel}>{c.label}</Text>
                    <Text style={styles.choiceHint}>{c.hint}</Text>
                  </View>
                  {category === c.id && <Text style={styles.check}>✓</Text>}
                </Pressable>
              ))}
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.hint}>Chez quel opérateur ?</Text>
              {loadingOperators ? (
                <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
              ) : (
                operators.map((o) => (
                  <Pressable
                    key={o.operatorId}
                    onPress={() => setOperator(o)}
                    style={[
                      styles.choice,
                      operator?.operatorId === o.operatorId && styles.choiceActive,
                    ]}
                  >
                    {/* § Reloadly fournit les logos officiels des opérateurs
                        (champ logoUrls) : bien plus reconnaissable qu'une
                        icône générique, surtout dans une liste de plusieurs
                        opérateurs d'un même pays. L'index 2 est la version
                        haute définition ; on retombe sur la première
                        disponible, puis sur une icône si aucune n'existe. */}
                    {o.logoUrls?.[2] || o.logoUrls?.[0] ? (
                      <Image
                        source={{ uri: o.logoUrls[2] ?? o.logoUrls[0] }}
                        style={styles.operatorLogo}
                        resizeMode="contain"
                      />
                    ) : (
                      <Text style={styles.choiceIcon}>📡</Text>
                    )}
                    <Text style={styles.choiceLabel}>{o.name}</Text>
                    {operator?.operatorId === o.operatorId && <Text style={styles.check}>✓</Text>}
                  </Pressable>
                ))
              )}
            </>
          )}

          {step === 3 && (
            <>
              <Text style={styles.hint}>Quel numéro veux-tu recharger ?</Text>
              <Input
                label="Numéro du bénéficiaire"
                value={phone}
                onChangeText={(v) => setPhone(v.replace(/\D/g, ''))}
                placeholder="0700000000"
                keyboardType="phone-pad"
                maxLength={10}
              />
            </>
          )}

          {step === 4 && (
            <>
              <Text style={styles.hint}>Quel montant ?</Text>
              <Input
                label="Montant (FCFA)"
                value={amount}
                onChangeText={(v) => setAmount(v.replace(/\D/g, ''))}
                placeholder="0"
                keyboardType="number-pad"
              />
            </>
          )}

          {step === 5 && (
            <>
              <View style={styles.summary}>
                <Text style={styles.summaryTitle}>🔍 Vérifie avant de continuer</Text>
                <Row k="Objet" v={CATEGORIES.find((c) => c.id === category)?.label ?? ''} />
                <Row
                  k="Pays"
                  v={WORLD_COUNTRIES.find((c) => c.code === country)?.name ?? country}
                />
                <Row k="Opérateur" v={operator?.name ?? ''} />
                <Row k="Numéro" v={phone} />
                <Row k="Montant" v={`${Number(amount).toLocaleString('fr-FR')} FCFA`} />
                <Row k="Payé depuis" v="Mon solde MobilePay" />
              </View>

              <Text style={[styles.hint, { marginTop: spacing.lg }]}>
                Saisis ton code secret pour confirmer.
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
              />
            </>
          )}

          <Button
            onPress={goNext}
            disabled={!canGoNext()}
            loading={submitting}
            style={{ marginTop: spacing.lg }}
          >
            {step === STEPS.length - 1 ? '✅ Confirmer la recharge' : 'Continuer →'}
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
  operatorLogo: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: '#fff',
  },
  choiceLabel: { flex: 1, fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  choiceHint: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  check: { color: colors.accent, fontSize: fontSize.lg, fontWeight: '800' },

  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
