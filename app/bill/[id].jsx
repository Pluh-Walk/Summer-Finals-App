import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Share, Modal,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../constants/theme';

function calculateSettlements(allPersons, expenses) {
  const balance = {};
  allPersons.forEach((p) => { balance[p.id] = 0; });

  expenses.forEach((expense) => {
    if (balance[expense.paid_by] !== undefined) {
      balance[expense.paid_by] += parseFloat(expense.amount) || 0;
    }
    (expense.expense_splits || []).forEach((split) => {
      if (balance[split.user_id] !== undefined) {
        balance[split.user_id] -= parseFloat(split.share_amount) || 0;
      }
    });
  });

  const debtors = Object.entries(balance).filter(([, v]) => v < -0.01).sort(([, a], [, b]) => a - b);
  const creditors = Object.entries(balance).filter(([, v]) => v > 0.01).sort(([, a], [, b]) => b - a);
  const settlements = [];

  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debt = Math.min(-debtors[i][1], creditors[j][1]);
    settlements.push({ fromId: debtors[i][0], toId: creditors[j][0], amount: debt });
    debtors[i] = [debtors[i][0], debtors[i][1] + debt];
    creditors[j] = [creditors[j][0], creditors[j][1] - debt];
    if (Math.abs(debtors[i][1]) < 0.01) i++;
    if (Math.abs(creditors[j][1]) < 0.01) j++;
  }
  return settlements;
}

