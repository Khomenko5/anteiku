import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme/colors';

export default function UserCard({ item, onPress, rightIconName = "chevron-forward", rightIconColor = COLORS.primary }) {
  const isGuild = item.isGuild;

  return (
    <TouchableOpacity 
      style={[styles.card, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} 
      onPress={onPress}
    >
      {isGuild ? (
        <View style={[styles.avatarPlaceholder, {backgroundColor: COLORS.primary}]}>
          <Ionicons name="shield" size={24} color={COLORS.background} />
        </View>
      ) : item.avatarUrl ? (
        <Image source={{ uri: item.avatarUrl }} style={styles.avatar} resizeMode="cover" />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {item.nickname ? item.nickname[0].toUpperCase() : '?'}
          </Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={[styles.name, isGuild && {color: COLORS.primary}]}>
          {item.nickname}
        </Text>
        <Text style={styles.tag}>
          {isGuild ? `Гільдія [${item.guildTag}]` : (item.guildTag ? `[${item.guildTag}]` : 'Вільний агент')}
        </Text>
      </View>

      {rightIconName && (
        <Ionicons name={rightIconName} size={24} color={rightIconColor} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border }, 
  avatar: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, borderColor: COLORS.primary },
  avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, backgroundColor: COLORS.surfaceLight, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.primary },
  avatarText: { color: COLORS.textSecondary, fontSize: 20, fontWeight: 'bold' },
  info: { marginLeft: 15, flex: 1 },
  name: { color: COLORS.text, fontSize: 16, fontWeight: 'bold' }, 
  tag: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
});