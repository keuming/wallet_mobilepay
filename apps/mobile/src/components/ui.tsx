import { ReactNode } from 'react';
import {
  Text,
  TextInput,
  Pressable,
  View,
  ActivityIndicator,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing, fontSize, shadow } from '../theme';

/**
 * Composants de base — équivalents natifs des classes CSS du web
 * (mp-btn-primary, mp-input, mp-error...). Les centraliser ici évite de
 * redéfinir les mêmes styles dans chacun des 22 écrans à porter.
 */

export function Button({
  children,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'ghost' | 'gold';
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' && styles.btnPrimary,
        variant === 'ghost' && styles.btnGhost,
        variant === 'gold' && styles.btnGold,
        isDisabled && styles.btnDisabled,
        pressed && !isDisabled && styles.btnPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'ghost' ? colors.textPrimary : '#fff'} />
      ) : (
        <Text
          style={[
            styles.btnText,
            variant === 'ghost' && { color: colors.textPrimary },
            variant === 'gold' && { color: '#3d2b00' },
          ]}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}

export function Input({ label, error, ...props }: TextInputProps & { label?: string; error?: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, error && { borderColor: colors.error }]}
        {...props}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorBannerText}>{message}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  btnGold: { backgroundColor: colors.gold },
  btnDisabled: { opacity: 0.5 },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  btnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700' },

  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs + 2,
  },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  errorText: { color: colors.error, fontSize: fontSize.xs, marginTop: spacing.xs },

  errorBanner: {
    backgroundColor: 'rgba(239, 92, 92, 0.1)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorBannerText: { color: colors.error, fontSize: fontSize.sm, fontWeight: '600' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
});
