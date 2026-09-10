import { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button } from './ui';
import { colors, spacing, fontSize, radius } from '../theme';

/**
 * Scanner de QR code.
 *
 * § C'est la fonction attendue d'une application de paiement : présenter son
 * téléphone devant le QR d'un marchand plutôt que recopier un code à la
 * main. La saisie manuelle reste disponible en repli (QR abîmé, caméra
 * refusée, code reçu par message).
 *
 * Le contenu scanné peut être un code brut (MPU…) ou une URL
 * pay.mobilepay-ci.com/u/CODE : les deux sont acceptés, car un même QR est
 * lisible par n'importe quelle application appareil photo.
 */
export default function QrScanner({
  visible,
  onClose,
  onScanned,
}: {
  visible: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [handled, setHandled] = useState(false);

  /** Extrait le code, que le QR contienne une URL complète ou le code seul. */
  const extractCode = (raw: string): string => {
    const value = raw.trim();
    const match = value.match(/\/(?:u|q|p)\/([^/?#]+)/i);
    if (match) return match[1].toUpperCase();
    return value.toUpperCase();
  };

  const handleScan = ({ data }: { data: string }) => {
    // Un scan déclenche plusieurs lectures par seconde : sans ce garde, on
    // enchaînerait autant de navigations.
    if (handled) return;
    setHandled(true);
    onScanned(extractCode(data));
    onClose();
    setTimeout(() => setHandled(false), 800);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {!permission ? (
          <View style={styles.center}>
            <Text style={styles.message}>Préparation de la caméra…</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.center}>
            <Text style={styles.icon}>📷</Text>
            <Text style={styles.title}>Autoriser la caméra</Text>
            <Text style={styles.message}>
              MobilePay a besoin de la caméra uniquement pour lire les QR codes de
              paiement. Aucune image n'est enregistrée ni transmise.
            </Text>
            <Button onPress={requestPermission} style={{ alignSelf: 'stretch', marginTop: spacing.lg }}>
              Autoriser
            </Button>
            <Button variant="ghost" onPress={onClose} style={{ alignSelf: 'stretch', marginTop: spacing.sm }}>
              Saisir le code à la main
            </Button>
          </View>
        ) : (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleScan}
            />

            {/* Cadre de visée : indique où présenter le QR. */}
            <View style={styles.overlay} pointerEvents="none">
              <View style={styles.frame} />
              <Text style={styles.hint}>Place le QR code dans le cadre</Text>
            </View>

            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.bg,
  },
  icon: { fontSize: 52, marginBottom: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.textPrimary },
  message: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    backgroundColor: 'transparent',
  },
  hint: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '600',
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 50,
    right: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: fontSize.xl, fontWeight: '700' },
});
