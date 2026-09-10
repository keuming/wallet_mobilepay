import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Share,
  Linking,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch, ApiError } from '../src/lib/apiClient';
import { Button, Input, ErrorBanner } from '../src/components/ui';
import { colors, spacing, fontSize, radius, shadow } from '../src/theme';

interface PersonalQr {
  code: string;
  url: string;
  /** Image du QR déjà générée par le serveur (data URL) — rien à calculer ici. */
  imageDataUrl: string;
}

/**
 * Recevoir de l'argent d'une autre personne.
 *
 * Le lien pointe vers pay.mobilepay-ci.com : le payeur n'a besoin d'AUCUN
 * compte MobilePay, il règle depuis son propre Mobile Money et le montant
 * arrive sur le wallet du titulaire du lien.
 */
export default function RecevoirPersonneScreen() {
  const router = useRouter();

  const [qr, setQr] = useState<PersonalQr | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [smsLocal, setSmsLocal] = useState('');
  const [sending, setSending] = useState(false);
  const [sentSms, setSentSms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PersonalQr>('/users/me/qr')
      .then(setQr)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de charger ton lien.'),
      )
      .finally(() => setLoading(false));
  }, []);

  // Le montant est optionnel : sans lui, le payeur saisit ce qu'il veut.
  const requestLink =
    amount && qr ? `${qr.url}?montant=${Math.round(Number(amount) * 100)}` : qr?.url;

  const message = amount
    ? `Merci de m'envoyer ${Number(amount).toLocaleString('fr-FR')} FCFA via MobilePay : ${requestLink}`
    : `Envoie-moi de l'argent via MobilePay : ${requestLink}`;

  const shareNative = () => {
    if (!requestLink) return;
    Share.share({ message });
  };

  const shareWhatsApp = async () => {
    if (!requestLink) return;
    const waUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
    const ok = await Linking.canOpenURL(waUrl).catch(() => false);
    if (ok) Linking.openURL(waUrl);
    else Share.share({ message }); // repli : partage système
  };

  const sendSms = async () => {
    if (!requestLink || smsLocal.length < 8) return;
    setSending(true);
    setError(null);
    try {
      await apiFetch('/sms/send-link', {
        method: 'POST',
        body: JSON.stringify({
          toPhone: smsLocal,
          url: requestLink,
          label: amount
            ? `ma demande de ${Number(amount).toLocaleString('fr-FR')} FCFA`
            : 'mon lien de réception',
        }),
      });
      setSentSms(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Le SMS n'a pas pu être envoyé.");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>🤝 Recevoir</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {error && <ErrorBanner message={error} />}

          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxl }} />
          ) : qr ? (
            <>
              <View style={styles.qrCard}>
                <Text style={styles.qrHint}>
                  Fais scanner ce code, ou partage le lien ci-dessous.
                </Text>
                <Image source={{ uri: qr.imageDataUrl }} style={styles.qrImage} />
                <Text style={styles.qrCode}>{qr.code}</Text>
              </View>

              <Input
                label="Montant à demander (optionnel)"
                value={amount}
                onChangeText={(v) => {
                  setAmount(v.replace(/\D/g, ''));
                  setSentSms(false);
                }}
                placeholder="Laisse vide pour un montant libre"
                keyboardType="number-pad"
              />

              <View style={styles.linkBox}>
                <Text style={styles.linkLabel}>Ton lien de réception</Text>
                <Text style={styles.linkValue} numberOfLines={2}>
                  {requestLink}
                </Text>
              </View>

              <Text style={styles.sectionLabel}>Partager le lien</Text>

              <Button onPress={shareNative} style={{ alignSelf: 'stretch' }}>
                📤 Partager
              </Button>

              <Button
                variant="ghost"
                onPress={shareWhatsApp}
                style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
              >
                🟢 Envoyer par WhatsApp
              </Button>

              <View style={styles.smsBox}>
                <Input
                  label="Envoyer par SMS"
                  value={smsLocal}
                  onChangeText={(v) => {
                    setSmsLocal(v.replace(/\D/g, ''));
                    setSentSms(false);
                  }}
                  placeholder="0700000000"
                  keyboardType="phone-pad"
                  maxLength={10}
                />
                <Button
                  variant="ghost"
                  onPress={sendSms}
                  loading={sending}
                  disabled={smsLocal.length < 8}
                  style={{ alignSelf: 'stretch' }}
                >
                  {sentSms ? '✓ SMS envoyé' : '💬 Envoyer le SMS'}
                </Button>
              </View>

              <Text style={styles.note}>
                La personne qui paie n'a pas besoin d'un compte MobilePay : elle règle
                depuis son propre Mobile Money, et le montant arrive sur ton wallet.
              </Text>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
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

  qrCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  qrHint: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  qrImage: { width: 200, height: 200, borderRadius: radius.sm },
  qrCode: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 2,
    marginTop: spacing.md,
  },

  linkBox: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  linkLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary },
  linkValue: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    marginTop: 4,
    fontWeight: '600',
  },

  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  smsBox: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  note: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
