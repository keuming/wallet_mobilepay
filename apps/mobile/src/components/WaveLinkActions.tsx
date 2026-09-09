import { useState } from 'react';
import { View, Text, StyleSheet, Linking, Alert, Share } from 'react-native';
import { apiFetch, ApiError } from '../lib/apiClient';
import { Button } from './ui';
import { colors, spacing, fontSize, radius } from '../theme';

/**
 * Options de transmission du lien de paiement Wave.
 *
 * § Conforme à la doc HUB2 : Wave utilise `nextAction.type = "redirection"`
 * avec une URL `pay.wave.com` à ouvrir par le payeur. Le lien expire vite
 * (constaté en production : "wave_payment_expired"), d'où l'importance de
 * proposer le canal le plus rapide selon la situation :
 *   - le payeur est la personne devant l'écran  → ouverture directe
 *   - le payeur est quelqu'un d'autre           → SMS ou WhatsApp
 */
export default function WaveLinkActions({
  url,
  phone,
  label = 'ton lien de paiement Wave',
  onCheckNow,
}: {
  url: string;
  phone?: string;
  label?: string;
  /** Vérification immédiate du paiement, sans attendre le cycle de sondage. */
  onCheckNow?: () => void;
}) {
  const [sending, setSending] = useState<'sms' | null>(null);
  const [sentSms, setSentSms] = useState(false);

  const openDirect = () => {
    Linking.openURL(url).catch(() =>
      Alert.alert('Impossible d\'ouvrir le lien', "Vérifie que l'application Wave est installée."),
    );
  };

  const sendBySms = async () => {
    if (!phone) {
      Alert.alert('Numéro manquant', 'Aucun numéro de téléphone à qui envoyer le lien.');
      return;
    }
    setSending('sms');
    try {
      await apiFetch('/sms/send-link', {
        method: 'POST',
        body: JSON.stringify({ toPhone: phone, url, label }),
      });
      setSentSms(true);
    } catch (err) {
      Alert.alert(
        "Échec de l'envoi",
        err instanceof ApiError ? err.message : "Le SMS n'a pas pu être envoyé.",
      );
    } finally {
      setSending(null);
    }
  };

  const sendByWhatsApp = async () => {
    const text = encodeURIComponent(`MobilePay CI : voici ${label} — ${url}`);
    // Si un numéro est connu, on ouvre directement la conversation ; sinon
    // WhatsApp propose de choisir le destinataire.
    const waUrl = phone
      ? `whatsapp://send?phone=${phone.replace(/\D/g, '')}&text=${text}`
      : `whatsapp://send?text=${text}`;

    const supported = await Linking.canOpenURL(waUrl).catch(() => false);
    if (supported) {
      Linking.openURL(waUrl);
    } else {
      // Repli : le partage natif du système (WhatsApp y figure s'il est installé)
      Share.share({ message: `MobilePay CI : voici ${label} — ${url}` });
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>🌊 Paiement Wave</Text>
      <Text style={styles.subtitle}>
        Le lien de validation Wave est prêt. Attention : il expire rapidement, à utiliser
        sans tarder.
      </Text>

      <Button onPress={openDirect} style={{ alignSelf: 'stretch', marginTop: spacing.lg }}>
        Ouvrir le lien maintenant
      </Button>

      <Text style={styles.orLabel}>ou transmettre au payeur</Text>

      <Button
        variant="ghost"
        onPress={sendBySms}
        loading={sending === 'sms'}
        style={{ alignSelf: 'stretch' }}
      >
        {sentSms ? '✓ SMS envoyé' : '💬 Envoyer par SMS'}
      </Button>

      <Button
        variant="ghost"
        onPress={sendByWhatsApp}
        style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
      >
        🟢 Envoyer par WhatsApp
      </Button>

      {onCheckNow && (
        <Button
          variant="ghost"
          onPress={onCheckNow}
          style={{ alignSelf: 'stretch', marginTop: spacing.lg }}
        >
          ✓ J'ai payé — vérifier maintenant
        </Button>
      )}

      <Text style={styles.soon}>✉️ Envoi par e-mail — bientôt disponible</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.textPrimary },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  orLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginVertical: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  soon: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    opacity: 0.6,
    marginTop: spacing.md,
  },
});
