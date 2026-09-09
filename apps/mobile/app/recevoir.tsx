import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, radius } from '../src/theme';

/** Deux façons de recevoir de l'argent — identique au web. */
const OPTIONS = [
  {
    icon: '💰',
    title: 'Alimenter mon wallet',
    subtitle: 'Depuis mon compte Mobile Money',
    route: '/recevoir-wallet',
    featured: true,
  },
  {
    icon: '🤝',
    title: "Recevoir d'une personne",
    subtitle: 'Partager mon lien ou mon QR de réception',
    route: '/recevoir-personne',
    featured: false,
  },
] as const;

export default function RecevoirScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>💰 Dépôt</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {OPTIONS.map((o) => (
          <Pressable
            key={o.route}
            onPress={() => router.push(o.route as any)}
            style={({ pressed }) => [
              styles.card,
              o.featured && styles.cardFeatured,
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.icon}>{o.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, o.featured && { color: '#fff' }]}>{o.title}</Text>
              <Text style={[styles.cardSubtitle, o.featured && { color: 'rgba(255,255,255,0.85)' }]}>
                {o.subtitle}
              </Text>
            </View>
            <Text style={[styles.chevron, o.featured && { color: '#fff' }]}>→</Text>
          </Pressable>
        ))}
      </ScrollView>
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
  scroll: { padding: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  cardFeatured: { backgroundColor: colors.accent, borderColor: colors.accent },
  icon: { fontSize: 28 },
  cardTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.textPrimary },
  cardSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  chevron: { fontSize: fontSize.lg, color: colors.textSecondary },
});
