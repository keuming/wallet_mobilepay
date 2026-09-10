import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Input } from './ui';
import { colors, spacing, fontSize, radius } from '../theme';

export interface CountryOption {
  code: string;
  name: string;
  dialCode?: string;
}

/**
 * Sélecteur de pays commun à tous les parcours.
 *
 * § MobilePay agrège des fournisseurs à couverture mondiale : le pays
 * détermine quels opérateurs, quels tarifs et quelles règles s'appliquent.
 * Il est donc central pour CHAQUE service, pas un détail de configuration.
 *
 * La liste proposée dépend du fournisseur qui traitera l'opération : HUB2
 * couvre 15 pays en mobile money, Reloadly plus de 190 pour le crédit
 * téléphonique. Proposer un pays non couvert conduirait à un échec après
 * saisie — on ne montre donc que ce qui fonctionnera réellement.
 */
export default function CountryPicker({
  countries,
  value,
  onChange,
  label = 'Pays',
  helper,
}: {
  countries: CountryOption[];
  value: string;
  onChange: (code: string) => void;
  label?: string;
  helper?: string;
}) {
  const [query, setQuery] = useState('');

  const selected = countries.find((c) => c.code === value);

  // Sans recherche, on n'affiche que le pays retenu : dérouler la liste
  // complète (jusqu'à 190 entrées) serait illisible sur un téléphone.
  const visible = query.trim()
    ? countries
        .filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 30)
    : selected
      ? [selected]
      : countries.slice(0, 10);

  return (
    <View>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}

      <Input
        label={label}
        value={query}
        onChangeText={setQuery}
        placeholder="Rechercher un pays…"
      />

      <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {visible.map((c) => (
          <Pressable
            key={c.code}
            onPress={() => {
              onChange(c.code);
              setQuery('');
            }}
            style={[styles.row, value === c.code && styles.rowActive]}
          >
            <Text style={styles.flag}>🌍</Text>
            <Text style={styles.name}>{c.name}</Text>
            {c.dialCode ? <Text style={styles.dial}>+{c.dialCode}</Text> : null}
            {value === c.code && <Text style={styles.check}>✓</Text>}
          </Pressable>
        ))}

        {query.trim() && visible.length === 0 && (
          <Text style={styles.empty}>
            Aucun pays trouvé. Ce service n'est peut-être pas disponible là-bas.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  helper: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 19,
  },
  list: { maxHeight: 320 },
  row: {
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
  rowActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  flag: { fontSize: 20 },
  name: { flex: 1, fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  dial: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  check: { color: colors.accent, fontSize: fontSize.lg, fontWeight: '800' },
  empty: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
