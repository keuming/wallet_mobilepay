import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/contexts/AuthContext';
import { ApiError } from '../src/lib/apiClient';
import { Button, Input, ErrorBanner } from '../src/components/ui';
import MPayIcon from '../src/components/MPayIcon';
import { colors, spacing, fontSize, radius } from '../src/theme';

/**
 * Écran de connexion — ÉCRAN DE RÉFÉRENCE pour le portage des 21 autres.
 *
 * Il illustre les conventions à suivre :
 *  - SafeAreaView (encoches/barres système)
 *  - KeyboardAvoidingView (le clavier ne doit jamais masquer un champ)
 *  - ScrollView (petits écrans : le contenu doit rester atteignable)
 *  - flux en 2 étapes identique au web (mot de passe puis code SMS)
 *  - états de chargement/erreur explicites
 */
export default function LoginScreen() {
  const { login, verifyLoginOtp } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [localNumber, setLocalNumber] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await login(localNumber, password, 'CI');
      // Le backend peut renvoyer directement les jetons si la vérification
      // SMS est temporairement désactivée (bascule SKIP_LOGIN_OTP).
      if (!res.requiresOtp && res.accessToken) {
        router.replace('/dashboard');
        return;
      }
      setMaskedPhone(res.maskedPhone ?? '');
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await verifyLoginOtp(localNumber, password, code, 'CI');
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Code invalide.');
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <MPayIcon size={34} style={{ marginRight: spacing.sm }} />
            <Text style={styles.brandText}>MobilePay CI</Text>
          </View>

          <Text style={styles.title}>Bon retour parmi nous</Text>
          <Text style={styles.subtitle}>
            {step === 'credentials'
              ? 'Connectez-vous pour accéder à votre wallet'
              : `Saisis le code envoyé par SMS au ${maskedPhone}`}
          </Text>

          {error && <ErrorBanner message={error} />}

          {step === 'credentials' ? (
            <>
              <Input
                label="Numéro de téléphone"
                value={localNumber}
                onChangeText={(v) => setLocalNumber(v.replace(/\D/g, ''))}
                placeholder="0700000000"
                keyboardType="phone-pad"
                maxLength={10}
                autoComplete="tel"
              />
              <Input
                label="Mot de passe"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••"
                secureTextEntry
                maxLength={6}
              />
              <Button
                onPress={handleLogin}
                loading={submitting}
                disabled={localNumber.length < 8 || password.length < 4}
              >
                Se connecter
              </Button>

              <Pressable onPress={() => router.push('/inscription')} style={styles.linkWrap}>
                <Text style={styles.linkMuted}>
                  Pas encore de compte ? <Text style={styles.link}>Créer un compte</Text>
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Input
                label="Code de connexion"
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
                placeholder="••••••"
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                style={styles.otpInput}
              />
              <Button onPress={handleVerifyOtp} loading={submitting} disabled={code.length < 4}>
                Confirmer et se connecter
              </Button>
              <Button
                variant="ghost"
                onPress={() => {
                  setStep('credentials');
                  setCode('');
                  setError(null);
                }}
                style={{ marginTop: spacing.sm }}
              >
                ← Retour
              </Button>
            </>
          )}

          <Text style={styles.copyright}>© {new Date().getFullYear()} ORZAYAH CI</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  brand: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    marginRight: spacing.sm,
  },
  brandText: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.textPrimary },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  otpInput: {
    textAlign: 'center',
    letterSpacing: 8,
    fontSize: fontSize.xl,
  },
  linkWrap: { marginTop: spacing.lg, alignItems: 'center' },
  linkMuted: { fontSize: fontSize.sm, color: colors.textSecondary },
  link: { color: colors.accent, fontWeight: '700' },
  copyright: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    opacity: 0.7,
    marginTop: spacing.xxl,
  },
});
