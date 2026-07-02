import React, { useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useNotifications } from '../context/NotificationsContext';
import { colors, spacing, fontSize, borderRadius, shadow } from '../constants/theme';

export default function NotificationBell() {
  const { invitations, joinNotifications, loading, refresh, dismissJoinNotification } = useNotifications();
  const [panelVisible, setPanelVisible] = useState(false);
  const [selectedInvite, setSelectedInvite] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const count = invitations.length + joinNotifications.length;

  function openPanel() {
    refresh(); // always fresh when opened
    setPanelVisible(true);
  }

  function openInvite(item) {
    setPanelVisible(false);
    setSelectedInvite(item);
  }

  async function handleAccept() {
    if (!selectedInvite) return;
    setActionLoading(true);
    await supabase
      .from('bill_participants')
      .update({ status: 'accepted' })
      .eq('id', selectedInvite.id);
    setActionLoading(false);
    setSelectedInvite(null);
    refresh();
  }

  async function handleDecline() {
    if (!selectedInvite) return;
    setActionLoading(true);
    await supabase
      .from('bill_participants')
      .delete()
      .eq('id', selectedInvite.id);
    setActionLoading(false);
    setSelectedInvite(null);
    refresh();
  }

  return (
    <>
      {/* ── Bell icon ── */}
      <TouchableOpacity style={styles.bellBtn} onPress={openPanel} activeOpacity={0.7}>
        <Ionicons name="notifications-outline" size={22} color={colors.text} />
        {count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 9 ? '9+' : String(count)}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* ── Notifications Panel ── */}
      <Modal
        visible={panelVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPanelVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setPanelVisible(false)}>
          {/* Stop propagation so tapping inside panel doesn't close it */}
          <Pressable style={styles.panel} onPress={(e) => e.stopPropagation()}>
            {/* Handle bar */}
            <View style={styles.handleBar} />

            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setPanelVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ padding: spacing.xl }} />
            ) : count === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="notifications-off-outline" size={44} color={colors.textLight} />
                <Text style={styles.emptyTitle}>All caught up!</Text>
                <Text style={styles.emptySubtitle}>You have no pending notifications.</Text>
              </View>
            ) : (
              <FlatList
                data={[
                  ...invitations.map((inv) => ({ ...inv, _type: 'invitation' })),
                  ...joinNotifications.map((notif) => ({ ...notif, _type: 'join' })),
                ]}
                keyExtractor={(item) => `${item._type}-${item.id}`}
                style={styles.list}
                renderItem={({ item }) => {
                  if (item._type === 'invitation') {
                    return (
                      <TouchableOpacity
                        style={styles.notifItem}
                        onPress={() => openInvite(item)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.notifIconBox}>
                          <Ionicons name="mail-outline" size={20} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.notifTitle} numberOfLines={1}>
                            {item.bill?.name}
                          </Text>
                          <Text style={styles.notifSub} numberOfLines={1}>
                            From {item.bill?.host?.first_name} {item.bill?.host?.last_name}
                            {' '}(@{item.bill?.host?.username})
                          </Text>
                          <Text style={styles.notifCta}>Tap to accept or decline →</Text>
                        </View>
                        <View style={styles.unreadDot} />
                      </TouchableOpacity>
                    );
                  }
                  // join notification
                  return (
                    <View style={styles.notifItem}>
                      <View style={[styles.notifIconBox, { backgroundColor: colors.successLight }]}>
                        <Ionicons name="person-add-outline" size={20} color={colors.success} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.notifTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.notifSub} numberOfLines={2}>{item.body}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => dismissJoinNotification(item.id)}
                        hitSlop={8}
                        style={{ padding: spacing.xs }}
                      >
                        <Ionicons name="close" size={18} color={colors.textLight} />
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Invite Detail Modal ── */}
      <Modal
        visible={!!selectedInvite}
        transparent
        animationType="fade"
        onRequestClose={() => !actionLoading && setSelectedInvite(null)}
      >
        <View style={styles.inviteOverlay}>
          <View style={styles.inviteCard}>
            <View style={styles.inviteIconBox}>
              <Ionicons name="mail-open-outline" size={36} color={colors.primary} />
            </View>
            <Text style={styles.inviteLabel}>Bill Invitation</Text>
            <Text style={styles.inviteBillName}>{selectedInvite?.bill?.name}</Text>
            <Text style={styles.inviteFrom}>
              Invited by {selectedInvite?.bill?.host?.first_name} {selectedInvite?.bill?.host?.last_name}
            </Text>
            <Text style={styles.inviteUsername}>@{selectedInvite?.bill?.host?.username}</Text>
            <Text style={styles.inviteCode}>Code: {selectedInvite?.bill?.invitation_code}</Text>

            <Text style={styles.inviteQuestion}>Do you want to join this bill?</Text>

            <View style={styles.inviteActions}>
              <TouchableOpacity
                style={styles.declineBtn}
                onPress={handleDecline}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="close" size={18} color="#fff" />
                    <Text style={styles.declineBtnText}>Decline</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={handleAccept}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setSelectedInvite(null)}
              disabled={actionLoading}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  /* Bell */
  bellBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm,
  },
  badge: {
    position: 'absolute', top: 4, right: 4,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.error,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  /* Panel */
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '75%',
    minHeight: 200,
    paddingBottom: spacing.xl,
  },
  handleBar: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  panelHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  panelTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  list: { flex: 1 },

  /* Empty state */
  empty: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.xxl, gap: spacing.sm,
  },
  emptyTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  emptySubtitle: { fontSize: fontSize.sm, color: colors.textSecondary },

  /* Notification item */
  notifItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    gap: spacing.md,
  },
  notifIconBox: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  notifTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  notifSub: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  notifCta: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600', marginTop: 4 },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.primary,
  },

  /* Invite detail modal */
  inviteOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
    padding: spacing.lg,
  },
  inviteCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.xl,
    padding: spacing.xl, width: '100%', maxWidth: 360,
    alignItems: 'center', ...shadow.md,
  },
  inviteIconBox: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  inviteLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs },
  inviteBillName: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: spacing.xs },
  inviteFrom: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  inviteUsername: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  inviteCode: { fontSize: fontSize.xs, color: colors.textLight, marginTop: spacing.xs, marginBottom: spacing.md },
  inviteQuestion: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600', marginBottom: spacing.md },
  inviteActions: { flexDirection: 'row', gap: spacing.sm, width: '100%', marginBottom: spacing.sm },
  declineBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, backgroundColor: colors.error,
    borderRadius: borderRadius.md, paddingVertical: spacing.md,
  },
  declineBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
  acceptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, backgroundColor: colors.success,
    borderRadius: borderRadius.md, paddingVertical: spacing.md,
  },
  acceptBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
  cancelBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.xl },
  cancelBtnText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },
});
