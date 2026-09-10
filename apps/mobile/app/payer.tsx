import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch, ApiError } from '../src/lib/apiClient';
import { Button, Input, ErrorBanner } from '../src/components/ui';
import StepHeader from '../src/components/StepHeader';
import StatusModal, { ResultStatus } from '../src/components/StatusModal';
import { colors, spacing, fontSize, radius } from '../src/theme';

const STEPS = ['Marchand', 'Montant', 'Résumé', 'Code secret'];

interface ResolvedTarget {
  kind: 'qr' | 'link';
  ref: string;
  name: string;
  fixedAmount: number | null;
  description?: string | null;
}

export default function PayerScreen() {
  const router = useRouter();
  // Le code peut arriver par lien profond (QR scanné hors de l'app).
  const params = useLocalSearchParams<{ qr?: string; link?: string }>();

  const [step, setStep] = useState(0);
  const [code, setCode] = useState(params.qr ?? params.link ?? '');
  const [target, setTarget] = useState<ResolvedTarget | null>(null);
  const [resolving, setResolving] = useState(false);
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: ResultStatus; message: string } | null>(null);

  /**
   * Résout un code saisi : QR marchand/personnel ou lien de paiement.
   * On tente le QR d'abord (cas le plus courant), puis le lien.
   */
  const resolveCode = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setResolving(true);
    setError(null);
    try {
      let resolved: ResolvedTarget | null = null;
      try {
        const qr = await apiFetch<any>(`/qr/${trimmed}`, { auth: false });
        resolved = {
          kind: 'qr',
          ref: trimmed,
          name:
            qr.merchant?.businessName ??
            (qr.ownerUser ? `${qr.ownerUser.firstName} ${qr.ownerUser.lastName}` : 'Bénéficiaire'),
          fixedAmount: qr.fixedAmount ? Number(qr.fixedAmount) : null,
          description: qr.description,
        };
      } catch {
        const link = await apiFetch<any>(`/payment-links/${trimmed}`, { auth: false });
        resolved = {
          kind: 'link',
          ref: trimmed,
          name: link.merchant?.businessName ?? 'Marchand',
          fixedAmount: link.amount ? Number(link.amount) : null,
          description: link.description,
        };
      }
      setTarget(resolved);
      // Un montant imposé rend l'étape "Montant" inutile.
      setStep(resolved.fixedAmount ? 2 : 1);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Ce code est introuvable. Vérifie-le et réessaie.",
      );
    } finally {
      setResolving(false);
    }
  };

  const effectiveAmount = target?.fixedAmount ?? Math.round(Number(amount) * 100);

  const canGoNext = (): boolean => {
    switch (step) {
      case 0:
        return !!target;
      case 1:
        return !!amount && Number(amount) > 0;
      case 2:
        return true;
      case 3:
        return pin.length >= 4;
      default:
        return false;
    }
  };

  const submit = async () => {
    if (!target) return;
    setSubmitting(true);
    setError(null);
    try {
      const path =
        target.kind === 'qr' ? `/qr/${target.ref}/pay` : `/payment-links/${target.ref}/pay`;
      const res = await apiFetch<{ status?: string }>(path, {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          amount: target.fixedAmount ? undefined : effectiveAmount,
          fundingSource: 'WALLET',
          pin,
        }),
      });

      if (res.status === 'SUCCESS') {
        setResult({
          status: 'success',
          message: `Paiement de ${(effectiveAmount / 100).toLocaleString('fr-FR')} FCFA effectué à ${target.name} !`,
        });
      } else if (res.status === 'FAILED') {
        setResult({ status: 'failed', message: "Le paiement n'a pas pu être effectué." });
      } else {
        setResult({ status: 'pending', message: 'Paiement en cours de traitement.' });
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
        title="🏪 Payer"
        steps={STEPS}
        current={step}
        onBack={() => setStep((s) => (s === 2 && target?.fixedAmount ? 0 : s - 1))}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {error && <ErrorBanner message={error} />}

          {step === 0 && (
            <>
              <Text style={styles.hint}>
                Saisis le code du marchand ou du lien de paiement (il figure sous le QR code).
              </Text>
              <Input
                label="Code"
                value={code}
                onChangeText={(v) => setCode(v.toUpperCase())}
                placeholder="MPU416E3550-F"
                autoCapitalize="characters"
              />
              <Button
                onPress={resolveCode}
                loading={resolving}
                disabled={code.trim().length < 4}
                style={{ alignSelf: 'stretch' }}
              >
                Rechercher
              </Button>

              {target && (
                <View style={styles.foundBox}>
                  <Text style={styles.foundLabel}>Bénéficiaire trouvé</Text>
                  <Text style={styles.foundName}>{target.name}</Text>
                  {target.description ? (
                    <Text style={styles.foundDesc}>{target.description}</Text>
                  ) : null}
                  {target.fixedAmount ? (
                    <Text style={styles.foundAmount}>
                      {(target.fixedAmount / 100).toLocaleString('fr-FR')} FCFA
                    </Text>
                  ) : null}
                </View>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <Text style={styles.hint}>Quel montant veux-tu payer à {target?.name} ?</Text>
              <Input
                label="Montant (FCFA)"
                value={amount}
                onChangeText={(v) => setAmount(v.replace(/\D/g, ''))}
                placeholder="0"
                keyboardType="number-pad"
              />
            </>
          )}

          {step === 2 && (
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>🔍 Vérifie avant de continuer</Text>
              <Row k="Bénéficiaire" v={target?.name ?? ''} />
              {target?.description ? <Row k="Description" v={target.description} /> : null}
              <Row k="Montant" v={`${(effectiveAmount / 100).toLocaleString('fr-FR')} FCFA`} />
              <Row k="Payé depuis" v="Mon solde MobilePay" />
            </View>
          )}

          {step === 3 && (
            <>
              <Text style={styles.hint}>
                Saisis ton code secret pour confirmer le paiement de{' '}
                {(effectiveAmount / 100).toLocaleString('fr-FR')} FCFA.
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

          {step > 0 && (
            <Button
              onPress={goNext}
              disabled={!canGoNext()}
              loading={submitting}
              style={{ marginTop: spacing.lg }}
            >
              {step === STEPS.length - 1 ? '✅ Confirmer le paiement' : 'Continuer →'}
            </Button>
          )}
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

  foundBox: {
    marginTop: spacing.lg,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  foundLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary },
  foundName: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 4,
  },
  foundDesc: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  foundAmount: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.accentDark,
    marginTop: spacing.sm,
  },

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
