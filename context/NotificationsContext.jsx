import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState([]);
  const [joinNotifications, setJoinNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchInvitations = useCallback(async () => {
    if (!user) {
      setInvitations([]);
      return;
    }
    const { data } = await supabase
      .from('bill_participants')
      .select(`
        id, status,
        bill:bills(id, name, invitation_code, host:profiles!bills_host_id_fkey(id, first_name, last_name, username))
      `)
      .eq('user_id', user.id)
      .eq('status', 'pending');
    setInvitations(data || []);
  }, [user]);

  const fetchJoinNotifications = useCallback(async () => {
    if (!user) {
      setJoinNotifications([]);
      return;
    }
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('read', false)
      .order('created_at', { ascending: false });
    // Silently handle case where notifications table doesn't exist yet
    if (!error) setJoinNotifications(data || []);
  }, [user]);

  async function refresh() {
    setLoading(true);
    await Promise.all([fetchInvitations(), fetchJoinNotifications()]);
    setLoading(false);
  }

  async function dismissJoinNotification(id) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setJoinNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  useEffect(() => {
    refresh();
  }, [fetchInvitations, fetchJoinNotifications]);

  return (
    <NotificationsContext.Provider value={{ invitations, joinNotifications, loading, refresh, dismissJoinNotification }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