export default function BillDetail() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const [bill, setBill] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removeTarget, setRemoveTarget] = useState(null); // { bpId, name }
  const [removeLoading, setRemoveLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchBillData();
    }, [id])
  );

  async function fetchBillData() {
    setLoading(true);
    const [billRes, expensesRes] = await Promise.all([
      supabase
        .from('bills')
        .select(`
          *,
          host:profiles!bills_host_id_fkey(id, first_name, last_name, username),
          bill_participants(id, status, user:profiles(id, first_name, last_name, username))
        `)
        .eq('id', id)
        .single(),
      supabase
        .from('expenses')
        .select(`
          *,
          payer:profiles!expenses_paid_by_fkey(id, first_name, last_name, username),
          expense_splits(id, user_id, share_amount, participant:profiles(id, first_name, last_name))
        `)
        .eq('bill_id', id)
        .order('created_at', { ascending: false }),
    ]);

    setBill(billRes.data);
    setExpenses(expensesRes.data || []);
    setLoading(false);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!bill) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Bill not found.</Text>
      </View>
    );
  }

  const isHost = bill.host_id === user.id;
  const isArchived = bill.status === 'archived';
  const acceptedParticipants = (bill.bill_participants || []).filter((p) => p.status === 'accepted');
  const allPersons = [
    { id: bill.host.id, first_name: bill.host.first_name, last_name: bill.host.last_name, username: bill.host.username, bpId: null },
    ...acceptedParticipants.map((p) => ({ ...p.user, bpId: p.id })),
  ];

  const totalAmount = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const settlements = calculateSettlements(allPersons, expenses);

  function getPersonName(id) {
    const p = allPersons.find((p) => p.id === id);
    return p ? `${p.first_name} ${p.last_name}` : 'Unknown';
  }

  async function handleShareCode() {
    await Share.share({
      message: `Join my bill "${bill.name}" on BillSplitts!\nUse invitation code: ${bill.invitation_code}`,
    });
  }

  async function handleRemoveParticipant() {
    if (!removeTarget) return;
    setRemoveLoading(true);
    const { error } = await supabase.from('bill_participants').delete().eq('id', removeTarget.bpId);
    setRemoveLoading(false);
    setRemoveTarget(null);
    if (error) Alert.alert('Error', error.message || 'Failed to remove participant.');
    else fetchBillData();
  }

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Bill Info Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={styles.billIconBox}>
            <Text style={styles.billIcon}>{isArchived ? '📦' : '🧾'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.billName}>{bill.name}</Text>
            <Text style={styles.billHost}>
              Host: {bill.host.first_name} {bill.host.last_name}
            </Text>
          </View>
          {isArchived && (
            <View style={styles.archivedBadge}>
              <Text style={styles.archivedText}>Archived</Text>
            </View>
          )}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>₱{totalAmount.toFixed(2)}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{expenses.length}</Text>
            <Text style={styles.statLabel}>Expenses</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{allPersons.length}</Text>
            <Text style={styles.statLabel}>People</Text>
          </View>
        </View>

        {/* Invitation Code */}
        <TouchableOpacity style={styles.codeRow} onPress={handleShareCode} activeOpacity={0.7}>
          <Ionicons name="key-outline" size={16} color={colors.primary} />
          <Text style={styles.codeLabel}>Code: </Text>
          <Text style={styles.codeValue}>{bill.invitation_code}</Text>
          <Ionicons name="share-outline" size={16} color={colors.primary} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        {/* Actions */}
        {isHost && !isArchived && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => router.push(`/bill/edit/${id}`)}>
              <Ionicons name="pencil-outline" size={15} color={colors.primary} />
              <Text style={styles.actionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push(`/bill/add-expense/${id}`)}
            >
              <Ionicons name="add-circle-outline" size={15} color={colors.success} />
              <Text style={[styles.actionText, { color: colors.success }]}>Add Expense</Text>
            </TouchableOpacity>
          </View>
        )}
        {!isHost && !isArchived && (
          <TouchableOpacity
            style={[styles.actionBtn, { alignSelf: 'flex-start' }]}
            onPress={() => router.push(`/bill/add-expense/${id}`)}
          >
            <Ionicons name="add-circle-outline" size={15} color={colors.success} />
            <Text style={[styles.actionText, { color: colors.success }]}>Add Expense</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Participants */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          <Ionicons name="people-outline" size={15} color={colors.primary} /> Participants ({allPersons.length})
        </Text>
        {allPersons.map((person) => (
          <View key={person.id} style={styles.personRow}>
            <View style={[styles.personAvatar, person.id === bill.host.id && styles.hostAvatar]}>
              <Text style={[styles.personInitial, person.id === bill.host.id && styles.hostInitial]}>
                {person.first_name?.[0]?.toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.personName}>{person.first_name} {person.last_name}</Text>
              <Text style={styles.personUser}>@{person.username}</Text>
            </View>
            {person.id === bill.host.id ? (
              <View style={styles.hostTag}>
                <Text style={styles.hostTagText}>Host</Text>
              </View>
            ) : (isHost && !isArchived ? (
              <TouchableOpacity
                style={styles.removeParticipantBtn}
                onPress={() => setRemoveTarget({ bpId: person.bpId, name: `${person.first_name} ${person.last_name}` })}
              >
                <Ionicons name="person-remove-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            ) : null)}
          </View>
        ))}

        {/* Pending invitations shown to host */}
        {isHost && (bill.bill_participants || []).some((p) => p.status === 'pending') && (
          <View style={styles.pendingSection}>
            <Text style={styles.pendingTitle}>Pending Invitations</Text>
            {(bill.bill_participants || []).filter((p) => p.status === 'pending').map((p) => (
              <View key={p.id} style={styles.pendingRow}>
                <View style={styles.personAvatar}>
                  <Text style={styles.personInitial}>{p.user?.first_name?.[0]?.toUpperCase()}</Text>
                </View>
                <Text style={styles.pendingName}>{p.user?.first_name} {p.user?.last_name}</Text>
                <Text style={styles.pendingBadge}>Pending</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Expenses */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          <Ionicons name="receipt-outline" size={15} color={colors.primary} /> Expenses
        </Text>
        {expenses.length === 0 ? (
          <View style={styles.noData}>
            <Text style={styles.noDataIcon}>📋</Text>
            <Text style={styles.noDataText}>No details — no expenses added yet.</Text>
          </View>
        ) : (
          expenses.map((expense) => (
            <View key={expense.id} style={styles.expenseRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.expenseName}>{expense.name}</Text>
                <Text style={styles.expenseMeta}>
                  Paid by {expense.payer?.first_name} · {expense.split_type === 'equal' ? 'Split equally' : 'Custom split'}
                </Text>
                <View style={styles.splitChips}>
                  {(expense.expense_splits || []).map((split) => (
                    <View key={split.id} style={styles.splitChip}>
                      <Text style={styles.splitChipText}>
                        {split.participant?.first_name}: ₱{parseFloat(split.share_amount).toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
              <Text style={styles.expenseAmount}>₱{parseFloat(expense.amount).toFixed(2)}</Text>
            </View>
          ))
        )}
      </View>

      {/* Settlement Summary */}
      {expenses.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            <Ionicons name="swap-horizontal-outline" size={15} color={colors.success} /> Settlement Summary
          </Text>
          {settlements.length === 0 ? (
            <View style={styles.settledBox}>
              <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              <Text style={styles.settledText}>All settled! No payments needed.</Text>
            </View>
          ) : (
            settlements.map((s, i) => (
              <View key={i} style={styles.settlementRow}>
                <Text style={styles.settlementText}>
                  <Text style={styles.debtor}>{getPersonName(s.fromId)}</Text>
                  {' owes '}
                  <Text style={styles.creditor}>{getPersonName(s.toId)}</Text>
                </Text>
                <Text style={styles.settlementAmount}>₱{s.amount.toFixed(2)}</Text>
              </View>
            ))
          )}
        </View>
      )}
    </ScrollView>

      {/* Remove Participant Confirmation Modal */}
      <Modal visible={!!removeTarget} transparent animationType="fade" onRequestClose={() => setRemoveTarget(null)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Ionicons name="person-remove-outline" size={32} color={colors.error} style={{ marginBottom: spacing.sm }} />
            <Text style={styles.confirmTitle}>Remove Participant</Text>
            <Text style={styles.confirmBody}>
              Remove <Text style={{ fontWeight: '700' }}>{removeTarget?.name}</Text> from this bill?
              {' '}Their existing expense contributions will remain.{"\n"}
            </Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.confirmBtnSecondary} onPress={() => setRemoveTarget(null)} disabled={removeLoading}>
                <Text style={styles.confirmBtnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtnDanger} onPress={handleRemoveParticipant} disabled={removeLoading}>
                <Text style={styles.confirmBtnDangerText}>{removeLoading ? 'Removing...' : 'Remove'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  errorText: { color: colors.error, fontSize: fontSize.md },
  heroCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.md, ...shadow.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  billIconBox: {
    width: 52, height: 52, borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  billIcon: { fontSize: 26 },
  billName: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  billHost: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  archivedBadge: {
    backgroundColor: colors.standardLight, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  archivedText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary },
  statsRow: {
    flexDirection: 'row', backgroundColor: colors.background,
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: colors.border },
  codeRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.primaryLight, borderRadius: borderRadius.md,
    padding: spacing.sm + 2, marginBottom: spacing.sm,
  },
  codeLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  codeValue: { fontSize: fontSize.sm, fontWeight: '800', color: colors.primary, letterSpacing: 2 },
  actionRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.primaryLight, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  actionText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
  card: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.md, ...shadow.sm,
  },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  personAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  hostAvatar: { backgroundColor: colors.premiumLight },
  personInitial: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary },
  hostInitial: { color: colors.premium },
  personName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  personUser: { fontSize: fontSize.xs, color: colors.textSecondary },
  hostTag: {
    backgroundColor: colors.primaryLight, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  hostTagText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary },
  pendingSection: { marginTop: spacing.md },
  pendingTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  pendingName: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  pendingBadge: { fontSize: fontSize.xs, color: colors.warning, fontWeight: '600', backgroundColor: colors.warningLight, borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  noData: { alignItems: 'center', padding: spacing.lg },
  noDataIcon: { fontSize: 32, marginBottom: spacing.sm },
  noDataText: { fontSize: fontSize.sm, color: colors.textSecondary, fontStyle: 'italic' },
  expenseRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  expenseName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  expenseMeta: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  splitChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  splitChip: {
    backgroundColor: colors.primaryLight, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  splitChipText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '500' },
  expenseAmount: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginLeft: spacing.sm },
  settledBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.successLight, borderRadius: borderRadius.md },
  settledText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.success },
  settlementRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  settlementText: { fontSize: fontSize.sm, color: colors.text, flex: 1 },
  debtor: { fontWeight: '700', color: colors.error },
  creditor: { fontWeight: '700', color: colors.success },
  settlementAmount: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  removeParticipantBtn: { padding: spacing.xs },
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  confirmCard: { backgroundColor: colors.surface, borderRadius: borderRadius.xl, padding: spacing.xl, width: '100%', maxWidth: 360, alignItems: 'center', ...shadow.lg },
  confirmTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  confirmBody: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 20 },
  confirmBtns: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  confirmBtnSecondary: { flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  confirmBtnSecondaryText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  confirmBtnDanger: { flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md, backgroundColor: colors.error, alignItems: 'center' },
  confirmBtnDangerText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },
});
