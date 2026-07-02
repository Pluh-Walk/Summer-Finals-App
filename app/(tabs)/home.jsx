import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, Modal, TextInput, RefreshControl, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../constants/theme';

const MAX_BILLS_STANDARD = 5;
const MAX_PERSONS_STANDARD = 3;

function getThisMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  return { start, end };
}

export default function Home() {
  const { user, profile } = useAuth();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null); // { type: 'archive'|'delete', bill }
  const [confirmLoading, setConfirmLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [user])
  );

  async function fetchData() {
    if (!user) return;
    setLoading(true);
    await fetchBills();
    setLoading(false);
  }

  async function fetchBills() {
    const { data } = await supabase
      .from('bills')
      .select(`
        *,
        host:profiles!bills_host_id_fkey(id, first_name, last_name, username),
        bill_participants(id, status, user:profiles(id, first_name, last_name, username))
      `)
      .or(`host_id.eq.${user.id},id.in.(${
        '(SELECT bill_id FROM bill_participants WHERE user_id = \'' + user.id + '\' AND status = \'accepted\')'
      })`)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    // Fetch bills separately for host and participant
    const { data: hostBills } = await supabase
      .from('bills')
      .select(`
        *,
        host:profiles!bills_host_id_fkey(id, first_name, last_name, username),
        bill_participants(id, status, user:profiles(id, first_name, last_name, username))
      `)
      .eq('host_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    const { data: participantBills } = await supabase
      .from('bill_participants')
      .select(`
        bill:bills(
          *,
          host:profiles!bills_host_id_fkey(id, first_name, last_name, username),
          bill_participants(id, status, user:profiles(id, first_name, last_name, username))
        )
      `)
      .eq('user_id', user.id)
      .eq('status', 'accepted');

    const participantBillsList = (participantBills || [])
      .map((p) => p.bill)
      .filter((b) => b && b.status === 'active');

    const combined = [...(hostBills || []), ...participantBillsList];
    const unique = combined.reduce((acc, bill) => {
      if (!acc.find((b) => b.id === bill.id)) acc.push(bill);
      return acc;
    }, []);

    setBills(unique);
  }

  async function handleCreateBill() {
    if (profile?.account_type === 'standard') {
      const { start, end } = getThisMonthRange();
      const { count } = await supabase
        .from('bills')
        .select('id', { count: 'exact', head: true })
        .eq('host_id', user.id)
        .gte('created_at', start)
        .lte('created_at', end);

      if (count >= MAX_BILLS_STANDARD) {
        Alert.alert(
          'Monthly Limit Reached',
          `Standard accounts can create up to ${MAX_BILLS_STANDARD} bills per month. Upgrade to Premium for unlimited bills.`,
          [{ text: 'OK' }]
        );
        return;
      }
    }
    router.push('/bill/create');
  }

  function handleArchiveBill(bill) {
    setConfirmModal({ type: 'archive', bill });
  }

  function handleDeleteBill(bill) {
    setConfirmModal({ type: 'delete', bill });
  }

  async function handleConfirmAction() {
    if (!confirmModal) return;
    setConfirmLoading(true);
    const { type, bill } = confirmModal;
    if (type === 'archive') {
      const { error } = await supabase.from('bills').update({ status: 'archived' }).eq('id', bill.id);
      if (error) Alert.alert('Error', error.message || 'Failed to archive bill.');
    } else {
      const { error } = await supabase.from('bills').delete().eq('id', bill.id);
      if (error) Alert.alert('Error', error.message || 'Failed to delete bill.');
    }
    setConfirmLoading(false);
    setConfirmModal(null);
    fetchData();
  }

  async function handleJoinBill() {
    if (!joinCode.trim()) return;
    setJoinLoading(true);
    const { data: results, error: rpcError } = await supabase.rpc('find_bill_by_invite_code', {
      invite_code: joinCode.trim().toUpperCase(),
    });

    if (rpcError || !results || results.length === 0) {
      Alert.alert('Invalid Code', 'No bill found with this invitation code.');
      setJoinLoading(false);
      return;
    }

    const bill = results[0];

    if (bill.bill_status === 'archived') {
      Alert.alert('Bill Archived', 'This bill has already been archived.');
      setJoinLoading(false);
      return;
    }
    if (bill.bill_host_id === user.id) {
      Alert.alert('You are the host', 'You are already the host of this bill.');
      setJoinLoading(false);
      return;
    }
    const alreadyIn = (bill.participant_user_ids || []).includes(user.id);
    if (alreadyIn) {
      Alert.alert('Already Joined', 'You are already a participant of this bill.');
      setJoinLoading(false);
      return;
    }

    // Check standard limit
    if (profile?.account_type === 'standard') {
      const totalParticipants = (bill.participant_user_ids || []).length + 1; // +1 for host
      if (totalParticipants >= MAX_PERSONS_STANDARD) {
        Alert.alert('Bill Full', 'This bill has reached the maximum number of participants for a Standard account.');
        setJoinLoading(false);
        return;
      }
    }

    await supabase.from('bill_participants').insert({
      bill_id: bill.bill_id, user_id: user.id, status: 'accepted',
    });
    setJoinLoading(false);
    setJoinModalVisible(false);
    setJoinCode('');
    fetchData();
    Alert.alert('Joined!', `You have joined "${bill.bill_name}".`);
  }

  function renderBillCard({ item }) {
    const isHost = item.host_id === user.id;
    const participants = item.bill_participants || [];
    const acceptedCount = participants.filter((p) => p.status === 'accepted').length;

    return (
      <TouchableOpacity
        style={styles.billCard}
        onPress={() => router.push(`/bill/${item.id}`)}
        activeOpacity={0.8}
      >
        <View style={styles.billCardHeader}>
          <View style={styles.billIconBox}>
            <Ionicons name="receipt" size={22} color={colors.primary} />
          </View>
          <View style={styles.billInfo}>
            <Text style={styles.billName} numberOfLines={1}>{item.name}</Text>
            <View style={styles.billMetaRow}>
              {isHost
                ? <><Ionicons name="star" size={11} color={colors.premium} /><Text style={styles.billMeta}> You host</Text></>
                : <><Ionicons name="person-outline" size={11} color={colors.textSecondary} /><Text style={styles.billMeta}> {item.host?.first_name || 'Unknown'}</Text></>
              }
              <Text style={styles.billMetaDot}>  ·  </Text>
              <Ionicons name="people-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.billMeta}> {acceptedCount + 1} people</Text>
            </View>
          </View>
          {isHost && (
            <View style={styles.hostBadge}>
              <Ionicons name="star" size={10} color={colors.primary} />
              <Text style={styles.hostBadgeText}> Host</Text>
            </View>
          )}
        </View>
        <View style={styles.billCardActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push(`/bill/${item.id}`)}
          >
            <Ionicons name="eye" size={15} color={colors.primary} />
            <Text style={styles.actionBtnText}>View</Text>
          </TouchableOpacity>
          {isHost && (
            <>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push(`/bill/edit/${item.id}`)}
              >
                <Ionicons name="pencil" size={15} color={colors.textSecondary} />
                <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleArchiveBill(item)}
              >
                <Ionicons name="archive" size={15} color={colors.warning} />
                <Text style={[styles.actionBtnText, { color: colors.warning }]}>Archive</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleDeleteBill(item)}
              >
                <Ionicons name="trash" size={15} color={colors.error} />
                <Text style={[styles.actionBtnText, { color: colors.error }]}>Delete</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={bills}
        keyExtractor={(item) => item.id}
        renderItem={renderBillCard}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData().then(() => setRefreshing(false)); }} tintColor={colors.primary} />}
        ListHeaderComponent={() => (
          <View style={styles.listHeader}>
            <View style={styles.topBar}>
              <View>
                <Text style={styles.greeting}>Hello, {profile?.first_name || 'there'} 👋</Text>
                <View style={styles.accountBadge}>
                  <Text style={[styles.accountBadgeText, profile?.account_type === 'premium' ? styles.premiumBadge : styles.standardBadge]}>
                    {profile?.account_type === 'premium' ? '⭐ Premium' : 'Standard'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.joinBtn} onPress={() => setJoinModalVisible(true)}>
                <Ionicons name="qr-code" size={16} color={colors.primary} />
                <Text style={styles.joinBtnText}>Join via Code</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sectionRow}>
              <View style={styles.sectionIconRow}>
                <Ionicons name="receipt-outline" size={15} color={colors.text} />
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>My Bills ({bills.length})</Text>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <View style={styles.emptyIconBox}>
              <Ionicons name="receipt-outline" size={44} color={colors.textLight} />
            </View>
            <Text style={styles.emptyTitle}>No bills yet</Text>
            <Text style={styles.emptySubtitle}>Create your first bill or join one with an invitation code.</Text>
          </View>
        )}
        contentContainerStyle={styles.listContent}
      />

      <TouchableOpacity style={styles.fab} onPress={handleCreateBill} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Archive / Delete Confirmation Modal */}
      <Modal
        visible={!!confirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => !confirmLoading && setConfirmModal(null)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Ionicons
              name={confirmModal?.type === 'delete' ? 'trash' : 'archive'}
              size={32}
              color={confirmModal?.type === 'delete' ? colors.error : colors.warning}
            />
            <Text style={styles.confirmTitle}>
              {confirmModal?.type === 'delete' ? 'Delete Bill' : 'Archive Bill'}
            </Text>
            <Text style={styles.confirmMsg}>
              {confirmModal?.type === 'delete'
                ? `Delete "${confirmModal?.bill?.name}"? This cannot be undone.`
                : `Archive "${confirmModal?.bill?.name}"? This marks the bill as settled.`}
            </Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setConfirmModal(null)}
                disabled={confirmLoading}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmActionBtn, confirmModal?.type === 'delete' ? styles.confirmDeleteBtn : styles.confirmArchiveBtn]}
                onPress={handleConfirmAction}
                disabled={confirmLoading}
              >
                {confirmLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.confirmActionText}>
                      {confirmModal?.type === 'delete' ? 'Delete' : 'Archive'}
                    </Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Join via Code Modal */}
      <Modal visible={joinModalVisible} transparent animationType="slide" onRequestClose={() => setJoinModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Join a Bill</Text>
            <Text style={styles.modalSubtitle}>Enter the invitation code shared by the bill host.</Text>
            <TextInput
              style={styles.codeInput}
              value={joinCode}
              onChangeText={(t) => setJoinCode(t.toUpperCase())}
              placeholder="e.g. ABC12345"
              placeholderTextColor={colors.textLight}
              autoCapitalize="characters"
              maxLength={8}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => { setJoinModalVisible(false); setJoinCode(''); }}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={handleJoinBill}
                disabled={joinLoading}
              >
                {joinLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.modalBtnPrimaryText}>Join</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  listContent: { paddingBottom: 100 },
  listHeader: { padding: spacing.md, paddingBottom: 0 },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  greeting: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  accountBadge: { marginTop: spacing.xs },
  accountBadgeText: { fontSize: fontSize.xs, fontWeight: '600', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  premiumBadge: { color: colors.premium, backgroundColor: colors.premiumLight },
  standardBadge: { color: colors.standard, backgroundColor: colors.standardLight },
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.primaryLight, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  joinBtnText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
  section: { marginBottom: spacing.md },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  sectionIconRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  billCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    ...shadow.md,
  },
  billCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  billIconBox: {
    width: 44, height: 44, borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm,
  },
  billInfo: { flex: 1 },
  billName: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  billMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  billMetaDot: { fontSize: fontSize.xs, color: colors.textSecondary },
  billMeta: { fontSize: fontSize.xs, color: colors.textSecondary },
  hostBadge: {
    backgroundColor: colors.primaryLight, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
    flexDirection: 'row', alignItems: 'center',
  },
  hostBadgeText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700' },
  billCardActions: { flexDirection: 'row', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm, backgroundColor: colors.background,
  },
  actionBtnText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.primary },
  inviteCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  inviteBillName: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  inviteHost: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  inviteCode: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600', marginTop: 2 },
  inviteActions: { flexDirection: 'row', gap: spacing.sm, marginLeft: spacing.sm },
  acceptBtn: {
    width: 32, height: 32, borderRadius: borderRadius.full,
    backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center',
  },
  declineBtn: {
    width: 32, height: 32, borderRadius: borderRadius.full,
    backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center',
  },
  empty: { alignItems: 'center', padding: spacing.xxl },
  emptyIconBox: {
    width: 80, height: 80, borderRadius: borderRadius.xl,
    backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md, borderWidth: 1.5, borderColor: colors.border,
  },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  emptySubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  fab: {
    position: 'absolute', bottom: spacing.xl, right: spacing.lg,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface, borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl, padding: spacing.xl, paddingBottom: spacing.xxl,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  modalSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg },
  codeInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: borderRadius.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    fontSize: fontSize.xl, fontWeight: '700', color: colors.text, textAlign: 'center',
    letterSpacing: 4, marginBottom: spacing.lg,
  },
  modalBtns: { flexDirection: 'row', gap: spacing.sm },
  modalBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  modalBtnGhost: { borderWidth: 1.5, borderColor: colors.border },
  modalBtnGhostText: { color: colors.textSecondary, fontWeight: '600' },
  modalBtnPrimary: { backgroundColor: colors.primary },
  modalBtnPrimaryText: { color: '#fff', fontWeight: '600' },
  confirmOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.lg,
  },
  confirmCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.xl,
    padding: spacing.xl, width: '100%', maxWidth: 360,
    alignItems: 'center', ...shadow.md,
  },
  confirmTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginTop: spacing.sm, marginBottom: spacing.xs },
  confirmMsg: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 20 },
  confirmBtns: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  confirmCancelBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
  },
  confirmCancelText: { color: colors.textSecondary, fontWeight: '600' },
  confirmActionBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md, alignItems: 'center',
  },
  confirmArchiveBtn: { backgroundColor: colors.warning },
  confirmDeleteBtn: { backgroundColor: colors.error },
  confirmActionText: { color: '#fff', fontWeight: '700' },
});
