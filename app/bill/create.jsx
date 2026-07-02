import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, FlatList, Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../constants/theme';

const MAX_PERSONS_STANDARD = 3;

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Module-level: persists across re-renders and fast-refresh so the code
// never changes unless the user presses Regenerate or a bill is created.
let _pendingInviteCode = generateCode();

export default function CreateBill() {
  const { user, profile } = useAuth();
  const [billName, setBillName] = useState('');
  const [billNameError, setBillNameError] = useState('');
  const [inviteCode, setInviteCode] = useState(() => _pendingInviteCode);
  const [createError, setCreateError] = useState('');
  const [participants, setParticipants] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const isStandard = profile?.account_type === 'standard';
  const maxParticipants = isStandard ? MAX_PERSONS_STANDARD - 1 : Infinity; // Excluding host

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, username, nickname')
      .or(`username.ilike.%${searchQuery.trim()}%,first_name.ilike.%${searchQuery.trim()}%,last_name.ilike.%${searchQuery.trim()}%`)
      .neq('id', user.id)
      .limit(10);
    setSearchResults(data || []);
    setSearchLoading(false);
  }

  function handleAddParticipant(person) {
    if (participants.find((p) => p.id === person.id)) {
      Alert.alert('Already Added', 'This user is already added to the bill.');
      return;
    }
    if (isStandard && participants.length >= maxParticipants) {
      Alert.alert(
        'Participant Limit Reached',
        `Standard accounts allow a maximum of ${MAX_PERSONS_STANDARD} persons per bill (including you as host). Upgrade to Premium for unlimited participants.`
      );
      return;
    }
    setParticipants((prev) => [...prev, person]);
    setSearchModalVisible(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  function handleRemoveParticipant(personId) {
    setParticipants((prev) => prev.filter((p) => p.id !== personId));
  }

  async function handleSave() {
    if (!billName.trim()) {
      setBillNameError('Bill name is required.');
      return;
    }
    setBillNameError('');
    setCreateError('');
    setSaving(true);

    const { data: bill, error } = await supabase
      .from('bills')
      .insert({
        name: billName.trim(),
        invitation_code: inviteCode,
        host_id: user.id,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      setSaving(false);
      const msg = error.message || 'Failed to create bill.';
      setCreateError(msg);
      Alert.alert('Error', msg);
      return;
    }

    // Add participants
    if (participants.length > 0) {
      await supabase.from('bill_participants').insert(
        participants.map((p) => ({
          bill_id: bill.id,
          user_id: p.id,
          status: 'pending',
        }))
      );
    }

    setSaving(false);
    _pendingInviteCode = generateCode(); // Pre-generate code for next new bill
    router.replace(`/bill/${bill.id}`);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Bill Name */}
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Ionicons name="pencil-outline" size={16} color={colors.primary} />
            <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Bill Details</Text>
          </View>
          <Input
            label="Bill Name *"
            value={billName}
            onChangeText={setBillName}
            placeholder="e.g. Friday Dinner, Beach Trip"
            error={billNameError}
            autoCapitalize="words"
          />
        </View>

        {/* Invitation Code */}
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Ionicons name="key-outline" size={16} color={colors.primary} />
            <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Invitation Code</Text>
          </View>
          <Text style={styles.cardSubtitle}>Share this code with friends so they can join this bill.</Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{inviteCode}</Text>
            <TouchableOpacity
              style={styles.regenBtn}
              onPress={() => { const c = generateCode(); _pendingInviteCode = c; setInviteCode(c); }}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh" size={18} color={colors.primary} />
              <Text style={styles.regenBtnText}>Regenerate</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Participants */}
        <View style={styles.card}>
          <View style={styles.participantsHeader}>
            <View>
              <View style={styles.titleRow}>
                <Ionicons name="people-outline" size={16} color={colors.primary} />
                <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Involved Persons</Text>
              </View>
              <Text style={styles.cardSubtitle}>
                {isStandard
                  ? `Max ${MAX_PERSONS_STANDARD} total (you + ${maxParticipants} others)`
                  : 'No limit — Premium account'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.addPersonBtn}
              onPress={() => setSearchModalVisible(true)}
              disabled={isStandard && participants.length >= maxParticipants}
            >
              <Ionicons name="person-add-outline" size={16} color={isStandard && participants.length >= maxParticipants ? colors.textLight : colors.primary} />
              <Text style={[styles.addPersonBtnText, isStandard && participants.length >= maxParticipants && { color: colors.textLight }]}>
                Add Person
              </Text>
            </TouchableOpacity>
          </View>

          {/* Host (you) */}
          <View style={styles.personRow}>
            <View style={styles.personAvatar}>
              <Text style={styles.personAvatarText}>
                {(profile?.first_name?.[0] || '').toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.personName}>{profile?.first_name} {profile?.last_name}</Text>
              <Text style={styles.personUsername}>@{profile?.username} · Host (you)</Text>
            </View>
            <View style={styles.hostTag}>
              <Text style={styles.hostTagText}>Host</Text>
            </View>
          </View>

          {participants.map((person) => (
            <View key={person.id} style={styles.personRow}>
              <View style={[styles.personAvatar, { backgroundColor: colors.successLight }]}>
                <Text style={[styles.personAvatarText, { color: colors.success }]}>
                  {(person.first_name?.[0] || '').toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.personName}>{person.first_name} {person.last_name}</Text>
                <Text style={styles.personUsername}>@{person.username}</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleRemoveParticipant(person.id)}
                style={styles.removeBtn}
              >
                <Ionicons name="close-circle" size={22} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}

          {participants.length === 0 && (
            <Text style={styles.noParticipants}>
              No participants added yet. Use "Add Person" to invite registered users.
            </Text>
          )}
        </View>

        <Button title="Create Bill" onPress={handleSave} loading={saving} size="lg" style={styles.saveBtn} />
        {createError ? <Text style={styles.createError}>{createError}</Text> : null}
        <Button title="Cancel" onPress={() => router.replace('/(tabs)/home')} variant="ghost" style={styles.cancelBtn} />
      </ScrollView>

      {/* Search User Modal */}
      <Modal
        visible={searchModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setSearchModalVisible(false); setSearchQuery(''); setSearchResults([]); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Person</Text>
              <TouchableOpacity onPress={() => { setSearchModalVisible(false); setSearchQuery(''); setSearchResults([]); }}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Search for registered users by username or name.</Text>

            <View style={styles.searchBox}>
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search username or name..."
                placeholderTextColor={colors.textLight}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
              <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
                {searchLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="search" size={18} color="#fff" />
                }
              </TouchableOpacity>
            </View>

            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              style={styles.resultsList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.resultRow}
                  onPress={() => handleAddParticipant(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.resultAvatar}>
                    <Text style={styles.resultAvatarText}>{item.first_name?.[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultName}>{item.first_name} {item.last_name}</Text>
                    <Text style={styles.resultUsername}>@{item.username} · {item.nickname}</Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={() => (
                searchQuery && !searchLoading
                  ? <Text style={styles.noResults}>No users found. Try a different search term.</Text>
                  : null
              )}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.md, ...shadow.sm,
  },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  cardSubtitle: { fontSize: fontSize.xs, color: colors.textSecondary, marginBottom: spacing.md },
  codeBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primaryLight, borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  codeText: { fontSize: fontSize.xl, fontWeight: '800', color: colors.primary, letterSpacing: 4 },
  regenBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  regenBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  participantsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  addPersonBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.primaryLight, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  addPersonBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
  personRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  personAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  personAvatarText: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary },
  personName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  personUsername: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  hostTag: {
    backgroundColor: colors.primaryLight, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  hostTagText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary },
  removeBtn: { padding: spacing.xs },
  noParticipants: { fontSize: fontSize.sm, color: colors.textSecondary, fontStyle: 'italic', marginTop: spacing.xs },
  saveBtn: { marginBottom: spacing.sm },
  createError: { color: colors.error, fontSize: fontSize.sm, textAlign: 'center', marginBottom: spacing.sm },
  cancelBtn: {},
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl, maxHeight: '75%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  modalSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md },
  searchBox: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  searchInput: {
    flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: borderRadius.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    fontSize: fontSize.md, color: colors.text,
  },
  searchBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center',
  },
  resultsList: { maxHeight: 300 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  resultAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  resultAvatarText: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary },
  resultName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  resultUsername: { fontSize: fontSize.xs, color: colors.textSecondary },
  noResults: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.lg },
});
