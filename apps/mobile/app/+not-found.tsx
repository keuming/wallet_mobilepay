import { View, Text, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../src/components/ui';
import { colors, spacing, fontSize } from '../src/theme';

/**
 * Écran de repli pour toute route inexistante.
 *
 * Pendant le portage progressif du web vers le natif, beaucoup d'écrans ne
 * sont pas encore créés. Sans cet écran, l'utilisateur tombait sur un
 * "Unmatched route" brut et incompréhensible. On affiche plutôt un message
 * clair avec un retour possible.
 */
export default function NotFoundScreen() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.emoji}>🚧</Text>
        <Text style={styles.title}>Écran en cours de construction</Text>
        <Text style={styles.subtitle}>
          Cette section ({pathname}) n'est pas encore disponible dans l'application mobile.
          Elle reste accessible depuis la version web.
        </Text>
        <Button onPress={() => router.replace('/dashboard')} style={{ marginTop: spacing.xl }}>
          ← Retour à l'accueil
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emoji: { fontSize: 56, marginBottom: spacing.lg },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 21,
  },
});
