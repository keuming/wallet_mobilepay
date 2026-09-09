import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch, ApiError } from '../src/lib/apiClient';
import { Button, Input, ErrorBanner } from '../src/components/ui';
import StepHeader from '../src/components/StepHeader';
import StatusModal, { ResultStatus } from '../src/components/StatusModal';
import WaveLinkActions from '../src/components/WaveLinkActions';
import { colors, spacing, fontSize, radius } from '../src/theme';

const STEPS = ['Opérateur', 'Compte', 'Montant', 'Résumé', 'Validation'];

const OPERATORS = [
  { id: 'ORANGE', label: 'Orange Money', icon: '🟠' },
  { id: 'MTN', label: 'MTN MoMo', icon: '🟡' },
  { id: 'MOOV', label: 'Moov Money', icon: '🔵' },
  { id: 'WAVE', label: 'Wave', icon: '🌊' },
] as const;

export default function RecevoirWalletScreen() {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [operator, setOperator] = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [upfrontOtp, setUpfrontOtp] = useState('');
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: ResultStatus; message: string } | null>(null);
  const [nextAction, setNextAction] = useState<{ type: string; message: string; url?: string } | null>(null);
  const [pendingTxId, setPendingTxId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Frais réels calculés par le serveur — jamais devinés côté client.
  useEffect(() => {
    if (step !== 3 || !amount) return;
    apiFetch<{ feeAmount: string }>(`/pricing/preview?amount=${amount}`)
      .then((r) => setFeeAmount(Number(r.feeAmount)))
      .catch(() => setFeeAmount(null));
  }, [step, amount]);

  // § HUB2 est ASYNCHRONE : le serveur répond immédiatement "en attente",
  // puis l'opérateur sollicite le client sur son téléphone (USSD, code OTP
  // ou lien Wave). Sans ce suivi, l'écran resterait bloqué sur le message
  // d'attente sans jamais afficher le vrai résultat.
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const pollStatus = (transactionId: string) => {
    let attempts = 0;
    const maxAttempts = 40; // ~2 minutes : le client peut mettre du temps à valider
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const tx = await apiFetch<{
          status: string;
          nextActionType?: string;
          nextActionMessage?: string;
          nextActionUrl?: string;
          failureReason?: string;
        }>(`/transactions/${transactionId}`);

        if (tx.status === 'SUCCESS') {
          if (pollRef.current) clearInterval(pollRef.current);
          setNextAction(null);
          setPendingTxId(null);
          setResult({
            status: 'success',
            message: `Recharge réussie ! ${Number(amount).toLocaleString('fr-FR')} FCFA ajoutés à ton wallet.`,
          });
        } else if (tx.status === 'FAILED') {
          if (pollRef.current) clearInterval(pollRef.current);
          setNextAction(null);
          setPendingTxId(null);
          setResult({
            status: 'failed',
            message: tx.failureReason ?? "La recharge n'a pas pu être finalisée.",
          });
        } else if (tx.nextActionType) {
          // On continue de surveiller : le vrai succès arrive plus tard via
          // webhook. Couper ici laisserait l'écran figé indéfiniment.
          setResult(null);
          setNextAction({
            type: tx.nextActionType,
            message: tx.nextActionMessage ?? '',
            url: tx.nextActionUrl,
          });
        }
      } catch {
        // Erreur réseau ponctuelle — on retente au prochain passage.
      }
      if (attempts >= maxAttempts && pollRef.current) {
        clearInterval(pollRef.current);
        setResult({
          status: 'pending',
          message: "La confirmation prend plus de temps que prévu. Vérifie ton historique Mobile Money.",
        });
      }
    }, 3000);
  };

  const submitOtp = async () => {
    if (!pendingTxId || otpCode.length < 4) return;
    setOtpSubmitting(true);
    try {
      await apiFetch(`/transactions/${pendingTxId}/authenticate`, {
        method: 'POST',
        body: JSON.stringify({ confirmationCode: otpCode }),
      });
      setOtpCode('');
      pollStatus(pendingTxId);
    } catch (err) {
      setResult({
        status: 'failed',
        message: err instanceof ApiError ? err.message : "Échec de l'authentification.",
      });
    } finally {
      setOtpSubmitting(false);
    }
  };

  const canGoNext = (): boolean => {
    switch (step) {
      case 0:
        return operator !== null;
      case 1:
        return accountNumber.replace(/\D/g, '').length >= 8;
      case 2:
        return !!amount && Number(amount) > 0;
      case 3:
        return true;
      case 4:
        // Orange exige le code généré par le client (#144*82#) ; les autres
        // opérateurs authentifient directement sur le téléphone — aucun code
        // secret MobilePay n'est demandé pour un dépôt (voir TopupDto).
        return operator === 'ORANGE' ? upfrontOtp.length >= 4 : true;
      default:
        return false;
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ status?: string; id?: string; transactionId?: string }>('/wallets/topup', {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          operator,
          accountNumber,
          amount: Math.round(Number(amount) * 100),
          // § Orange : code fourni EN AMONT (recommandation officielle HUB2)
          // pour ne pas consommer le délai d'expiration de 10 minutes.
          ...(operator === 'ORANGE' && upfrontOtp ? { otpCode: upfrontOtp } : {}),
        }),
      });

      if (res.status === 'SUCCESS') {
        setResult({
          status: 'success',
          message: `${Number(amount).toLocaleString('fr-FR')} FCFA ajoutés à ton wallet !`,
        });
      } else if (res.status === 'FAILED') {
        setResult({ status: 'failed', message: "Le dépôt n'a pas pu être effectué." });
      } else {
        // Cas normal : HUB2 est asynchrone. On lance le suivi du statut au
        // lieu de laisser l'écran figé sur un message d'attente.
        const txId = res.transactionId ?? res.id;
        if (txId) {
          setPendingTxId(txId);
          // § On n'invente PLUS l'action requise : HUB2 est asynchrone et
          // seul le webhook connaît le vrai type (lien Wave, code Orange,
          // invite USSD). Afficher un message générique en attendant faisait
          // que Wave restait bloqué sur la mauvaise consigne et n'affichait
          // jamais son lien. On montre donc un état d'attente neutre, que le
          // suivi remplace dès que le vrai type arrive.
          setNextAction({ type: 'waiting', message: '' });
          pollStatus(txId);
        } else {
          setResult({
            status: 'pending',
            message: "Vérifie ton téléphone et valide la demande avec ton code Mobile Money.",
          });
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec du dépôt.');
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = () => {
    if (step === STEPS.length - 1) submit();
    else setStep((s) => s + 1);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StepHeader
        title="💰 Alimenter mon wallet"
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
            <>
              <Text style={styles.hint}>
                Depuis quel compte Mobile Money veux-tu alimenter ton wallet ?
              </Text>
              {OPERATORS.map((o) => (
                <Pressable
                  key={o.id}
                  onPress={() => setOperator(o.id)}
                  style={[styles.choice, operator === o.id && styles.choiceActive]}
                >
                  <Text style={styles.choiceIcon}>{o.icon}</Text>
                  <Text style={styles.choiceLabel}>{o.label}</Text>
                  {operator === o.id && <Text style={styles.check}>✓</Text>}
                </Pressable>
              ))}
            </>
          )}

          {step === 1 && (
            <>
              <Text style={styles.hint}>
                Numéro du compte {OPERATORS.find((o) => o.id === operator)?.label} à débiter.
              </Text>
              <Input
                label="Numéro de téléphone"
                value={accountNumber}
                onChangeText={(v) => setAccountNumber(v.replace(/\D/g, ''))}
                placeholder="0700000000"
                keyboardType="phone-pad"
                maxLength={10}
              />
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.hint}>Quel montant veux-tu déposer ?</Text>
              <Input
                label="Montant (FCFA)"
                value={amount}
                onChangeText={(v) => setAmount(v.replace(/\D/g, ''))}
                placeholder="0"
                keyboardType="number-pad"
              />
            </>
          )}

          {step === 3 && (
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>🔍 Vérifie avant de continuer</Text>
              <Row k="Objet" v="Dépôt sur mon wallet" />
              <Row k="Opérateur" v={OPERATORS.find((o) => o.id === operator)?.label ?? ''} />
              <Row k="Compte débité" v={accountNumber} />
              <Row k="Montant" v={`${Number(amount).toLocaleString('fr-FR')} FCFA`} />
              <Row
                k="Frais de transaction"
                v={feeAmount !== null ? `${(feeAmount / 100).toLocaleString('fr-FR')} FCFA` : '...'}
              />
            </View>
          )}

          {step === 4 && operator === 'ORANGE' && (
            <>
              {/* § Parcours conforme à la doc Orange/HUB2 : le client génère
                  son code AVANT que le paiement ne parte, sinon le délai de
                  10 minutes imposé par Orange s'écoule et le paiement expire. */}
              <View style={styles.ussdBox}>
                <Text style={styles.ussdTitle}>1️⃣ Génère ton code Orange Money</Text>
                <Text style={styles.ussdText}>
                  Depuis ton téléphone Orange, compose :
                </Text>
                <Text style={styles.ussdCode}>#144*82#</Text>
                <Text style={styles.ussdText}>
                  puis choisis l'option pour obtenir ton code de paiement.
                </Text>
              </View>

              <Text style={[styles.hint, { marginTop: spacing.lg }]}>
                2️⃣ Saisis ci-dessous le code reçu pour valider le dépôt de{' '}
                {Number(amount).toLocaleString('fr-FR')} FCFA.
              </Text>
              <Input
                label="Code de paiement Orange Money"
                value={upfrontOtp}
                onChangeText={(v) => setUpfrontOtp(v.replace(/\D/g, ''))}
                placeholder="••••••"
                keyboardType="number-pad"
                maxLength={8}
                style={styles.pinInput}
                autoFocus
              />
            </>
          )}

          {step === 4 && operator !== 'ORANGE' && (
            <View style={styles.ussdBox}>
              <Text style={styles.ussdTitle}>📲 Validation sur ton téléphone</Text>
              <Text style={styles.ussdText}>
                {operator === 'WAVE'
                  ? "Un lien de paiement Wave va être généré. Tu pourras l'ouvrir directement ou l'envoyer par SMS/WhatsApp."
                  : `${OPERATORS.find((o) => o.id === operator)?.label} va t'envoyer une demande de confirmation sur ton téléphone. Valide-la avec ton code Mobile Money pour finaliser.`}
              </Text>
              <Text style={[styles.ussdText, { marginTop: spacing.sm, fontWeight: '700' }]}>
                Montant : {Number(amount).toLocaleString('fr-FR')} FCFA
              </Text>
            </View>
          )}

          <Button
            onPress={goNext}
            disabled={!canGoNext()}
            loading={submitting}
            style={{ marginTop: spacing.lg }}
          >
            {step === STEPS.length - 1 ? '✅ Valider le dépôt' : 'Continuer →'}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={!!nextAction} transparent animationType="fade">
        <View style={styles.actionOverlay}>
          <ScrollView
            contentContainerStyle={styles.actionScroll}
            keyboardShouldPersistTaps="handled"
          >
          <View style={styles.actionCard}>
            {nextAction?.type === 'waiting' && (
              <>
                <Text style={styles.actionIcon}>⏳</Text>
                <Text style={styles.actionTitle}>Connexion à l'opérateur…</Text>
                <Text style={styles.actionMessage}>
                  Nous préparons ton paiement. Reste sur cet écran quelques secondes.
                </Text>
              </>
            )}

            {nextAction && nextAction.type !== 'redirection' && nextAction.type !== 'waiting' && (
              <>
                <Text style={styles.actionIcon}>{nextAction?.type === 'otp' ? '🔢' : '📲'}</Text>
                <Text style={styles.actionTitle}>Action requise</Text>
                <Text style={styles.actionMessage}>{nextAction?.message}</Text>
              </>
            )}

            {nextAction?.type === 'redirection' && nextAction.url && (
              <WaveLinkActions url={nextAction.url} phone={accountNumber} />
            )}

            {nextAction?.type === 'otp' && (
              <>
                <Input
                  label="Code reçu"
                  value={otpCode}
                  onChangeText={(v) => setOtpCode(v.replace(/\D/g, ''))}
                  placeholder="••••••"
                  keyboardType="number-pad"
                  maxLength={8}
                  style={[styles.pinInput, { marginTop: spacing.lg }]}
                  autoFocus
                />
                <Button
                  onPress={submitOtp}
                  loading={otpSubmitting}
                  disabled={otpCode.length < 4}
                  style={{ alignSelf: 'stretch' }}
                >
                  Valider le code
                </Button>
              </>
            )}

            <Text style={styles.actionWaiting}>⏳ En attente de confirmation…</Text>
          </View>
          </ScrollView>
        </View>
      </Modal>

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

  ussdBox: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  ussdTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  ussdText: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  ussdCode: {
    fontSize: 30,
    fontWeight: '900',
    color: colors.accent,
    textAlign: 'center',
    marginVertical: spacing.sm,
    letterSpacing: 2,
  },

  actionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,45,82,0.45)',
  },
  actionScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  actionIcon: { fontSize: 44, marginBottom: spacing.sm },
  actionTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.textPrimary },
  actionMessage: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  actionWaiting: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
});
