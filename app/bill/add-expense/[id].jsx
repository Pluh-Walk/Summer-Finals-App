import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';
import Input from '../../../components/Input';
import Button from '../../../components/Button';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../constants/theme';

export default function AddExpense() {
  const { id: billId } = useLocalSearchParams();
  const { user } = useAuth();
  const [bill, setBill] = useState(null);
  const [allPersons, setAllPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [expenseName, setExpenseName] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(null);
  const [splitType, setSplitType] = useState('equal'); // 'equal' | 'custom'
  const [selectedForCustom, setSelectedForCustom] = useState([]);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    fetchBill();
  }, [billId]);

  async function fetchBill() {
    const { data } = await supabase
      .from('bills')
      .select(`
        *,
        host:profiles!bills_host_id_fkey(id, first_name, last_name, username),
        bill_participants(id, status, user:profiles(id, first_name, last_name, username))
      `)
      .eq('id', billId)
      .single();

    if (data) {
      setBill(data);
      const host = { id: data.host.id, first_name: data.host.first_name, last_name: data.host.last_name, username: data.host.username };
      const accepted = (data.bill_participants || [])
        .filter((p) => p.status === 'accepted')
        .map((p) => p.user);
      const persons = [host, ...accepted];
      setAllPersons(persons);
      setPaidBy(user.id);
      setSelectedForCustom(persons.map((p) => p.id));
    }
    setLoading(false);
  }

  function validate() {
    const e = {};
    if (!expenseName.trim()) e.expenseName = 'Expense name is required.';
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      e.amount = 'Please enter a valid amount.';
    }
    if (!paidBy) e.paidBy = 'Please select who paid.';
    if (splitType === 'custom' && selectedForCustom.length < 1) {
      e.custom = 'Select at least 1 person for a custom split.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);

    const amountValue = parseFloat(amount);
    const splitPersons = splitType === 'equal' ? allPersons : allPersons.filter((p) => selectedForCustom.includes(p.id));
    const shareAmount = amountValue / splitPersons.length;

    const { data: expense, error } = await supabase
      .from('expenses')
      .insert({
        bill_id: billId,
        name: expenseName.trim(),
        amount: amountValue,
        paid_by: paidBy,
        split_type: splitType,
      })
      .select()
      .single();

    if (error) {
      setSaving(false);
      Alert.alert('Error', error.message || 'Failed to add expense.');
      return;
    }

    // Insert splits
    await supabase.from('expense_splits').insert(
      splitPersons.map((p) => ({
        expense_id: expense.id,
        user_id: p.id,
        share_amount: parseFloat(shareAmount.toFixed(2)),
      }))
    );

    setSaving(false);
    router.back();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const canCustomSplit = true; // always allow custom split

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Bill Info Banner */}
        <View style={styles.billBanner}>
          <Ionicons name="receipt-outline" size={16} color={colors.primary} />
          <Text style={styles.billBannerText}>Bill: {bill?.name}</Text>
        </View>

        {/* Expense Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Expense Details</Text>
          <Input
            label="Expense Name *"
            value={expenseName}
            onChangeText={setExpenseName}
            placeholder="e.g. Dinner, Taxi, Hotel"
            error={errors.expenseName}
            autoCapitalize="words"
          />
          <Input
            label="Amount (₱) *"
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
            error={errors.amount}
          />
        </View>

        {/* Paid By */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Paid By *</Text>
          {errors.paidBy && <Text style={styles.errorText}>{errors.paidBy}</Text>}
          {allPersons.map((person) => (
            <TouchableOpacity
              key={person.id}
              style={[styles.optionRow, paidBy === person.id && styles.selectedRow]}
              onPress={() => setPaidBy(person.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.radioOuter, paidBy === person.id && styles.radioOuterSelected]}>
                {paidBy === person.id && <View style={styles.radioInner} />}
              </View>
              <View style={styles.personAvatar}>
                <Text style={styles.personInitial}>{person.first_name?.[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.personName}>{person.first_name} {person.last_name}</Text>
                <Text style={styles.personUser}>@{person.username}</Text>
              </View>
              {person.id === user.id && <Text style={styles.youTag}>You</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* Split With */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Split With</Text>

          <View style={styles.splitTypeRow}>
            <TouchableOpacity
              style={[styles.splitTypeBtn, splitType === 'equal' && styles.splitTypeBtnActive]}
              onPress={() => setSplitType('equal')}
            >
              <Ionicons name="people" size={16} color={splitType === 'equal' ? '#fff' : colors.primary} />
              <Text style={[styles.splitTypeBtnText, splitType === 'equal' && styles.splitTypeBtnTextActive]}>
                Equal
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.splitTypeBtn, splitType === 'custom' && styles.splitTypeBtnActive]}
              onPress={() => setSplitType('custom')}
            >
              <Ionicons name="options" size={16} color={splitType === 'custom' ? '#fff' : colors.primary} />
              <Text style={[styles.splitTypeBtnText, splitType === 'custom' && styles.splitTypeBtnTextActive]}>
                Custom
              </Text>
            </TouchableOpacity>
          </View>

          {splitType === 'equal' && (
            <>
              <Text style={styles.customHint}>All participants split equally:</Text>
              {allPersons.map((person) => {
                const perPerson = amount && !isNaN(parseFloat(amount)) && allPersons.length > 0
                  ? (parseFloat(amount) / allPersons.length).toFixed(2)
                  : '0.00';
                return (
                  <View key={person.id} style={[styles.optionRow, styles.selectedRow]}>
                    <View style={[styles.checkbox, styles.checkboxSelected]}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                    <View style={styles.personAvatar}>
                      <Text style={styles.personInitial}>{person.first_name?.[0]?.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.personName}>{person.first_name} {person.last_name}</Text>
                    </View>
                    <Text style={styles.shareText}>₱{perPerson}</Text>
                  </View>
                );
              })}
            </>
          )}

          {splitType === 'custom' && (
            <>
              <Text style={styles.customHint}>Select which persons share this expense:</Text>
              {errors.custom && <Text style={styles.errorText}>{errors.custom}</Text>}
              {allPersons.map((person) => {
                const isSelected = selectedForCustom.includes(person.id);
                const selectedCount = selectedForCustom.length;
                const perPerson = amount && !isNaN(parseFloat(amount)) && selectedCount > 0
                  ? (parseFloat(amount) / selectedCount).toFixed(2)
                  : '0.00';
                return (
                  <TouchableOpacity
                    key={person.id}
                    style={[styles.optionRow, isSelected && styles.selectedRow]}
                    onPress={() => {
                      setSelectedForCustom((prev) =>
                        isSelected ? prev.filter((id) => id !== person.id) : [...prev, person.id]
                      );
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <View style={styles.personAvatar}>
                      <Text style={styles.personInitial}>{person.first_name?.[0]?.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.personName}>{person.first_name} {person.last_name}</Text>
                    </View>
                    {isSelected && <Text style={styles.shareText}>₱{perPerson}</Text>}
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </View>

        <Button title="Add Expense" onPress={handleSave} loading={saving} size="lg" style={styles.saveBtn} />
        <Button title="Cancel" onPress={() => router.back()} variant="ghost" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  billBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.primaryLight, borderRadius: borderRadius.md,
    padding: spacing.sm, marginBottom: spacing.md,
  },
  billBannerText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.sm },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  errorText: { fontSize: fontSize.xs, color: colors.error, marginBottom: spacing.sm },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xs, marginBottom: spacing.xs,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  selectedRow: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOuterSelected: { borderColor: colors.primary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  personAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  personInitial: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  personName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  personUser: { fontSize: fontSize.xs, color: colors.textSecondary },
  youTag: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary, backgroundColor: colors.primaryLight, borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  splitTypeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  splitTypeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    borderWidth: 1.5, borderColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
  },
  splitTypeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  splitTypeBtnDisabled: { borderColor: colors.border },
  splitTypeBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
  splitTypeBtnTextActive: { color: '#fff' },
  splitInfo: { backgroundColor: colors.successLight, borderRadius: borderRadius.md, padding: spacing.sm },
  splitInfoText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.success, textAlign: 'center' },
  customHint: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm },
  checkbox: { width: 22, height: 22, borderRadius: borderRadius.sm, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  shareText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  customDisabledNote: { fontSize: fontSize.xs, color: colors.textSecondary, fontStyle: 'italic', marginTop: spacing.xs },
  saveBtn: { marginBottom: spacing.sm },
});
