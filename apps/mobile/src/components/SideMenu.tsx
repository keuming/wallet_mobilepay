import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, fontSize, radius } from '../theme';

const { width } = Dimensions.get('window');
const PANEL_WIDTH = Math.min(width * 0.85, 340);

/** Sections du menu — reprises à l'identique de la version web. */
const SECTIONS: { items: { icon: string; label: string; route: string }[] }[] = [
  {
    items: [
      { icon: '👤', label: 'Profil', route: '/profil' },
      { icon: '📈', label: 'Déplafonner mon compte', route: '/deplafonnement' },
      { icon: '💬', label: 'Parler à un agent', route: '/agent' },
    ],
  },
  {
    items: [
      { icon: '🔒', label: 'Modifier mon code secret', route: '/code-secret' },
      { icon: '🏷️', label: 'Types de charges', route: '/categories-depenses' },
      { icon: '🗃️', label: 'Types de collecte', route: '/types-collecte' },
      { icon: '🥇', label: "Types d'épargne", route: '/types-epargne' },
      { icon: '📊', label: 'Relevé de dépenses', route: '/releve-depenses' },
    ],
  },
  {
    items: [{ icon: '📄', label: 'Conditions générales', route: '/cgu' }],
  },
];

export default function SideMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const go = (route: string) => {
    onClose();
    // Laisse le modal se fermer avant de naviguer — sinon la transition
    // saccade sur les appareils modestes.
    setTimeout(() => router.push(route as any), 150);
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <SafeAreaView style={styles.panel} edges={['top', 'bottom']}>
          {/* En-tête profil */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(user?.firstName?.charAt(0) ?? '') + (user?.lastName?.charAt(0) ?? '')}
                </Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {user?.firstName} {user?.lastName}
            </Text>
            <Text style={styles.phone}>{user?.phone}</Text>
          </View>

          <ScrollView contentContainerStyle={{ paddingVertical: spacing.sm }}>
            {SECTIONS.map((section, i) => (
              <View key={i}>
                {i > 0 && <View style={styles.divider} />}
                {section.items.map((item) => (
                  <Pressable
                    key={item.route}
                    style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                    onPress={() => go(item.route)}
                  >
                    <Text style={styles.itemIcon}>{item.icon}</Text>
                    <Text style={styles.itemLabel}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            ))}

            <View style={styles.divider} />

            <Pressable
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              onPress={() => {
                onClose();
                setTimeout(() => logout(), 150);
              }}
            >
              <Text style={styles.itemIcon}>⏻</Text>
              <Text style={[styles.itemLabel, { color: colors.error }]}>Déconnexion</Text>
            </Pressable>

            <Text style={styles.copyright}>© {new Date().getFullYear()} ORZAYAH CI</Text>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 45, 82, 0.35)',
  },
  panel: {
    width: PANEL_WIDTH,
    backgroundColor: colors.surface,
    height: '100%',
  },
  header: {
    backgroundColor: '#9fe8c4',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: fontSize.xl },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: fontSize.lg, color: colors.textPrimary },
  name: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  phone: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 2 },

  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  itemPressed: { backgroundColor: colors.accentSoft },
  itemIcon: { fontSize: 20, width: 26, textAlign: 'center' },
  itemLabel: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },

  copyright: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    opacity: 0.7,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
});
