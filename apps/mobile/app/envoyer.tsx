import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch, ApiError } from '../src/lib/apiClient';
import { Button, Input, ErrorBanner } from '../src/components/ui';
import StepHeader from '../src/components/StepHeader';
import StatusModal, { ResultStatus } from '../src/components/StatusModal';
import { colors, spacing, fontSize, radius } from '../src/theme';

const STEPS = ['Destination', 'Compte', 'Montant', 'Résumé', 'Code secret'];

/** Mêmes destinations que le web : MobilePay interne + 4 opérateurs externes. */
const DESTINATIONS = [
  { id: 'MOBILEPAY', label: 'MobilePay', icon: '💚', hint: 'Vers un autre compte MobilePay' },
  { id: 'ORANGE', label: 'Orange Money', icon: '🟠', hint: 'Vers un compte Orange Money' },
  { id: 'MTN', label: 'MTN MoMo', icon: '🟡', hint: 'Vers un compte MTN MoMo' },
  { id: 'MOOV', label: 'Moov Money', icon: '🔵', hint: 'Vers un compte Moov Money' },
  { id: 'WAVE', label: 'Wave', icon: '🌊', hint: 'Vers un compte Wave' },
] as const;

export default function EnvoyerScreen() {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [destination, setDestination] = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: ResultStatus; message: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // § Un envoi vers un opérateur externe est asynchrone : le serveur répond
  // "en cours", la confirmation arrive plus tard par webhook. On suit donc
  // le statut au lieu de laisser l'utilisateur sans réponse définitive.
  const pollStatus = (transactionId: string) => {
    let attempts = 0;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const tx = await apiFetch<{ status: string; failureReason?: string }>(
          `/transactions/${transactionId}`,
        );
        if (tx.status === 'SUCCESS') {
          if (pollRef.current) clearInterval(pollRef.current);
          setResult({
            status: 'success',
            message: `${Number(amount).toLocaleString('fr-FR')} FCFA envoyés avec succès !`,
          });
        } else if (tx.status === 'FAILED') {
          if (pollRef.current) clearInterval(pollRef.current);
          setResult({
            status: 'failed',
            message: tx.failureReason ?? "Le transfert n'a pas pu être effectué.",
          });
        }
      } catch {
        // Erreur réseau ponctuelle — on retente au prochain passage.
      }
      if (attempts >= 40 && pollRef.current) clearInterval(pollRef.current);
    }, 3000);
  };

  const isInternal = destination === 'MOBILEPAY';

  const canGoNext = (): boolean => {
    switch (step) {
      case 0:
        return destination !== null;
      case 1:
        return (
          accountNumber.replace(/\D/g, '').length >= 8 &&
          (isInternal || recipientName.trim().length >= 2)
        );
      case 2:
        return !!amount && Number(amount) > 0;
      case 3:
        return true;
      case 4:
        return pin.length >= 4;
      default:
        return false;
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body = isInternal
        ? {
            toPhone: accountNumber,
            amount: Math.round(Number(amount) * 100),
            pin,
            description: description || undefined,
          }
        : {
            operator: destination,
            accountNumber,
            amount: Math.round(Number(amount) * 100),
            pin,
            country: 'CI',
            recipientName,
          };

      const res = await apiFetch<{ status?: string; id?: string }>(
        isInternal ? '/transfers' : '/wallets/send-external',
        { method: 'POST', idempotent: true, body: JSON.stringify(body) },
      );

      // Le statut réel du serveur détermine le message — un envoi externe
      // reste "en attente" tant que l'opérateur n'a pas confirmé.
      if (res.status === 'SUCCESS') {
        setResult({
          status: 'success',
          message: `${Number(amount).toLocaleString('fr-FR')} FCFA envoyés avec succès !`,
        });
      } else if (res.status === 'FAILED') {
        setResult({ status: 'failed', message: "Le transfert n'a pas pu être effectué." });
      } else {
        setResult({
          status: 'pending',
          message:
            "Transfert en cours — vérifie ton téléphone si ton opérateur te demande de confirmer.",
        });
        if (res.id) pollStatus(res.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec du transfert.');
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
        title="↗️ Transfert"
        steps={STEPS}
        current={step}
        onBack={() => setStep((s) => s - 1)}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {error && <ErrorBanner message={error} />}

          {/* Étape 0 — destination */}
          {step === 0 && (
            <>
              <Text style={styles.hint}>Où veux-tu envoyer l'argent ?</Text>
              {DESTINATIONS.map((d) => (
                <Pressable
                  key={d.id}
                  onPress={() => setDestination(d.id)}
                  style={[styles.choice, destination === d.id && styles.choiceActive]}
                >
                  <Text style={styles.choiceIcon}>{d.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.choiceLabel}>{d.label}</Text>
                    <Text style={styles.choiceHint}>{d.hint}</Text>
                  </View>
                  {destination === d.id && <Text style={styles.check}>✓</Text>}
                </Pressable>
              ))}
            </>
          )}

          {/* Étape 1 — compte destinataire */}
          {step === 1 && (
            <>
              <Text style={styles.hint}>
                {isInternal
                  ? 'Numéro du compte MobilePay destinataire'
                  : "Numéro du compte à créditer chez l'opérateur"}
              </Text>
              <Input
                label="Numéro de téléphone"
                value={accountNumber}
                onChangeText={(v) => setAccountNumber(v.replace(/\D/g, ''))}
                placeholder="0700000000"
                keyboardType="phone-pad"
                maxLength={10}
              />
              {!isInternal && (
                <Input
                  label="Nom du bénéficiaire"
                  value={recipientName}
                  onChangeText={setRecipientName}
                  placeholder="Nom complet"
                />
              )}
            </>
          )}

          {/* Étape 2 — montant */}
          {step === 2 && (
            <>
              <Text style={styles.hint}>Quel montant veux-tu envoyer ?</Text>
              <Input
                label="Montant (FCFA)"
                value={amount}
                onChangeText={(v) => setAmount(v.replace(/\D/g, ''))}
                placeholder="0"
                keyboardType="number-pad"
              />
              {isInternal && (
                <Input
                  label="Motif (optionnel)"
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Ex: remboursement"
                  maxLength={140}
                />
              )}
            </>
          )}

          {/* Étape 3 — résumé */}
          {step === 3 && (
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>🔍 Vérifie avant de continuer</Text>
              <Row k="Objet" v="Transfert d'argent" />
              <Row k="Destination" v={DESTINATIONS.find((d) => d.id === destination)?.label ?? ''} />
              <Row k="Numéro" v={accountNumber} />
              {!isInternal && <Row k="Bénéficiaire" v={recipientName} />}
              {isInternal && description ? <Row k="Motif" v={description} /> : null}
              <Row k="Montant" v={`${Number(amount).toLocaleString('fr-FR')} FCFA`} />
            </View>
          )}

          {/* Étape 4 — code secret */}
          {step === 4 && (
            <>
              <Text style={styles.hint}>
                Saisis ton code secret pour confirmer l'envoi de{' '}
                {Number(amount).toLocaleString('fr-FR')} FCFA.
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
            {step === STEPS.length - 1 ? '✅ Confirmer le transfert' : 'Continuer →'}
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
  choiceLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
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
