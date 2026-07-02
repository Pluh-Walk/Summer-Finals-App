import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, FlatList, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';
import Input from '../../../components/Input';
import Button from '../../../components/Button';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../constants/theme';

const MAX_PERSONS_STANDARD = 3;

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function EditBill() {
  const { id } = useLocalSearchParams();
  const { user, profile } = useAuth();
  const [bill, setBill] = useState(null);
  const [billName, setBillName] = useState('');
  const [billNameError, setBillNameError] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [participants, setParticipants] = useState([]);
  const [pendingParticipants, setPendingParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchModalVisible, setSearchModalVisible] = useState(false);

  const isStandard = profile?.account_type === 'standard';

  useEffect(() => {
    fetchBill();
  }, [id]);

  async function fetchBill() {
    const { data } = await supabase
      .from('bills')
      .select(`
        *,
        host:profiles!bills_host_id_fkey(id, first_name, last_name, username),
        bill_participants(id, status, user:profiles(id, first_name, last_name, username))
      `)
      .eq('id', id)
      .single();

    if (data) {
      setBill(data);
      setBillName(data.name);
      setInviteCode(data.invitation_code);
      const accepted = (data.bill_participants || []).filter((p) => p.status === 'accepted');
      const pending = (data.bill_participants || []).filter((p) => p.status === 'pending');
      setParticipants(accepted.map((p) => ({ ...p.user, participantRecordId: p.id })));
      setPendingParticipants(pending.map((p) => ({ ...p.user, participantRecordId: p.id })));
    }
    setLoading(false);
  }

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

  async function handleAddParticipant(person) {
    if (participants.find((p) => p.id === person.id) || pendingParticipants.find((p) => p.id === person.id)) {
      Alert.alert('Already Added', 'This user is already in or invited to this bill.');
      return;
    }
    const totalPersons = participants.length + pendingParticipants.length + 1; // +1 for host
    if (isStandard && totalPersons >= MAX_PERSONS_STANDARD) {
      Alert.alert('Limit Reached', `Standard accounts allow max ${MAX_PERSONS_STANDARD} persons per bill.`);
      return;
    }

    const { error } = await supabase.from('bill_participants').insert({
      bill_id: id, user_id: person.id, status: 'pending',
    });
    if (!error) {
      setPendingParticipants((prev) => [...prev, person]);
    }
    setSearchModalVisible(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  async function handleRemoveParticipant(personId, participantRecordId) {
    Alert.alert('Remove Participant', 'Remove this person from the bill?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await supabase.from('bill_participants').delete().eq('id', participantRecordId);
          setParticipants((prev) => prev.filter((p) => p.id !== personId));
          setPendingParticipants((prev) => prev.filter((p) => p.id !== personId));
        },
      },
    ]);
  }

  async function handleRegenerateCode() {
    const newCode = generateCode();
    setInviteCode(newCode);
  }

  async function handleSave() {
    if (!billName.trim()) {
      setBillNameError('Bill name is required.');
      return;
    }
    setBillNameError('');
    setSaving(true);

    const { error } = await supabase
      .from('bills')
      .update({ name: billName.trim(), invitation_code: inviteCode })
      .eq('id', id);

    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message || 'Failed to update bill.');
    } else {
      router.back();
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!bill || bill.host_id !== user.id) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Not authorized to edit this bill.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Bill Name */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            <Ionicons name="pencil-outline" size={16} color={colors.primary} /> Bill Details
          </Text>
          <Input
            label="Bill Name *"
            value={billName}
            onChangeText={setBillName}
            placeholder="Bill name"
            error={billNameError}
            autoCapitalize="words"
          />
        </View>

        {/* Invitation Code */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            <Ionicons name="key-outline" size={16} color={colors.primary} /> Invitation Code
          </Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{inviteCode}</Text>
            <TouchableOpacity style={styles.regenBtn} onPress={handleRegenerateCode}>
              <Ionicons name="refresh" size={18} color={colors.primary} />
              <Text style={styles.regenBtnText}>Regenerate</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.codeNote}>
            ⚠️ Regenerating the code will invalidate the old one.
          </Text>
        </View>

        {/* Participants */}
        <View style={styles.card}>
          <View style={styles.participantsHeader}>
            <Text style={styles.cardTitle}>
              <Ionicons name="people-outline" size={16} color={colors.primary} /> Participants
            </Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => setSearchModalVisible(true)}>
              <Ionicons name="person-add-outline" size={16} color={colors.primary} />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {/* Host */}
          <View style={styles.personRow}>
            <View style={[styles.avatar, styles.hostAvatar]}>
              <Text style={[styles.avatarText, styles.hostAvatarText]}>{bill.host.first_name?.[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.personName}>{bill.host.first_name} {bill.host.last_name}</Text>
              <Text style={styles.personUser}>@{bill.host.username}</Text>
            </View>
            <View style={styles.hostTag}><Text style={styles.hostTagText}>Host</Text></View>
          </View>

          {participants.map((p) => (
            <View key={p.id} style={styles.personRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{p.first_name?.[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.personName}>{p.first_name} {p.last_name}</Text>
                <Text style={styles.personUser}>@{p.username}</Text>
              </View>
              <TouchableOpacity onPress={() => handleRemoveParticipant(p.id, p.participantRecordId)}>
                <Ionicons name="close-circle" size={22} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}

          {pendingParticipants.length > 0 && (
            <>
              <Text style={styles.pendingLabel}>Pending</Text>
              {pendingParticipants.map((p) => (
                <View key={p.id} style={styles.personRow}>
                  <View style={[styles.avatar, { backgroundColor: colors.warningLight }]}>
                    <Text style={[styles.avatarText, { color: colors.warning }]}>{p.first_name?.[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.personName}>{p.first_name} {p.last_name}</Text>
                    <Text style={styles.personUser}>@{p.username} · Pending</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveParticipant(p.id, p.participantRecordId)}>
                    <Ionicons name="close-circle" size={22} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}
        </View>

        <Button title="Save Changes" onPress={handleSave} loading={saving} size="lg" style={styles.saveBtn} />
        <Button title="Cancel" onPress={() => router.back()} variant="ghost" />
      </ScrollView>

      {/* Search Modal */}
      <Modal visible={searchModalVisible} transparent animationType="slide" onRequestClose={() => { setSearchModalVisible(false); setSearchQuery(''); setSearchResults([]); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Person</Text>
              <TouchableOpacity onPress={() => { setSearchModalVisible(false); setSearchQuery(''); setSearchResults([]); }}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
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
                {searchLoading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={18} color="#fff" />}
              </TouchableOpacity>
            </View>
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.resultRow} onPress={() => handleAddParticipant(item)} activeOpacity={0.7}>
                  <View style={styles.resultAvatar}>
                    <Text style={styles.resultAvatarText}>{item.first_name?.[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultName}>{item.first_name} {item.last_name}</Text>
                    <Text style={styles.resultUser}>@{item.username}</Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={() => (
                searchQuery && !searchLoading ? <Text style={styles.noResults}>No users found.</Text> : null
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  errorText: { color: colors.error, fontSize: fontSize.md },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.sm },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  codeBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primaryLight, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.xs },
  codeText: { fontSize: fontSize.xl, fontWeight: '800', color: colors.primary, letterSpacing: 4 },
  regenBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  regenBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  codeNote: { fontSize: fontSize.xs, color: colors.warning, fontWeight: '500' },
  participantsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.primaryLight, borderRadius: borderRadius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  addBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  hostAvatar: { backgroundColor: colors.premiumLight },
  avatarText: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary },
  hostAvatarText: { color: colors.premium },
  personName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  personUser: { fontSize: fontSize.xs, color: colors.textSecondary },
  hostTag: { backgroundColor: colors.primaryLight, borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  hostTagText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary },
  pendingLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  saveBtn: { marginBottom: spacing.sm },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  searchBox: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  searchInput: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: borderRadius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: fontSize.md, color: colors.text },
  searchBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  resultAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  resultAvatarText: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary },
  resultName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  resultUser: { fontSize: fontSize.xs, color: colors.textSecondary },
  noResults: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.lg },
});
