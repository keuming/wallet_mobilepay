import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/contexts/AuthContext';
import { apiFetch, ApiError } from '../src/lib/apiClient';
import { Button, Input, ErrorBanner } from '../src/components/ui';
import { colors, spacing, fontSize, radius, shadow } from '../src/theme';

interface FullProfile {
  id: string;
  phone: string;
  email?: string | null;
  firstName: string;
  lastName: string;
  role: string;
  kycLevel: string;
  country: string;
  createdAt: string;
}

const KYC_LABELS: Record<string, { label: string; color: string }> = {
  LEVEL_0: { label: 'Non vérifié', color: colors.warning },
  LEVEL_1: { label: 'Vérifié — niveau 1', color: colors.pending },
  LEVEL_2: { label: 'Vérifié — niveau 2', color: colors.success },
  LEVEL_3: { label: 'Vérifié — niveau 3', color: colors.success },
};

export default function ProfilScreen() {
  const router = useRouter();
  const { logout, refreshProfile } = useAuth();

  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch<FullProfile>('/users/me')
      .then((p) => {
        setProfile(p);
        setFirstName(p.firstName);
        setLastName(p.lastName);
        setEmail(p.email ?? '');
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de charger le profil.'),
      )
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiFetch<FullProfile>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
          firstName,
          lastName,
          // Un email vide doit effacer la valeur, pas envoyer une chaîne vide.
          email: email.trim() || undefined,
        }),
      });
      setProfile(updated);
      setEditing(false);
      setSaved(true);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de la mise à jour.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const kyc = KYC_LABELS[profile?.kycLevel ?? ''] ?? {
    label: profile?.kycLevel ?? '—',
    color: colors.textSecondary,
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>👤 Profil</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {error && <ErrorBanner message={error} />}

          <View style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(profile?.firstName?.charAt(0) ?? '') + (profile?.lastName?.charAt(0) ?? '')}
              </Text>
            </View>
            <Text style={styles.name}>
              {profile?.firstName} {profile?.lastName}
            </Text>
            <Text style={styles.phone}>{profile?.phone}</Text>
            <View style={[styles.kycBadge, { backgroundColor: kyc.color + '22' }]}>
              <Text style={[styles.kycText, { color: kyc.color }]}>{kyc.label}</Text>
            </View>
          </View>

          {editing ? (
            <>
              <Input label="Prénom" value={firstName} onChangeText={setFirstName} />
              <Input label="Nom" value={lastName} onChangeText={setLastName} />
              <Input
                label="Email (optionnel)"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="exemple@email.com"
              />
              <Button onPress={save} loading={saving} style={{ alignSelf: 'stretch' }}>
                Enregistrer
              </Button>
              <Button
                variant="ghost"
                onPress={() => {
                  setEditing(false);
                  setFirstName(profile?.firstName ?? '');
                  setLastName(profile?.lastName ?? '');
                  setEmail(profile?.email ?? '');
                  setError(null);
                }}
                style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
              >
                Annuler
              </Button>
            </>
          ) : (
            <>
              <View style={styles.infoBox}>
                <Row k="Email" v={profile?.email || 'Non renseigné'} />
                <Row k="Pays" v={profile?.country ?? '—'} />
                <Row
                  k="Membre depuis"
                  v={
                    profile?.createdAt
                      ? new Date(profile.createdAt).toLocaleDateString('fr-FR', {
                          month: 'long',
                          year: 'numeric',
                        })
                      : '—'
                  }
                />
              </View>

              {saved && <Text style={styles.saved}>✓ Profil mis à jour</Text>}

              <Button onPress={() => setEditing(true)} style={{ alignSelf: 'stretch' }}>
                Modifier mes informations
              </Button>

              <Button
                variant="ghost"
                onPress={() => router.push('/code-secret')}
                style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
              >
                🔒 Modifier mon code secret
              </Button>

              <Button
                variant="ghost"
                onPress={() => router.push('/deplafonnement')}
                style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
              >
                📈 Déplafonner mon compte
              </Button>

              <Pressable onPress={logout} style={styles.logout}>
                <Text style={styles.logoutText}>⏻ Déconnexion</Text>
              </Pressable>
            </>
          )}

          <Text style={styles.copyright}>© {new Date().getFullYear()} ORZAYAH CI</Text>
        </ScrollView>
      </KeyboardAvoidingView>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
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

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: fontSize.xl },
  name: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  phone: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 2 },
  kycBadge: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  kycText: { fontSize: fontSize.xs, fontWeight: '800' },

  infoBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
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
  saved: {
    color: colors.success,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  logout: { marginTop: spacing.xl, alignItems: 'center', padding: spacing.md },
  logoutText: { color: colors.error, fontSize: fontSize.md, fontWeight: '700' },
  copyright: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    opacity: 0.7,
    marginTop: spacing.lg,
  },
});
